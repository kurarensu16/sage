"""Rebuild the table model (columns, PK, FK, UQ) by replaying supabase/migrations in order.

This is a best-effort replay of CREATE/ALTER/DROP TABLE. It cannot see tables that were created
outside the tracked migrations (users, departments, sections, subjects), so those carry only the
columns that later migrations add; the live-catalog queries (batch1..7.csv) are the authority.
Run: py parse_schema.py  -> writes schema_model.json next to this file.
"""
import glob
import io
import json
import os
import re

MIG = os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'supabase', 'migrations')
OUT = os.path.join(os.path.dirname(__file__), 'schema_model.json')
PREDATING = ['users', 'departments', 'sections', 'subjects', 'class_records', 'enrollments', 'posted_grades',
             'class_grading_columns', 'notifications', 'activity_logs']

tables = {t: {'cols': {}, 'order': [], 'pk': [], 'fks': [], 'uq': [], 'partial': True} for t in PREDATING}


def strip(sql):
    """Remove comments and dollar-quoted bodies without touching text inside '...' strings."""
    sql = re.sub(r'(\$[A-Za-z_]*\$).*?\1', ' ', sql, flags=re.S)       # function bodies
    out, i, n, q = [], 0, len(sql), None
    while i < n:
        ch = sql[i]
        if q:
            out.append(ch)
            if ch == q:
                q = None
            i += 1
        elif ch in ("'", '"'):
            q = ch
            out.append(ch)
            i += 1
        elif sql.startswith('--', i):
            j = sql.find('\n', i)
            i = n if j < 0 else j
        elif sql.startswith('/*', i):
            j = sql.find('*/', i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(ch)
            i += 1
    return ''.join(out)


def statements(sql):
    out, buf, depth, q = [], [], 0, None
    for ch in sql:
        if q:
            buf.append(ch)
            if ch == q:
                q = None
            continue
        if ch in ("'", '"'):
            q = ch
            buf.append(ch)
        elif ch == ';':
            out.append(''.join(buf))
            buf = []
        else:
            buf.append(ch)
    out.append(''.join(buf))
    return [s.strip() for s in out if s.strip()]


def split_top(body):
    parts, buf, depth, q = [], [], 0, None
    for ch in body:
        if q:
            buf.append(ch)
            if ch == q:
                q = None
            continue
        if ch in ("'", '"'):
            q = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    parts.append(''.join(buf).strip())
    return [p for p in parts if p]


def ident(s):
    return s.strip().strip('"').split('.')[-1].strip('"')


def get(t):
    return tables.setdefault(t, {'cols': {}, 'order': [], 'pk': [], 'fks': [], 'uq': [], 'partial': False})


def add_col(t, name, rest):
    T = get(t)
    rest = ' '.join(rest.split())
    m = re.match(r'([A-Za-z_][\w ]*?(?:\([^)]*\))?(?:\[\])?)(?=\s+(?:NOT|NULL|DEFAULT|REFERENCES|PRIMARY|UNIQUE|CHECK|GENERATED|CONSTRAINT)\b|$|,)', rest, re.I)
    typ = (m.group(1) if m else rest.split(' ')[0]).strip().lower()
    typ = {'timestamp with time zone': 'timestamptz', 'character varying': 'varchar', 'double precision': 'float8'}.get(typ, typ)
    typ = re.sub(r'character varying', 'varchar', typ)
    up = rest.upper()
    notnull = 'NOT NULL' in up or 'PRIMARY KEY' in up
    if name not in T['cols']:
        T['order'].append(name)
    T['cols'][name] = {'type': typ, 'nullable': not notnull, 'default': None}
    d = re.search(r'DEFAULT\s+(.+?)(?:\s+(?:NOT NULL|NULL|REFERENCES|CHECK|UNIQUE|PRIMARY|CONSTRAINT)\b|$)', rest, re.I)
    if d:
        T['cols'][name]['default'] = d.group(1).strip()
    if 'PRIMARY KEY' in up and name not in T['pk']:
        T['pk'].append(name)
    if re.search(r'\bUNIQUE\b', up):
        T['uq'].append([name])
    r = re.search(r'REFERENCES\s+([\w."]+)\s*(?:\(([^)]*)\))?', rest, re.I)
    if r:
        pt = ident(r.group(1))
        pc = ident(r.group(2).split(',')[0]) if r.group(2) else 'id'
        od = re.search(r'ON DELETE\s+(CASCADE|SET NULL|RESTRICT|SET DEFAULT|NO ACTION)', rest, re.I)
        T['fks'] = [f for f in T['fks'] if f['col'] != name]
        T['fks'].append({'col': name, 'parent': pt, 'parent_col': pc, 'on_delete': od.group(1).upper() if od else 'NO ACTION'})


def table_constraint(t, item):
    T = get(t)
    item = ' '.join(item.split())
    m = re.search(r'PRIMARY KEY\s*\(([^)]*)\)', item, re.I)
    if m:
        T['pk'] = [ident(c) for c in m.group(1).split(',')]
        return
    m = re.search(r'FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s+([\w."]+)\s*(?:\(([^)]*)\))?', item, re.I)
    if m:
        cols = [ident(c) for c in m.group(1).split(',')]
        pcs = [ident(c) for c in m.group(3).split(',')] if m.group(3) else ['id']
        od = re.search(r'ON DELETE\s+(CASCADE|SET NULL|RESTRICT|SET DEFAULT|NO ACTION)', item, re.I)
        T['fks'] = [f for f in T['fks'] if f['col'] != cols[0]]
        T['fks'].append({'col': cols[0], 'parent': ident(m.group(2)), 'parent_col': pcs[0],
                         'on_delete': od.group(1).upper() if od else 'NO ACTION'})
        return
    m = re.search(r'UNIQUE\s*\(([^)]*)\)', item, re.I)
    if m:
        T['uq'].append([ident(c) for c in m.group(1).split(',')])


DOC = os.path.join(os.path.dirname(__file__), '..', '..', '..', '01-system', 'database', 'ASPIRE_DATABASE_SCHEMA.md')
SEED_ONLY = set(PREDATING)
seed = chr(10).join(re.findall(r'```sql(.*?)```', io.open(DOC, encoding='utf-8').read(), re.S))
seed = re.sub(r'\bprofiles\b', 'users', seed)
seed = re.sub(r'\bclass_enrollments\b', 'enrollments', seed)
sources = [(seed, True)] + [(io.open(f, encoding='utf-8', errors='ignore').read(), False)
                            for f in sorted(glob.glob(os.path.join(MIG, '*.sql')))]
for text, is_seed in sources:
    for st in statements(strip(text)):
        if is_seed and not re.match(r'CREATE\s+TABLE', st, re.I):
            continue
        m = re.match(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\((.*)\)\s*(?:PARTITION|WITH|TABLESPACE|$)', st, re.S | re.I)
        if m:
            t = ident(m.group(1))
            if t.startswith('pg_') or 'auth.' in m.group(1) or 'storage.' in m.group(1):
                continue
            if is_seed and t not in SEED_ONLY:
                continue
            tables[t] = {'cols': {}, 'order': [], 'pk': [], 'fks': [], 'uq': [], 'partial': is_seed}
            for item in split_top(m.group(2)):
                if re.match(r'(CONSTRAINT\s+\w+\s+)?(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|EXCLUDE)\b', item, re.I):
                    table_constraint(t, re.sub(r'^CONSTRAINT\s+\w+\s+', '', item, flags=re.I))
                else:
                    nm = re.match(r'"?(\w+)"?\s+(.*)', item, re.S)
                    if nm:
                        add_col(t, nm.group(1), nm.group(2))
            continue
        m = re.match(r'DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w."\s,]+?)(?:\s+CASCADE)?$', st, re.I)
        if m:
            for t in m.group(1).split(','):
                tables.pop(ident(t), None)
            continue
        m = re.match(r'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)\s+(.*)', st, re.S | re.I)
        if m:
            t = ident(m.group(1))
            if t not in tables and t not in PREDATING:
                continue
            for act in split_top(m.group(2)):
                a = ' '.join(act.split())
                mc = re.match(r'ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+(.*)', a, re.I)
                if mc:
                    add_col(t, mc.group(1), mc.group(2))
                    continue
                md = re.match(r'DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?', a, re.I)
                if md and t in tables:
                    c = md.group(1)
                    tables[t]['cols'].pop(c, None)
                    tables[t]['order'] = [x for x in tables[t]['order'] if x != c]
                    tables[t]['fks'] = [x for x in tables[t]['fks'] if x['col'] != c]
                    continue
                mr = re.match(r'RENAME\s+COLUMN\s+"?(\w+)"?\s+TO\s+"?(\w+)"?', a, re.I)
                if mr and t in tables:
                    o, n = mr.group(1), mr.group(2)
                    T = tables[t]
                    if o in T['cols']:
                        T['cols'][n] = T['cols'].pop(o)
                        T['order'] = [n if x == o else x for x in T['order']]
                        T['pk'] = [n if x == o else x for x in T['pk']]
                        for f in T['fks']:
                            if f['col'] == o:
                                f['col'] = n
                    for U in tables.values():
                        for f in U['fks']:
                            if f['parent'] == t and f['parent_col'] == o:
                                f['parent_col'] = n
                    continue
                mt = re.match(r'RENAME\s+TO\s+"?(\w+)"?', a, re.I)
                if mt and t in tables:
                    n = mt.group(1)
                    tables[n] = tables.pop(t)
                    for U in tables.values():
                        for f in U['fks']:
                            if f['parent'] == t:
                                f['parent'] = n
                    continue
                mk = re.match(r'ADD\s+(?:CONSTRAINT\s+\w+\s+)?(PRIMARY KEY|FOREIGN KEY|UNIQUE)\b(.*)', a, re.I)
                if mk:
                    table_constraint(t, mk.group(1) + mk.group(2))

# drop FKs that point at tables that no longer exist, and cross-schema parents
for t, T in tables.items():
    T['fks'] = [f for f in T['fks'] if f['parent'] in tables]

from collections import Counter
for t in PREDATING:
    T = tables.get(t)
    if not T or T['pk']:
        continue
    refs = Counter(f['parent_col'] for U in tables.values() for f in U['fks'] if f['parent'] == t)
    pk = refs.most_common(1)[0][0] if refs else 'id'
    if pk not in T['cols']:
        T['cols'][pk] = {'type': 'uuid', 'nullable': False, 'default': None}
        T['order'].insert(0, pk)
    T['pk'] = [pk]
    T['partial'] = True

json.dump(tables, io.open(OUT, 'w', encoding='utf-8'), indent=1)
n_fk = sum(len(T['fks']) for T in tables.values())
print(len(tables), 'tables,', sum(len(T['cols']) for T in tables.values()), 'columns,', n_fk, 'foreign keys')
for t in sorted(tables):
    T = tables[t]
    if not T['cols'] or T['partial']:
        print('  thin:', t, len(T['cols']), 'cols')
