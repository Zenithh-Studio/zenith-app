#!/usr/bin/env python3
"""Optional dependency-free SQLite migration smoke test using Python stdlib."""
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parents[1]
source = (root / 'packages/database/src/index.ts').read_text(encoding='utf-8')
match = re.search(r'this\.sqlite\.exec\(`(.*?)`\);', source, re.S)
assert match is not None, 'Cannot locate SQLite bootstrap migration'
connection = sqlite3.connect(':memory:')
connection.executescript(match.group(1))
expected = {'projects', 'workflows', 'workflow_runs', 'node_runs', 'artifacts'}
actual = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert expected <= actual, f'Missing tables: {expected - actual}'
assert connection.execute('PRAGMA user_version').fetchone()[0] == 1
connection.execute('PRAGMA foreign_keys = ON')
try:
    connection.execute("INSERT INTO workflows(id,project_id,name,graph,revision) VALUES ('wf','missing','Test','{}',1)")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError('Foreign key constraint was not enforced')
print('PASS: SQLite migration creates 5 tables, sets user_version and enforces foreign keys.')
