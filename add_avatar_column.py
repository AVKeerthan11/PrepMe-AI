"""
Quick script to add avatar column to existing database
Run this from the backend directory: python add_avatar_column.py
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
    cursor.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'avatar' in columns:
        print("✓ Avatar column already exists!")
    else:
        # Add the avatar column
        cursor.execute("ALTER TABLE users ADD COLUMN avatar VARCHAR(50) DEFAULT 'avatar-1'")
        conn.commit()
        print("✓ Successfully added avatar column to users table!")
    
    conn.close()
    print("\nYou can now restart your backend server and login should work.")
    
except sqlite3.OperationalError as e:
    print(f"Error: {e}")
    print("\nIf you see 'duplicate column name', the column already exists.")
    print("If you see 'no such table', check your database path.")
except Exception as e:
    print(f"Unexpected error: {e}")
