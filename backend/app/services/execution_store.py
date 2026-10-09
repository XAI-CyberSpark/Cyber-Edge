"""Durable turn boundaries, optimistic revisions and fenced execution leases.

An expired unfinished turn is deliberately NOT replayable. Only an explicit new
session (restart) can replace it. This is not an exactly-once external actuator.
"""
from __future__ import annotations
import json
import re
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any

MAX_BYTES = 24 * 1024 * 1024
LEASE_SECONDS = 90

class ExecutionConflict(Exception):
    pass

class ExecutionStore:
    def __init__(self, path: Path, clock=time.time):
        self.path = path
        self.clock = clock
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS executions (
                key TEXT PRIMARY KEY, revision INTEGER NOT NULL, phase TEXT NOT NULL,
                payload TEXT, token TEXT, expires REAL NOT NULL, updated REAL NOT NULL)''')

    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def validate_key(key):
        if not isinstance(key, str) or not re.fullmatch(r'[a-f0-9]{64}', key):
            raise ValueError('执行会话标识无效。')

    @staticmethod
    def encode(payload: Any):
        if not isinstance(payload, dict) or payload.get('version') != 1:
            raise ValueError('执行快照版本无效。')
        try:
            encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
        except (TypeError, ValueError, RecursionError) as exc:
            raise ValueError('执行快照不是有效 JSON。') from exc
        if len(encoded.encode('utf-8')) > MAX_BYTES:
            raise ValueError('执行快照超过 24 MiB，请减少累计图片或输出后重新开始。')
        return encoded

    def read(self, key):
        self.validate_key(key)
        with self.connect() as db:
            row = db.execute('SELECT * FROM executions WHERE key=?', (key,)).fetchone()
        if row is None:
            return {'revision': 0, 'phase': 'empty', 'payload': None}
        return {'revision': row['revision'], 'phase': row['phase'],
                'payload': json.loads(row['payload']) if row['payload'] else None,
                'expires_at': row['expires'], 'updated_at': row['updated']}

    def begin(self, key, revision: int, restart=False):
        self.validate_key(key)
        now = self.clock()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM executions WHERE key=?', (key,)).fetchone()
            if (row['revision'] if row else 0) != revision:
                raise ExecutionConflict('进度已在其他页面更新，请重新加载本次进度。')
            if row and row['phase'] == 'running':
                if row['expires'] > now:
                    raise ExecutionConflict('该场景仍在其他页面执行，请等待本轮完成。')
                if not restart:
                    raise ExecutionConflict('上轮执行中断，动作结果尚未确认。不会自动重放；核对后使用重新开始。')
            token = secrets.token_urlsafe(32)
            next_revision = revision + 1
            db.execute('''INSERT INTO executions VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,phase=excluded.phase,
                token=excluded.token,expires=excluded.expires,updated=excluded.updated''',
                (key, next_revision, 'running', None, token, now + LEASE_SECONDS, now))
        return {'revision': next_revision, 'token': token, 'expires_at': now + LEASE_SECONDS}

    def renew(self, key, revision, token):
        self.validate_key(key)
        now = self.clock()
        with self.connect() as db:
            changed = db.execute('''UPDATE executions SET expires=?,updated=? WHERE key=? AND
                revision=? AND token=? AND phase='running' AND expires>?''',
                (now + LEASE_SECONDS, now, key, revision, token, now)).rowcount
            if changed != 1:
                raise ExecutionConflict('执行租约已失效，本轮停止；请重新读取进度。')
        return {'expires_at': now + LEASE_SECONDS}

    def finish(self, key, revision, token, payload):
        self.validate_key(key)
        encoded = self.encode(payload)
        now = self.clock()
        with self.connect() as db:
            changed = db.execute('''UPDATE executions SET revision=revision+1,phase='ready',payload=?,
                token=NULL,expires=0,updated=? WHERE key=? AND revision=? AND token=?
                AND phase='running' AND expires>?''', (encoded, now, key, revision, token, now)).rowcount
            if changed != 1:
                raise ExecutionConflict('本轮进度未保存：执行租约已失效，请重新读取进度。')
        return {'revision': revision + 1, 'phase': 'ready'}
