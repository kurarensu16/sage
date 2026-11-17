"""Refresh the 10 tables flagged 'partial' in schema_model.json (plus the newly discovered
'rooms' table, missing entirely) using the fresh Supabase pull in Downloads/ERD. Every other
table's cols/pk/fks/uq (including composite UQ groupings the fresh pull's flat per-column
flag can't reconstruct) is left untouched, since it was already confirmed, non-partial data.

Run: py refresh_partial.py
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ERD_DIR = r'C:\Users\JC Gabriel\Downloads\ERD'
SCHEMA_PATH = os.path.join(HERE, 'schema_model.json')

PARTIAL = ['users', 'departments', 'sections', 'subjects', 'class_records', 'enrollments',
           'posted_grades', 'class_grading_columns', 'notifications', 'activity_logs']
NEW_TABLE = 'rooms'
REFRESH = PARTIAL + [NEW_TABLE]

# class_grading_columns: fresh pull flags 'term' as UQ, but class_record_id is already
# flagged FK (FK takes priority over UQ in the extraction query's per-column CASE), so a
# composite UNIQUE(class_record_id, term) would look identical to a lone UQ on 'term'.
# Confirmed with the developer: it is the composite. If that changes, edit this.
COMPOSITE_UQ_OVERRIDES = {
    'class_grading_columns': [['class_record_id', 'term']],
}

all_tables, all_rels = {}, []
for i in range(1, 8):
    fn = os.path.join(ERD_DIR, 'Batch%d.csv' % i)
    with open(fn, newline='', encoding='utf-8-sig') as f:
        rows = list(csv.reader(f))
    data = json.loads(rows[1][0])
    all_tables.update(data['tables'])
    all_rels.extend(data['relationships'])

# dedupe relationships (the extraction query pulls FKs touching scope tables from either
# side, so the same FK can appear once per batch that mentions either end)
seen, rels = set(), []
for r in all_rels:
    k = (r['child'], r['child_col'])
    if k in seen:
        continue
    seen.add(k)
    rels.append(r)

schema = json.load(open(SCHEMA_PATH, encoding='utf-8'))

changed = []
for t in REFRESH:
    fresh_cols = all_tables[t]
    cols, order, pk = {}, [], []
    for c in fresh_cols:
        order.append(c['col'])
        cols[c['col']] = {'type': c['type'], 'nullable': c['nullable'], 'default': c['default']}
        if c['key'] == 'PK':
            pk.append(c['col'])
    fks = [{'col': r['child_col'], 'parent': r['parent'], 'parent_col': r['parent_col'],
            'on_delete': r['on_delete']} for r in rels if r['child'] == t]
    if t in COMPOSITE_UQ_OVERRIDES:
        uq = COMPOSITE_UQ_OVERRIDES[t]
    else:
        uq = [[c['col']] for c in fresh_cols if c['key'] == 'UQ']
    schema[t] = {'cols': cols, 'order': order, 'pk': pk, 'fks': fks, 'uq': uq}
    changed.append(t)

json.dump(schema, open(SCHEMA_PATH, 'w', encoding='utf-8'), indent=2)
print('refreshed:', changed)
print('total tables now:', len(schema))
