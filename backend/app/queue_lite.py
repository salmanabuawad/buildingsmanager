"""
Lite queue (Kafka-like): topics, produce/consume, persistent storage via SQLite.
No broker process; single SQLite file. Use for email queue, task queue, etc.
Messages are never deleted after successful send; consume() only advances consumer offset.

Usage:
    from app.queue_lite import get_queue
    q = get_queue()
    q.produce("emails", {"to": "a@b.com", "subject": "Hi"})
    msgs = q.consume("emails", consumer_id="worker1", limit=10)
"""
import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Default path: backend/queue_lite.db, or set QUEUE_LITE_DB_PATH env
_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "queue_lite.db"
_lock = threading.RLock()
_conn: Optional[sqlite3.Connection] = None


def _get_db_path() -> Path:
    return Path(os.environ.get("QUEUE_LITE_DB_PATH", str(_DEFAULT_DB_PATH)))


def _get_connection() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            path = _get_db_path()
            _conn = sqlite3.connect(str(path), check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("""
                CREATE TABLE IF NOT EXISTS queue_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
            """)
            _conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_queue_messages_topic_created
                ON queue_messages(topic, created_at)
            """)
            _conn.execute("""
                CREATE TABLE IF NOT EXISTS consumer_offsets (
                    consumer_id TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    offset_id INTEGER NOT NULL,
                    updated_at REAL NOT NULL,
                    PRIMARY KEY (consumer_id, topic)
                )
            """)
            _conn.commit()
        return _conn


class LiteQueue:
    """Kafka-like lite queue: topics, produce, consume with consumer offsets."""

    def __init__(self) -> None:
        self._conn = _get_connection()

    def produce(self, topic: str, value: Any) -> int:
        """Append a message to a topic. Value must be JSON-serializable. Returns message id."""
        with _lock:
            payload = json.dumps(value, default=str)
            cur = self._conn.execute(
                "INSERT INTO queue_messages (topic, payload, created_at) VALUES (?, ?, ?)",
                (topic, payload, time.time()),
            )
            self._conn.commit()
            return cur.lastrowid or 0

    def produce_many(self, topic: str, values: List[Any]) -> List[int]:
        """Append multiple messages. Returns list of message ids."""
        ids: List[int] = []
        with _lock:
            now = time.time()
            for value in values:
                payload = json.dumps(value, default=str)
                cur = self._conn.execute(
                    "INSERT INTO queue_messages (topic, payload, created_at) VALUES (?, ?, ?)",
                    (topic, payload, now),
                )
                ids.append(cur.lastrowid or 0)
            self._conn.commit()
        return ids

    def consume(
        self,
        topic: str,
        consumer_id: str,
        limit: int = 1,
        advance_offset: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Read next messages for this consumer. Each consumer has its own offset per topic.
        Returns list of { "id", "topic", "payload", "created_at" } (payload is decoded).
        If advance_offset=True, moves this consumer's offset past the returned messages.
        """
        with _lock:
            row = self._conn.execute(
                "SELECT offset_id FROM consumer_offsets WHERE consumer_id = ? AND topic = ?",
                (consumer_id, topic),
            ).fetchone()
            start_id = (row["offset_id"] + 1) if row else 1

            rows = self._conn.execute(
                """
                SELECT id, topic, payload, created_at
                FROM queue_messages
                WHERE topic = ? AND id >= ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (topic, start_id, limit),
            ).fetchall()

            out: List[Dict[str, Any]] = []
            for r in rows:
                out.append({
                    "id": r["id"],
                    "topic": r["topic"],
                    "payload": json.loads(r["payload"]),
                    "created_at": r["created_at"],
                })

            if advance_offset and out:
                last_id = out[-1]["id"]
                self._conn.execute(
                    """
                    INSERT INTO consumer_offsets (consumer_id, topic, offset_id, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(consumer_id, topic) DO UPDATE SET
                        offset_id = excluded.offset_id,
                        updated_at = excluded.updated_at
                    """,
                    (consumer_id, topic, last_id, time.time()),
                )
                self._conn.commit()

            return out

    def peek(self, topic: str, limit: int = 10, after_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Read messages without advancing any offset. after_id is exclusive."""
        with _lock:
            start = after_id or 0
            rows = self._conn.execute(
                """
                SELECT id, topic, payload, created_at
                FROM queue_messages
                WHERE topic = ? AND id > ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (topic, start, limit),
            ).fetchall()
            return [
                {"id": r["id"], "topic": r["topic"], "payload": json.loads(r["payload"]), "created_at": r["created_at"]}
                for r in rows
            ]

    def set_offset(self, consumer_id: str, topic: str, offset_id: int) -> None:
        """Set consumer's offset (e.g. after processing or for replay)."""
        with _lock:
            self._conn.execute(
                """
                INSERT INTO consumer_offsets (consumer_id, topic, offset_id, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(consumer_id, topic) DO UPDATE SET
                    offset_id = excluded.offset_id,
                    updated_at = excluded.updated_at
                """,
                (consumer_id, topic, offset_id, time.time()),
            )
            self._conn.commit()

    def topic_length(self, topic: str) -> int:
        """Number of messages currently in the topic."""
        with _lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS n FROM queue_messages WHERE topic = ?",
                (topic,),
            ).fetchone()
            return row["n"] or 0

    def list_topics(self) -> List[str]:
        """Return all topic names that have at least one message."""
        with _lock:
            rows = self._conn.execute(
                "SELECT DISTINCT topic FROM queue_messages ORDER BY topic",
            ).fetchall()
            return [r["topic"] for r in rows]

    def get_consumer_offsets(self) -> List[Dict[str, Any]]:
        """Return all consumer offsets: [{ consumer_id, topic, offset_id, updated_at }]."""
        with _lock:
            rows = self._conn.execute(
                "SELECT consumer_id, topic, offset_id, updated_at FROM consumer_offsets ORDER BY topic, consumer_id",
            ).fetchall()
            return [
                {"consumer_id": r["consumer_id"], "topic": r["topic"], "offset_id": r["offset_id"], "updated_at": r["updated_at"]}
                for r in rows
            ]

    def delete_older_than(self, topic: str, before_id: int) -> int:
        """Delete messages with id < before_id in topic. Returns deleted count."""
        with _lock:
            cur = self._conn.execute(
                "DELETE FROM queue_messages WHERE topic = ? AND id < ?",
                (topic, before_id),
            )
            self._conn.commit()
            return cur.rowcount or 0


_instance: Optional[LiteQueue] = None


def get_queue() -> LiteQueue:
    global _instance
    with _lock:
        if _instance is None:
            _instance = LiteQueue()
        return _instance
