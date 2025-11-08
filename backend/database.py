import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

# Determine which database to use based on DB_TYPE environment variable
DB_TYPE = os.getenv('DB_TYPE', 'bolt')  # Default to 'bolt' if not set

if DB_TYPE == 'bolt':
    # Use Bolt's Supabase database
    DATABASE_URL = os.getenv('SUPABASE_DB_URL')
    if not DATABASE_URL:
        raise ValueError("SUPABASE_DB_URL must be set when DB_TYPE=bolt")
else:
    # Use local PostgreSQL database
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL must be set when DB_TYPE=local")

@contextmanager
def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_db_cursor(conn):
    return conn.cursor()
