"""
SQLAlchemy ORM Models
"""
import uuid
from datetime import datetime, date
from sqlalchemy import String, Integer, Float, Boolean, Text, DateTime, Date, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional, List


class Base(DeclarativeBase):
    """Base class for all models"""
    pass


class User(Base):
    """User model"""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    subject: Mapped[str] = mapped_column(String(50), nullable=False, default="science")  # "science" | "maths"
    exam_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    daily_hours: Mapped[float] = mapped_column(Float, nullable=False, default=3.0)

    # Relationships
    mastery_scores: Mapped[List["MasteryScore"]] = relationship(
        "MasteryScore",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    quiz_attempts: Mapped[List["QuizAttempt"]] = relationship(
        "QuizAttempt",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    study_sessions: Mapped[List["StudySession"]] = relationship(
        "StudySession",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    study_plans: Mapped[List["StudyPlan"]] = relationship(
        "StudyPlan",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, name={self.name})>"


class MasteryScore(Base):
    """Mastery score tracking per topic"""
    __tablename__ = "mastery_scores"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    topic: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    sessions_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_tested: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="mastery_scores")

    def __repr__(self) -> str:
        return f"<MasteryScore(user_id={self.user_id}, topic={self.topic}, score={self.score})>"


class QuizAttempt(Base):
    """Quiz attempt history"""
    __tablename__ = "quiz_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    topic: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    student_answer: Mapped[str] = mapped_column(Text, nullable=False)
    reference_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    bloom_level: Mapped[str] = mapped_column(String(50), nullable=False)
    time_taken_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="quiz_attempts")

    def __repr__(self) -> str:
        return f"<QuizAttempt(user_id={self.user_id}, topic={self.topic}, correct={self.is_correct})>"


class StudySession(Base):
    """Study session tracking"""
    __tablename__ = "study_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    planned_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    session_type: Mapped[str] = mapped_column(String(50), nullable=False, default="study")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    # New fields for enhanced planner
    priority_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mastery_at_schedule: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    micro_goals: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list stored as text

    user: Mapped["User"] = relationship("User", back_populates="study_sessions")

    def __repr__(self) -> str:
        return f"<StudySession(user_id={self.user_id}, date={self.date}, topic={self.topic}, status={self.status})>"


class StudyPlan(Base):
    """Study plan configuration"""
    __tablename__ = "study_plan"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    daily_hours: Mapped[float] = mapped_column(Float, nullable=False)
    adherence_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.8)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="study_plans")

    def __repr__(self) -> str:
        return f"<StudyPlan(user_id={self.user_id}, exam_date={self.exam_date})>"


class QuizMistake(Base):
    """Persistent mistake journal — one row per wrong answer"""
    __tablename__ = "quiz_mistakes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject: Mapped[str] = mapped_column(String(50), nullable=False)
    topic: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    student_answer: Mapped[str] = mapped_column(Text, nullable=False)
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    misconception: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<QuizMistake(student_id={self.student_id}, topic={self.topic})>"
