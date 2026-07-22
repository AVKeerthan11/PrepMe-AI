"""
Quick script to add subject column to study_sessions table
Run this from the backend directory: python add_subject_column.py
"""
import sqlite3
import os

# Path to your database
DB_PATH = "backend/prepmeai.db"

# Alternative paths if the above doesn't work
if not os.path.exists(DB_PATH):
    DB_PATH = "prepmeai.db"

if not os.path.exists(DB_PATH):
    print(f"Error: Database file not found at {DB_PATH}")
    print("Please update DB_PATH in this script to point to your database file")
    exit(1)

try:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if column already exists
    cursor.execute("PRAGMA table_info(study_sessions)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'subject' in columns:
        print("✓ Subject column already exists in study_sessions table!")
    else:
        # Add the subject column
        cursor.execute("ALTER TABLE study_sessions ADD COLUMN subject VARCHAR(50) DEFAULT 'science'")
        conn.commit()
        print("✓ Successfully added subject column to study_sessions table!")
    
    # Also check for chapter column
    cursor.execute("PRAGMA table_info(study_sessions)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'chapter' not in columns:
        cursor.execute("ALTER TABLE study_sessions ADD COLUMN chapter VARCHAR(255)")
        conn.commit()
        print("✓ Successfully added chapter column to study_sessions table!")
    else:
        print("✓ Chapter column already exists!")
    
    # Check for hour_start column
    if 'hour_start' not in columns:
        cursor.execute("ALTER TABLE study_sessions ADD COLUMN hour_start INTEGER")
        conn.commit()
        print("✓ Successfully added hour_start column to study_sessions table!")
    else:
        print("✓ Hour_start column already exists!")
    
    conn.close()
    print("\nYou can now restart your backend server.")
    
except sqlite3.OperationalError as e:
    print(f"Error: {e}")
    print("\nIf you see 'duplicate column name', the column already exists.")
    print("If you see 'no such table', check your database path.")
except Exception as e:
    print(f"Unexpected error: {e}")
