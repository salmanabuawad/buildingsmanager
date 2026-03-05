"""
Create a local admin user in public.users (for local install).
Run from backend dir with .env set: python scripts/create_local_admin.py
Or: python scripts/create_local_admin.py admin mypassword admin@local.dev
"""
import os
import sys

# Add parent so app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def main():
    user_name = sys.argv[1] if len(sys.argv) > 1 else "admin"
    password = sys.argv[2] if len(sys.argv) > 2 else "admin"
    email = sys.argv[3] if len(sys.argv) > 3 else "admin@local.dev"
    role = sys.argv[4] if len(sys.argv) > 4 else "admin"

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("Set DATABASE_URL in .env or environment.")
        sys.exit(1)

    password_hash = pwd_context.hash(password)
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT user_id FROM users WHERE user_name = %s",
                (user_name,),
            )
            if cur.fetchone():
                print(f"User '{user_name}' already exists. Use a different name or reset the DB.")
                return
            cur.execute(
                """
                INSERT INTO users (user_name, user_email, password_hash, user_role, active)
                VALUES (%s, %s, %s, %s, true)
                """,
                (user_name, email, password_hash, role),
            )
            conn.commit()
            print(f"Created user: {user_name} (role: {role}). Login at POST /api/auth/login")
        finally:
            cur.close()
    except Exception as e:
        conn.rollback()
        print("Error:", e)
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
