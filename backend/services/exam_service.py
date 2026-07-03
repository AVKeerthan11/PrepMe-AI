"""
CBSE Mock Exam Generation Service
Generates full 80-mark CBSE-pattern exam papers using RAG + Groq
"""
import os
import re
import json
import random
import asyncio
import traceback
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from services.rag_service import retrieve, groq_chat, get_or_build_index
from config import get_settings

settings = get_settings()

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Chapter lists per subject ──────────────────────────────────────────────────
SUBJECT_CHAPTERS = {
    "science": [
        "Exploring the Investigative World of Science",
        "The Invisible Living World: Beyond Our Naked Eye",
        "Health: The Ultimate Treasure",
        "Electricity: Magnetic and Heating Effects",
        "Exploring Forces",
        "Pressure, Winds, Storms, and Cyclones",
        "Particulate Nature of Matter",
        "Nature of Matter: Elements, Compounds, and Mixtures",
        "The Amazing World of Solutes, Solvents, and Solutions",
        "Light: Mirrors and Lenses",
        "Keeping Time with the Skies",
    ],
    "mathematics": [
        "Rational Numbers",
        "Linear Equations in One Variable",
        "Understanding Quadrilaterals",
        "Practical Geometry",
        "Data Handling",
        "Squares and Square Roots",
        "Cubes and Cube Roots",
        "Comparing Quantities",
        "Algebraic Expressions and Identities",
        "Mensuration",
        "Exponents and Powers",
        "Direct and Inverse Proportions",
        "Factorisation",
        "Introduction to Graphs",
    ],
    "social studies": [
        "Natural Resources and Their Conservation",
        "Reshaping India's Political Map",
        "The Rise of the Marathas",
        "The Colonial Era in India",
        "Universal Franchise and India's Electoral System",
        "The Parliamentary System: Legislature and Executive",
        "Factors of Production",
    ],
    "english": [
        "The Wit that Won Hearts",
        "A Concrete Example",
        "Wisdom Paves the Way",
        "A Tale of Valour: Major Somnath Sharma and the Battle of Badgam",
        "Somebody's Mother",
        "Verghese Kurien: I Too Had A Dream",
        "The Case of the Fifth Word",
        "The Magic Brush of Dreams",
        "Spectacular Wonders",
        "The Cherry Tree",
        "Harvest Hymn",
        "Waiting for the Rain",
        "Feathered Friend",
        "Magnifying Glass",
        "Bibha Chowdhuri: The Beam of Light that Lit the Path for Women in Indian Science",
    ],
}


def get_chapters_for_subject(subject: str) -> list:
    """Return full chapter list for a subject."""
    return SUBJECT_CHAPTERS.get(subject.lower(), SUBJECT_CHAPTERS["science"])


# NEW: Scoped chapter retrieval — supports first_half, second_half, full
def get_scoped_chapters(subject: str, scope: str = "full") -> list:
    """
    Return a subset of chapters based on syllabus scope.
    scope values: "full" | "first_half" | "second_half"
    """
    chapters = get_chapters_for_subject(subject)
    mid = len(chapters) // 2
    if scope == "first_half":
        return chapters[:mid]
    elif scope == "second_half":
        return chapters[mid:]
    else:  # "full" or any unrecognised value
        return chapters


# ── PDF resolution ─────────────────────────────────────────────────────────────
def _resolve_pdf(subject: str) -> str:
    s = subject.lower()
    if s == "mathematics":
        raw = os.getenv("PDF_MATHS_PATH", "ncert_maths_8.pdf")
    elif s in ("social studies", "social"):
        raw = os.getenv("PDF_SOCIAL_PATH", "ncert_social_8.pdf")
    elif s == "english":
        raw = os.getenv("PDF_ENGLISH_PATH", "ncert_english_8.pdf")
    else:
        raw = os.getenv("PDF_SCIENCE_PATH", "ncert_science_8.pdf")
    if os.path.isabs(raw):
        return raw
    return os.path.abspath(os.path.join(_PROJECT_ROOT, raw))


# ── CBSE Exam Patterns ─────────────────────────────────────────────────────────
CBSE_PATTERNS = {
    "Science": [
        {"name": "Section A", "type": "MCQ",       "questions": 10, "marks_each": 1,
         "includes_ar": 2, "instructions": "Multiple Choice Questions (includes 2 Assertion-Reason)"},
        {"name": "Section B", "type": "VSA",       "questions": 4,  "marks_each": 2,
         "instructions": "Very Short Answer questions (2 marks each)"},
        {"name": "Section C", "type": "SA",        "questions": 3,  "marks_each": 3,
         "instructions": "Short Answer questions (3 marks each)"},
        {"name": "Section D", "type": "CaseStudy", "questions": 2,  "marks_each": 4,
         "instructions": "Case-Based questions. Read the passage and answer sub-questions."},
    ],
    "Mathematics": [
        {"name": "Section A", "type": "MCQ",       "questions": 10, "marks_each": 1,
         "includes_ar": 2, "instructions": "Multiple Choice Questions (includes 2 Assertion-Reason)"},
        {"name": "Section B", "type": "VSA",       "questions": 4,  "marks_each": 2,
         "instructions": "Very Short Answer questions (2 marks each)"},
        {"name": "Section C", "type": "SA",        "questions": 3,  "marks_each": 3,
         "instructions": "Short Answer questions (3 marks each)"},
        {"name": "Section D", "type": "CaseStudy", "questions": 2,  "marks_each": 4,
         "instructions": "Case Study questions with sub-parts"},
    ],
    "Social Studies": [
        {"name": "Section A", "type": "MCQ",       "questions": 10, "marks_each": 1,
         "includes_ar": 0, "instructions": "Multiple Choice Questions (1 mark each)"},
        {"name": "Section B", "type": "VSA",       "questions": 4,  "marks_each": 2,
         "instructions": "Very Short Answer questions (2 marks each)"},
        {"name": "Section C", "type": "SA",        "questions": 3,  "marks_each": 3,
         "instructions": "Short Answer questions (3 marks each)"},
        {"name": "Section D", "type": "CaseStudy", "questions": 2,  "marks_each": 4,
         "instructions": "Case Study questions (4 marks each)"},
    ],
    "English": [
        {"name": "Section A", "type": "Reading",    "questions": 2, "marks_each": 10,
         "instructions": "Reading Comprehension (2 passages, 5 questions each)"},
        {"name": "Section B", "type": "Writing",    "questions": 3, "marks_each": 0,
         "instructions": "Writing and Grammar"},
        {"name": "Section C", "type": "Literature", "questions": 3, "marks_each": 0,
         "instructions": "Literature questions"},
    ],
}


# ── JSON extraction helpers ────────────────────────────────────────────────────
def _debug_label(section_name: str, stage: str) -> str:
    return f"[exam:{section_name}:{stage}]"


def _clean_raw_output(raw: str) -> str:
    text = raw if isinstance(raw, str) else str(raw)
    return re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE).strip()


def _log_raw_response(section_name: str, stage: str, raw: str) -> None:
    print(f"\n========== RAW RESPONSE [{section_name} | {stage}] ==========")
    print(raw[:3000] if isinstance(raw, str) else str(raw)[:3000])
    print("\n=================================\n")


def _extract_json(raw: str, section_name: str = "unknown", stage: str = "parsing"):
    text = _clean_raw_output(raw)
    try:
        return json.loads(text)
    except Exception:
        pass
    array_match = re.search(r"\[[\s\S]*\]", text)
    if array_match:
        try:
            return json.loads(array_match.group(0))
        except Exception:
            pass
    object_match = re.search(r"\{[\s\S]*\}", text)
    if object_match:
        try:
            return json.loads(object_match.group(0))
        except Exception:
            pass
    print(f"\n[ERROR] {_debug_label(section_name, stage)} JSON parsing failed")
    print(text[:3000])
    return None


def _validate_required_keys(item: dict, required_keys: list, section_name: str, stage: str, index: int) -> bool:
    missing = [key for key in required_keys if key not in item or item[key] in (None, "")]
    if missing:
        print(f"[ERROR] {_debug_label(section_name, stage)} item {index + 1} missing keys: {', '.join(missing)}")
        return False
    return True


def _validate_generated_list(data, expected_count: int, section_name: str, stage: str, item_validator=None) -> bool:
    if not isinstance(data, list):
        print(f"[ERROR] {_debug_label(section_name, stage)} expected list, got {type(data).__name__}")
        return False
    if len(data) < expected_count:
        print(f"[ERROR] {_debug_label(section_name, stage)} expected {expected_count} items, got {len(data)}")
        return False
    if len(data) > expected_count:
    # Trim silently — take only what we need
        del data[expected_count:]
    for index, item in enumerate(data):
        if not isinstance(item, dict):
            print(f"[ERROR] {_debug_label(section_name, stage)} item {index + 1} is {type(item).__name__}")
            return False
        if item_validator and not item_validator(item, section_name, stage, index):
            return False
    return True


def _validate_mcq_item(item: dict, section_name: str, stage: str, index: int) -> bool:
    if item.get("type") == "assertion_reason":
        return _validate_required_keys(item, ["assertion", "reason", "options", "correct"], section_name, stage, index)
    return _validate_required_keys(item, ["question", "options", "correct"], section_name, stage, index)


def _validate_short_item(item: dict, section_name: str, stage: str, index: int) -> bool:
    return _validate_required_keys(item, ["question", "correct_answer"], section_name, stage, index)


def _validate_case_item(item: dict, section_name: str, stage: str, index: int) -> bool:
    if not _validate_required_keys(item, ["passage", "sub_questions"], section_name, stage, index):
        return False
    if not isinstance(item.get("sub_questions"), list):
        print(f"[ERROR] {_debug_label(section_name, stage)} item {index + 1} sub_questions must be list")
        return False
    return True


def _validate_english_item(item: dict, section_name: str, stage: str, index: int) -> bool:
    item_type = item.get("type")
    if not _validate_required_keys(item, ["type"], section_name, stage, index):
        return False
    if item_type == "reading":
        if not _validate_required_keys(item, ["passage", "sub_questions", "section"], section_name, stage, index):
            return False
        return isinstance(item.get("sub_questions"), list)
    if item_type == "grammar":
        if not _validate_required_keys(item, ["questions", "section"], section_name, stage, index):
            return False
        return isinstance(item.get("questions"), list)
    if item_type in ("letter", "paragraph"):
        return _validate_required_keys(item, ["prompt", "sample_answer", "section"], section_name, stage, index)
    if item_type == "rtc":
        if not _validate_required_keys(item, ["extracts", "section"], section_name, stage, index):
            return False
        return isinstance(item.get("extracts"), list)
    if item_type in ("short_answer", "long_answer"):
        if not _validate_required_keys(item, ["questions", "section"], section_name, stage, index):
            return False
        return isinstance(item.get("questions"), list)
    return True


def _groq_generate_json(prompt: str, section_name: str, stage: str, expected_count: int, temperature: float, item_validator=None):
    for attempt in range(2):
        current_temperature = temperature if attempt == 0 else max(0.1, temperature - 0.3)
        attempt_label = f"attempt {attempt + 1}/2"
        print(f"[exam:{section_name}:{stage}] {attempt_label} temperature={current_temperature}")
        try:
            raw = groq_chat(
    [{"role": "user", "content": prompt}],
    temperature=current_temperature,
    max_tokens=6000,
)
            _log_raw_response(section_name, stage, raw)
            data = _extract_json(raw, section_name, stage)
            if _validate_generated_list(data, expected_count, section_name, stage, item_validator):
                return data
            print(f"[exam:{section_name}:{stage}] validation failed on {attempt_label}")
        except Exception:
            print(f"\n[ERROR] {_debug_label(section_name, stage)} generation {attempt_label} failed")
            traceback.print_exc()
    return []


# ── Context builder — now uses scoped chapters ────────────────────────────────
def _get_context_for_section(
    subject: str,
    pdf_path: str,
    section_name: str,
    topic_filter: Optional[str] = None,
    chunks_per_chapter: int = 2,
    max_total_chunks: int = 12,
    context_char_limit: int = 4000,
    syllabus_scope: str = "full",          # NEW parameter
) -> str:
    """
    Build context for a single exam section.
    Uses get_scoped_chapters() so only the selected half/full syllabus is covered.
    """
    if topic_filter:
        chunks = retrieve(topic_filter, pdf_path, top_k=max_total_chunks, subject=subject.lower())
        random.shuffle(chunks)
        return "\n\n".join(c["text"] for c in chunks[:max_total_chunks])

    # NEW: use scoped chapters instead of full chapter list
    chapter_list = get_scoped_chapters(subject, syllabus_scope)

    shuffled_chapters = chapter_list.copy()
    random.shuffle(shuffled_chapters)

    all_chunks = []
    for chapter in shuffled_chapters:
        chapter_chunks = retrieve(chapter, pdf_path, top_k=chunks_per_chapter, subject=subject.lower())
        if len(chapter_chunks) > chunks_per_chapter:
            start = random.randint(0, len(chapter_chunks) - chunks_per_chapter)
            chapter_chunks = chapter_chunks[start:start + chunks_per_chapter]
        all_chunks.extend(chapter_chunks)

    random.shuffle(all_chunks)

    if len(all_chunks) > max_total_chunks:
        all_chunks = random.sample(all_chunks, max_total_chunks)

    context = "\n\n".join(c["text"] for c in all_chunks)
    return context[:context_char_limit]


# ── Section generators ─────────────────────────────────────────────────────────

def _gen_mcq_section(section: dict, context: str, subject: str) -> list:
    n_std = section["questions"] - section.get("includes_ar", 0)
    n_ar  = section.get("includes_ar", 0)

    def _build_prompt(question_type: str, batch_size: int) -> str:
        if question_type == "standard":
            return (
                f"Generate {batch_size} CBSE Class 8 {subject} standard MCQs based ONLY on this textbook content.\n\n"
                f"CONTENT:\n{context[:2000]}\n\n"
                "IMPORTANT: Generate questions from DIFFERENT chapters and topics. Do not repeat similar questions.\n\n"
                "For each standard MCQ return:\n"
                '{"type":"mcq","question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":"...","bloom_level":"Remember","marks":1}\n\n'
                f"Return a JSON array of exactly {batch_size} standard MCQ objects. No markdown fences."
            )
        return (
            f"Generate {batch_size} CBSE Class 8 {subject} Assertion-Reason questions based ONLY on this textbook content.\n\n"
            f"CONTENT:\n{context[:2000]}\n\n"
            "IMPORTANT: Generate questions from DIFFERENT chapters and topics. Do not repeat similar questions.\n\n"
            "For each Assertion-Reason return:\n"
            '{"type":"assertion_reason","assertion":"...","reason":"...","options":["A) Both A and R are true and R is the correct explanation of A","B) Both A and R are true but R is not the correct explanation of A","C) A is true but R is false","D) A is false but R is true"],"correct":"A","explanation":"...","bloom_level":"Analyse","marks":1}\n\n'
            f"Return a JSON array of exactly {batch_size} Assertion-Reason objects. No markdown fences."
        )

    questions = []
    std_remaining = n_std
    std_batch = 1
    while std_remaining > 0:
        batch_size = min(5, std_remaining)
        batch = _groq_generate_json(_build_prompt("standard", batch_size), section["name"], f"mcq-standard-batch-{std_batch}", batch_size, 0.7, _validate_mcq_item)
        if not batch:
            return []
        for q in batch:
            q["section"] = section["name"]
            q["marks"] = section["marks_each"]
            q["source_pages"] = "—"
        questions.extend(batch)
        std_remaining -= batch_size
        std_batch += 1

    ar_remaining = n_ar
    ar_batch = 1
    while ar_remaining > 0:
        batch_size = min(5, ar_remaining)
        batch = _groq_generate_json(_build_prompt("assertion_reason", batch_size), section["name"], f"mcq-assertion-batch-{ar_batch}", batch_size, 0.7, _validate_mcq_item)
        if not batch:
            return []
        for q in batch:
            q["section"] = section["name"]
            q["marks"] = section["marks_each"]
            q["source_pages"] = "—"
        questions.extend(batch)
        ar_remaining -= batch_size
        ar_batch += 1

    return questions


def _gen_short_section(section: dict, context: str, subject: str) -> list:
    type_label = {
        "VSA": "Very Short Answer (2 marks, ~30 words each)",
        "SA":  "Short Answer (3 marks, ~60 words each)",
        "LA":  "Long Answer (5 marks, ~120 words each)",
        "Map": "Map-based descriptive question (identify and describe the significance of a location)",
    }.get(section["type"], section["type"])

    prompt = (
        f"Generate {section['questions']} CBSE Class 8 {subject} {type_label} questions "
        f"based ONLY on this textbook content.\n\n"
        f"CONTENT:\n{context[:3000]}\n\n"
        "IMPORTANT: Generate questions from DIFFERENT chapters and topics. Do not repeat similar questions.\n\n"
        "For each question return:\n"
        '{"type":"' + section["type"].lower() + '","question":"...","correct_answer":"...","hint":"...","bloom_level":"Apply","marks":' + str(section["marks_each"]) + '}\n\n'
        f"Return a JSON array of exactly {section['questions']} objects. No markdown fences."
    )
    data = _groq_generate_json(prompt, section["name"], "short-section", section["questions"], 0.6, _validate_short_item)
    if not data:
        return []
    for q in data:
        q["section"] = section["name"]
        q["marks"] = section["marks_each"]
        q["source_pages"] = "—"
    return data


def _gen_case_study_section(section: dict, context: str, subject: str) -> list:
    section_name = section["name"]
    all_questions = []
    
    # Generate ONE case study at a time to avoid truncation
    for i in range(section["questions"]):
        prompt = (
            f"Generate exactly 1 CBSE Class 8 {subject} Case Study question "
            f"based ONLY on this textbook content.\n\n"
            f"CONTENT:\n{context[:2000]}\n\n"
            "The case study must have a short passage (80-100 words) and exactly 4 sub-questions.\n\n"
            f"Return a JSON array containing exactly 1 object:\n"
            f'[{{"type":"case_study","passage":"80-100 word passage","sub_questions":'
            f'[{{"question":"...","marks":1,"correct_answer":"..."}},'
            f'{{"question":"...","marks":1,"correct_answer":"..."}},'
            f'{{"question":"...","marks":1,"correct_answer":"..."}},'
            f'{{"question":"...","marks":1,"correct_answer":"..."}}],'
            f'"section":"{section_name}","marks":4,"source_pages":"—","bloom_level":"Analyse"}}]\n\n'
            f"Return ONLY the JSON array. No markdown fences. No extra text."
        )
        
        batch = _groq_generate_json(
            prompt,
            section_name,
            f"case-study-{i+1}",
            1,
            0.6,
            _validate_case_item,
        )
        
        if batch:
            q = batch[0]
            q["section"] = section_name
            q["marks"] = section["marks_each"]
            q["source_pages"] = "—"
            all_questions.append(q)
        else:
            # Add fallback for this single question
            all_questions.append({
                "section": section_name,
                "type": "case_study",
                "marks": section["marks_each"],
                "passage": "[Could not generate passage. Please retry.]",
                "sub_questions": [
                    {"question": f"Sub-question {j+1}", "marks": 1, "correct_answer": ""}
                    for j in range(4)
                ],
                "bloom_level": "Analyse",
                "source_pages": "—",
            })
    
    return all_questions

# NEW: English section generator now uses section-specific prompts as requested
def _gen_english_section(section: dict, context: str, scoped_chapters: list) -> list:
    """
    English sections use tailored prompts per section type:
    - Reading: generate a passage first, then comprehension questions from it
    - Writing: grammar fill-in-the-blank + letter + paragraph
    - Literature: chapter-specific theme/character/event questions
    """
    if section["type"] == "Reading":
        # Pick a random chapter topic from the scoped list for passage theme
        chapter_topic = random.choice(scoped_chapters) if scoped_chapters else "a general topic"
        prompt = (
            f"Generate 2 CBSE Class 8 English reading comprehension passages based on the theme of '{chapter_topic}'.\n\n"
            "Passage 1: Write a 200-word discursive/argumentative passage about this theme. "
            "Then write 5 comprehension questions based ONLY on that passage (10 marks total, 2 marks each).\n\n"
            "Passage 2: Write a 200-word factual/informational passage about a related topic. "
            "Then write 5 comprehension questions based ONLY on that passage (10 marks total, 2 marks each).\n\n"
            "Return JSON array of exactly 2 objects:\n"
            '[{"type":"reading","passage_type":"discursive","passage":"[200-word passage here]",'
            '"sub_questions":[{"question":"...","marks":2,"correct_answer":"..."},{"question":"...","marks":2,"correct_answer":"..."},{"question":"...","marks":2,"correct_answer":"..."},{"question":"...","marks":2,"correct_answer":"..."},{"question":"...","marks":2,"correct_answer":"..."}],'
            '"section":"Section A","marks":10,"bloom_level":"Understand"},'
            '{"type":"reading","passage_type":"factual","passage":"[200-word passage here]",'
            '"sub_questions":[{"question":"...","marks":2,"correct_answer":"..."},{"question":"...","marks":2,"correct_answer":"..."},{"question":"...","marks":2,"correct_answer":"..."},{"question":"...","marks":2,"correct_answer":"..."},{"question":"...","marks":2,"correct_answer":"..."}],'
            '"section":"Section A","marks":10,"bloom_level":"Understand"}]'
            "\nEach passage MUST have exactly 5 sub_questions. No markdown fences."
        )

    elif section["type"] == "Writing":
        prompt = (
            "Generate CBSE Class 8 English Writing and Grammar questions testing tenses, modals, and conjunctions.\n\n"
            "Return EXACTLY 3 objects in a JSON array:\n"
            "Object 1 (grammar): 5 fill-in-the-blank or error-correction items, each with 4 options (A/B/C/D), 2 marks each = 10 marks\n"
            "Object 2 (letter): one formal letter writing prompt, 5 marks\n"
            "Object 3 (paragraph): one analytical paragraph prompt with hints, 5 marks\n\n"
            "Return JSON array of exactly 3 objects:\n"
            '[{"type":"grammar","questions":['
            '{"question":"Fill in the blank: She _____ (go) to school every day. A) go  B) goes  C) went  D) going","marks":2,"correct_answer":"B) goes"},'
            '{"question":"Choose the correct modal: You _____ wear a helmet while riding. A) can  B) might  C) must  D) would","marks":2,"correct_answer":"C) must"},'
            '{"question":"Fill in the blank: Neither he nor his friends _____ (be) present. A) is  B) are  C) was  D) were","marks":2,"correct_answer":"B) are"},'
            '{"question":"Choose the conjunction: I was tired, _____ I continued working. A) but  B) so  C) yet  D) or","marks":2,"correct_answer":"C) yet"},'
            '{"question":"Fill in the blank: By the time she arrived, they _____ (finish) dinner. A) finish  B) finished  C) had finished  D) have finished","marks":2,"correct_answer":"C) had finished"}'
            '],"section":"Section B","marks":10,"bloom_level":"Apply"},'
            '{"type":"letter","prompt":"Write a letter to the editor of a local newspaper highlighting the issue of water wastage in your area and suggesting practical solutions. (100-120 words)","sample_answer":"A formal letter with proper format: sender address, date, editor address, subject line, salutation, body paragraphs describing the problem and solutions, formal closing.","section":"Section B","marks":5,"bloom_level":"Create"},'
            '{"type":"paragraph","prompt":"Write an analytical paragraph on the theme of perseverance using these hints: challenges faced, determination, small steps, eventual success, life lesson.","sample_answer":"A well-structured paragraph with a topic sentence, development of ideas using the hints, and a concluding statement connecting perseverance to real life.","section":"Section B","marks":5,"bloom_level":"Create"}]'
            "\nNo markdown fences. Return exactly this structure."
        )

    else:  # Literature — uses actual chapter names from scoped list
        sampled_chapters = random.sample(scoped_chapters, min(6, len(scoped_chapters))) if scoped_chapters else ["The Cherry Tree", "Somebody's Mother"]
        chapters_str = ", ".join(f'"{c}"' for c in sampled_chapters)
        prompt = (
            f"Generate CBSE Class 8 English Literature questions. "
            f"Base questions on these specific chapters: {chapters_str}\n\n"
            "For each chapter referenced, ask the student to explain a theme, character motivation, or key event from that story.\n\n"
            "Return EXACTLY 3 objects in a JSON array:\n"
            "Object 1 (rtc): 2 extracts from different chapters above, 5 marks each = 10 marks\n"
            "Object 2 (short_answer): 6 questions referencing the chapters above, 3 marks each = 18 marks\n"
            "Object 3 (long_answer): 2 questions asking students to analyse theme or character, 6 marks each = 12 marks\n\n"
            "Return JSON array of exactly 3 objects:\n"
            '[{"type":"rtc","extracts":['
            '{"extract":"A short meaningful passage or lines from one of the chapters listed","questions":[{"question":"What does the author convey through this extract?","marks":2,"correct_answer":"[Answer referencing the chapter]"},{"question":"Identify and explain one literary device used here.","marks":3,"correct_answer":"[Answer]"}]},'
            '{"extract":"Another passage from a different chapter in the list","questions":[{"question":"Explain the significance of this moment in the story.","marks":2,"correct_answer":"[Answer]"},{"question":"What does this reveal about the central theme?","marks":3,"correct_answer":"[Answer]"}]}'
            '],"section":"Section C","marks":10,"bloom_level":"Analyse"},'
            '{"type":"short_answer","questions":['
            '{"question":"[Question referencing a specific chapter from the list]","marks":3,"correct_answer":"[Answer]"},'
            '{"question":"[Question referencing a different chapter]","marks":3,"correct_answer":"[Answer]"},'
            '{"question":"[Question referencing another chapter]","marks":3,"correct_answer":"[Answer]"},'
            '{"question":"[Question referencing another chapter]","marks":3,"correct_answer":"[Answer]"},'
            '{"question":"[Question referencing another chapter]","marks":3,"correct_answer":"[Answer]"},'
            '{"question":"[Question referencing another chapter]","marks":3,"correct_answer":"[Answer]"}'
            '],"section":"Section C","marks":18,"bloom_level":"Understand"},'
            '{"type":"long_answer","questions":['
            '{"question":"[A thematic or character analysis question from one of the chapters]","marks":6,"correct_answer":"[Detailed answer]"},'
            '{"question":"[Another thematic or character analysis question from a different chapter]","marks":6,"correct_answer":"[Detailed answer]"}'
            '],"section":"Section C","marks":12,"bloom_level":"Evaluate"}]'
            "\nReplace all placeholder text with real content from the chapters named. No markdown fences."
        )

    data = _groq_generate_json(prompt, section["name"], "english-section", section["questions"], 0.6, _validate_english_item)
    return data if data else []


# ── Fallback question builder ─────────────────────────────────────────────────
def _fallback_questions(section: dict) -> list:
    print(f"[exam:{section['name']}:fallback] using fallback questions")
    return [
        {
            "section": section["name"],
            "type": section["type"].lower(),
            "marks": section["marks_each"],
            "question_text": f"[Question {i+1} — could not be generated. Please retry.]",
            "correct_answer": "",
            "hint": "",
            "bloom_level": "Remember",
            "source_pages": "—",
        }
        for i in range(section["questions"])
    ]


# ── Normalise question structure ───────────────────────────────────────────────
def _normalise(q: dict) -> dict:
    return {
        "section":       q.get("section", ""),
        "type":          q.get("type", ""),
        "marks":         q.get("marks", 1),
        "question_text": q.get("question") or q.get("question_text") or q.get("prompt", ""),
        "assertion":     q.get("assertion"),
        "reason":        q.get("reason"),
        "passage":       q.get("passage"),
        "passage_type":  q.get("passage_type"),
        "sub_questions": q.get("sub_questions"),
        "extracts":      q.get("extracts"),
        "questions":     q.get("questions"),
        "options":       q.get("options"),
        "correct":       q.get("correct"),
        "correct_answer":q.get("correct_answer") or q.get("sample_answer", ""),
        "hint":          q.get("hint", ""),
        "explanation":   q.get("explanation", ""),
        "bloom_level":   q.get("bloom_level", "Remember"),
        "source_pages":  q.get("source_pages", "—"),
    }


# ── Main entry point ───────────────────────────────────────────────────────────
async def generate_exam_paper(
    subject: str,
    class_level: int,
    topic_filter: Optional[str] = None,
    syllabus_scope: str = "full",          # NEW parameter: "full" | "first_half" | "second_half"
) -> dict:
    pdf_path = _resolve_pdf(subject)
    pattern = CBSE_PATTERNS.get(subject, CBSE_PATTERNS["Science"])

    # Pre-compute scoped chapters once — shared across all sections
    scoped_chapters = get_scoped_chapters(subject, syllabus_scope)

    loop = asyncio.get_event_loop()
    sections_out = []
    total_marks = 0

    for sec in pattern:
        try:
            # Build separate context per section using scoped chapters
            context = await loop.run_in_executor(
                None,
                _get_context_for_section,
                subject, pdf_path, sec["name"], topic_filter,
                2,               # chunks_per_chapter
                12,              # max_total_chunks
                4000,            # context_char_limit
                syllabus_scope,  # NEW: pass scope through
            )

            if sec["type"] == "MCQ":
                questions = await loop.run_in_executor(None, _gen_mcq_section, sec, context, subject)
            elif sec["type"] in ("VSA", "SA", "LA", "Map"):
                questions = await loop.run_in_executor(None, _gen_short_section, sec, context, subject)
            elif sec["type"] == "CaseStudy":
                questions = await loop.run_in_executor(None, _gen_case_study_section, sec, context, subject)
            elif sec["type"] in ("Reading", "Writing", "Literature"):
                # NEW: pass scoped_chapters to English generator
                questions = await loop.run_in_executor(None, _gen_english_section, sec, context, scoped_chapters)
            else:
                print(f"[exam:{sec['name']}:fallback] unsupported section type")
                questions = _fallback_questions(sec)

            if not questions:
                print(f"[exam:{sec['name']}:fallback] generator returned no questions")
                questions = _fallback_questions(sec)

        except Exception:
            print(f"\n[ERROR] [exam:{sec['name']}:generation] section generation failed")
            traceback.print_exc()
            questions = _fallback_questions(sec)

        if sec["type"] in ("Reading", "Writing", "Literature"):
            sec_marks = sum(q.get("marks", 0) for q in questions)
        else:
            sec_marks = sec["questions"] * sec["marks_each"]

        total_marks += sec_marks

        sections_out.append({
            "name":               sec["name"],
            "type":               sec["type"],
            "instructions":       sec["instructions"],
            "questions_count":    sec["questions"],
            "marks_per_question": sec.get("marks_each", 0),
            "section_marks":      sec_marks,
            "questions":          [_normalise(q) for q in questions],
        })

    return {
        "subject":        subject,
        "class_level":    class_level,
        "topic_filter":   topic_filter,
        "syllabus_scope": syllabus_scope,
        "total_marks":    80,
        "sections":       sections_out,
    }
    # Add at the end of exam_service.py after the generate_exam_paper function

# ── LLM-Based Grading ─────────────────────────────────────────────────────────
async def grade_subjective_answer(
    question: str,
    student_answer: str,
    correct_answer: str,
    max_marks: int,
    question_type: str,
    subject: str = "science",
    question_context: Optional[str] = None
) -> dict:
    """
    Grade a subjective answer using LLM-based semantic evaluation.
    
    Args:
        question: The question asked
        student_answer: Student's response
        correct_answer: Reference/expected answer
        max_marks: Maximum marks for this question
        question_type: Type of question (vsa, sa, la, letter, paragraph, etc.)
        subject: Subject name
        question_context: Optional context (passage, extract, etc.)
    
    Returns:
        Dictionary with score, feedback, and detailed analysis
    """
    from services.rag_service import groq_chat
    
    # Build the grading prompt based on question type and marks
    if question_type in ("vsa", "very_short"):
        expected_length = "30-40 words"
        rubric = "Check for key concept understanding and correct terminology."
    elif question_type in ("sa", "short_answer"):
        expected_length = "60-80 words"
        rubric = "Check for concept understanding, explanation, and examples. Award 50% for partial, 100% for complete."
    elif question_type in ("la", "long_answer"):
        expected_length = "100-120 words"
        rubric = "Check for depth of understanding, structure, examples, and clarity. Award 33% for basic, 66% for good, 100% for excellent."
    elif question_type == "letter":
        expected_length = "100-120 words"
        rubric = "Check format (sender address, date, recipient, subject, salutation, body, closing), tone (formal), content (complete address of the issue), and language (grammar/spelling). Award marks accordingly."
    elif question_type == "paragraph":
        expected_length = "100-120 words"
        rubric = "Check structure (topic sentence, supporting points, conclusion), coherence, relevance to hints, and language. Award marks based on completeness."
    elif question_type == "case_study":
        expected_length = "Varies by sub-question"
        rubric = "For each sub-question: check accuracy of answer based on passage, application of concepts, and clarity of explanation."
    else:
        expected_length = f"{max_marks * 40} words approx"
        rubric = f"Evaluate based on accuracy, completeness, and clarity. Full marks ({max_marks}) for complete accurate answer, partial for incomplete or partially correct, zero for wrong or irrelevant."
    
    context_section = f"\nAdditional Context:\n{question_context}\n" if question_context else ""
    
    prompt = f"""You are an expert CBSE Class 8 {subject} examiner. Grade the following student answer and provide detailed feedback.

QUESTION TYPE: {question_type.upper()}
MAXIMUM MARKS: {max_marks}
EXPECTED LENGTH: {expected_length}

QUESTION:
{question}

STUDENT'S ANSWER:
{student_answer}

REFERENCE/EXPECTED ANSWER:
{correct_answer}
{context_section}

GRADING RUBRIC:
{rubric}

IMPORTANT GUIDELINES:
1. Use SEMANTIC EVALUATION - award marks based on MEANING, not exact keyword matching
2. Be fair and generous - award partial credit for answers that show understanding
3. Consider CBSE marking standards and Class 8 level expectations
4. For longer answers, evaluate on depth, structure, and examples
5. For letters/paragraphs, evaluate format and structure as specified

Return ONLY a JSON object with the following structure:
{{
    "score": <float between 0 and {max_marks}, can be decimal like 1.5, 2.5, etc.>,
    "feedback": "<conversational feedback for student - positive and constructive>",
    "key_points_covered": ["<point 1>", "<point 2>"],
    "key_points_missed": ["<point 1>", "<point 2>"],
    "improvement_suggestions": "<specific actionable advice>",
    "model_answer": "<concise model answer based on reference>"
}}

DO NOT include any text outside the JSON object.
"""

    try:
        response = groq_chat([{"role": "user", "content": prompt}], temperature=0.3)
        
        # Extract JSON from response
        import json
        import re
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(response)
        
        # Ensure score doesn't exceed max_marks
        result["score"] = min(float(result.get("score", 0)), max_marks)
        result["max_marks"] = max_marks
        result["question_type"] = question_type
        
        return result
        
    except Exception as e:
        print(f"Error in grade_subjective_answer: {e}")
        # Fallback: return a basic grade based on answer length
        ans_length = len(student_answer.strip())
        min_length = 15
        good_length = max_marks * 40
        
        if ans_length >= good_length:
            score = max_marks
            feedback = f"Good effort! Your answer shows understanding. Keep practicing to improve further."
        elif ans_length >= min_length:
            score = max_marks * 0.5
            feedback = f"Partial understanding shown. Review the key concepts and try to provide more detailed examples next time."
        else:
            score = 0
            feedback = f"Your answer is too short. Please elaborate your response with specific details and examples."
        
        return {
            "score": score,
            "max_marks": max_marks,
            "feedback": feedback,
            "key_points_covered": [],
            "key_points_missed": [],
            "improvement_suggestions": "Study the reference answer and practice writing more detailed responses.",
            "model_answer": correct_answer,
            "question_type": question_type
        }