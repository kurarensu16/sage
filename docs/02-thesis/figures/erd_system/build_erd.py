"""Draw the reverse-engineered ERD as figures (not tables), one figure per part of a category.

Style follows the reference samples: rounded boxes with a dark header, a key column (PK, FK1, FK2,
UQ), the primary key underlined, thin connectors with crow's-foot ends. The figure title is not
drawn inside the picture; it goes in the Word caption (index.html shows it for viewing).

Input : schema_model.json (migrations replayed by parse_schema.py)
Output: out/ERD-<fig>-<name>.svg/.png, out/index.html
Run   : py parse_schema.py ; py build_erd.py
"""
import io
import json
import os
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
M = json.load(io.open(os.path.join(HERE, 'schema_model.json'), encoding='utf-8'))

GROUPS = [
    ('Academic Structure',
     ['departments', 'programs', 'sections', 'subjects', 'academic_terms', 'class_records', 'enrollments']),
    ('Accounts and People',
     ['users', 'guardians', 'user_push_tokens', 'student_account_requests']),
    ('Grading Inputs',
     ['class_activities', 'activity_resources', 'student_activity_scores', 'student_term_scores',
      'student_term_details', 'class_grading_columns', 'grade_computations', 'grade_computation_components']),
    ('Grading Outcomes',
     ['posted_grades', 'posted_grade_revisions', 'grade_correction_history', 'remark_override_requests',
      'grade_change_evidence', 'grade_consultation_windows', 'grade_consultation_notes',
      'grade_posting_operations', 'sg_correction_operations', 'admin_grade_override_operations']),
    ('Evaluation and Intervention',
     ['student_risk_evaluations', 'student_risk_private_notes', 'student_evaluation_referrals',
      'student_evaluation_referral_requests', 'faculty_intervention_drafts',
      'faculty_intervention_working_drafts', 'student_academic_insights', 'attendance_records',
      'student_consultation_requests']),
    ('AI Study Advising',
     ['student_tutor_plans', 'student_tutor_practice_sets', 'student_tutor_practice_attempts',
      'student_tutor_log', 'search_destinations']),
    ('Notifications and System',
     ['notifications', 'notification_deliveries', 'notification_preferences', 'activity_logs',
      'system_settings', 'backup_runs', 'hosting_plan_tiers', 'maintenance_reasons',
      'maintenance_note_presets', 'provisioning_locks', 'faculty_load_drafts']),
]
assigned = {t for g in GROUPS for t in g[1]}
extra = sorted(t for t in M if t not in assigned)
if extra:
    GROUPS.append(('Other tables', extra))

FS, RH, HH = 15, 28, 40
CW = 8.2
MAXROWS, MAXTABLES = 64, 7
FIG_BASE = 13        # category n is drawn as Figure 2.(13 + n) in the paper
INK, HEAD, LINE, MUTED = '#1F2328', '#2B2F36', '#3A3F47', '#7A808A'
KEYW = 52


def rows(t):
    T = M[t]
    fk_no = {}
    for f in T['fks']:
        fk_no.setdefault(f['col'], len(fk_no) + 1)
    uq = {c for u in T['uq'] if len(u) == 1 for c in u}
    out = []
    for c in T['order']:
        col = T['cols'][c]
        if c in T['pk'] and c in fk_no:
            key = 'PK,FK%d' % fk_no[c]
        elif c in T['pk']:
            key = 'PK'
        elif c in fk_no:
            key = 'FK%d' % fk_no[c]
        elif c in uq:
            key = 'UQ'
        else:
            key = ''
        out.append((c, col['type'], key, col['nullable'] and c not in T['pk']))
    return out


def width(t):
    n = len(t) + 2
    for c, ty, k, nl in rows(t):
        n = max(n, len(c) + len(ty) + 4)
    return max(250, int(n * CW) + KEYW + 24)


def rounded(pts, r=9, hops=None, R=6):
    """SVG path through orthogonal points with rounded corners; hops = {segment index: [x, ...]}
    adds a small upward arc where a horizontal run crosses another connector."""
    hops = hops or {}
    n = len(pts)

    def unit(p, q):
        l = abs(q[0] - p[0]) + abs(q[1] - p[1])
        return ((q[0] - p[0]) / l, (q[1] - p[1]) / l, l) if l else (0, 0, 0)

    ks = {}
    for i in range(1, n - 1):
        ks[i] = min(r, unit(pts[i - 1], pts[i])[2] / 2, unit(pts[i], pts[i + 1])[2] / 2)
    d = [f'M{pts[0][0]:.1f},{pts[0][1]:.1f}']
    for j in range(n - 1):
        pa, pb = pts[j], pts[j + 1]
        ux, uy, _ = unit(pa, pb)
        k_end = ks.get(j + 1, 0)
        end = (pb[0] - ux * k_end, pb[1] - uy * k_end)
        if uy == 0 and ux != 0 and j in hops:
            for hx in sorted(hops[j], key=lambda v: v * ux):
                d.append(f'L{hx - ux * R:.1f},{end[1]:.1f} A{R},{R} 0 0 {1 if ux > 0 else 0} {hx + ux * R:.1f},{end[1]:.1f}')
        d.append(f'L{end[0]:.1f},{end[1]:.1f}')
        if j + 1 < n - 1:
            c = pts[j + 1]
            ux2, uy2, _ = unit(pts[j + 1], pts[j + 2])
            k = ks[j + 1]
            d.append(f'Q{c[0]:.1f},{c[1]:.1f} {c[0] + ux2 * k:.1f},{c[1] + uy2 * k:.1f}')
    return ' '.join(d)


def draw(slug, tables, where, fig):
    tset = set(tables)
    ncols = 1 if len(tables) == 1 else 2
    ws = [0] * ncols
    colh = [0] * ncols
    place = {}
    order = sorted(tables, key=lambda t: -len(M[t]['cols']))
    for t in order:
        c = min(range(ncols), key=lambda i: colh[i])
        place[t] = (c, colh[c])
        colh[c] += HH + RH * len(M[t]['cols']) + 56
        ws[c] = max(ws[c], width(t))
    internal = [(t, f) for t in tables for f in M[t]['fks']]
    ext = sorted({f['parent'] for t in tables for f in M[t]['fks'] if f['parent'] not in tset})
    ext_rows = {e: sorted({f['parent_col'] for t in tables for f in M[t]['fks'] if f['parent'] == e}) for e in ext}
    GUT = 90 + 10 * min(len(internal), 12)
    def col_of(t):
        return ncols if t not in tset else place[t][0]

    corr = [(t, f) for t, f in internal if abs(place[t][0] - col_of(f['parent'])) > 1]
    base = 30 + (14 + 11 * len(corr) if corr else 0)
    colx, x = [], 30
    for c in range(ncols):
        colx.append(x)
        x += ws[c] + GUT
    boxes = {}
    for t, (c, y) in place.items():
        boxes[t] = dict(x=colx[c], y=base + y, w=ws[c], h=HH + RH * len(M[t]['cols']), col=c)
    ex_x = x
    ey = base
    ew = max([width(e) for e in ext] + [250]) if ext else 0
    ew = min(ew, 300)
    for e in ext:
        boxes[e] = dict(x=ex_x, y=ey, w=ew, h=HH + RH * (len(ext_rows[e]) + 1), col=ncols, ext=True)
        ey += boxes[e]['h'] + 44
    W = (ex_x + ew + 30) if ext else (x - GUT + 30)
    H = max(b['y'] + b['h'] for b in boxes.values()) + 30

    s = []
    # connectors (drawn first, boxes sit on top)
    paths = []
    for i, (t, f) in enumerate(internal):
        p = f['parent']
        a, b = boxes[t], boxes[p]
        T, P = M[t], M[p]
        ri = T['order'].index(f['col'])
        ya = a['y'] + HH + RH * ri + RH / 2
        if b.get('ext'):
            pi = ext_rows[p].index(f['parent_col'])
        else:
            pi = P['order'].index(f['parent_col']) if f['parent_col'] in P['order'] else 0
        yb = b['y'] + HH + RH * pi + RH / 2
        lane = (i % 6) * 12
        if (t, f) in corr:
            k = corr.index((t, f))
            cy = 12 + 11 * k
            xa, xb = a['x'] + a['w'], b['x']
            ga = xa + 26 + (k % 4) * 8
            gb = xb - 26 - (k % 4) * 8
            pts = [(xa, ya), (ga, ya), (ga, cy), (gb, cy), (gb, yb), (xb, yb)]
            da, db = 1, -1
        elif a['col'] == b['col']:
            xa, xb = a['x'] + a['w'], b['x'] + b['w']
            gx = max(xa, xb) + 28 + lane
            pts = [(xa, ya), (gx, ya), (gx, yb), (xb, yb)]
            da, db = 1, 1
        elif a['x'] < b['x']:
            xa, xb = a['x'] + a['w'], b['x']
            gx = xa + 30 + lane % max(1, int(xb - xa - 60))
            pts = [(xa, ya), (gx, ya), (gx, yb), (xb, yb)]
            da, db = 1, -1
        else:
            xa, xb = a['x'], b['x'] + b['w']
            gx = xb + 30 + lane % max(1, int(xa - xb - 60))
            pts = [(xa, ya), (gx, ya), (gx, yb), (xb, yb)]
            da, db = -1, 1
        paths.append(pts)
        # child end: crow's foot, then a bar (mandatory) or a circle (optional)
        fx = xa + da * 14
        s.append(f'<path d="M{fx:.1f},{ya:.1f} L{xa:.1f},{ya - 7:.1f} M{fx:.1f},{ya:.1f} L{xa:.1f},{ya + 7:.1f} M{fx:.1f},{ya:.1f} L{xa:.1f},{ya:.1f}" stroke="{LINE}" stroke-width="1.6" fill="none"/>')
        if T['cols'][f['col']]['nullable']:
            s.append(f'<circle cx="{xa + da * 23:.1f}" cy="{ya:.1f}" r="4.5" fill="white" stroke="{LINE}" stroke-width="1.6"/>')
        else:
            s.append(f'<line x1="{xa + da * 21:.1f}" y1="{ya - 7:.1f}" x2="{xa + da * 21:.1f}" y2="{ya + 7:.1f}" stroke="{LINE}" stroke-width="1.6"/>')
        # parent end: exactly one
        for o in (9, 15):
            s.append(f'<line x1="{xb + db * o:.1f}" y1="{yb - 7:.1f}" x2="{xb + db * o:.1f}" y2="{yb + 7:.1f}" stroke="{LINE}" stroke-width="1.6"/>')

    verticals = []
    for ei, pts in enumerate(paths):
        for j in range(len(pts) - 1):
            (x0_, y0_), (x1_, y1_) = pts[j], pts[j + 1]
            if abs(x1_ - x0_) < 0.5 and abs(y1_ - y0_) > 0.5:
                verticals.append((ei, x0_, min(y0_, y1_), max(y0_, y1_)))
    n_hops = 0
    for ei, pts in enumerate(paths):
        hops = {}
        for j in range(len(pts) - 1):
            (x0_, y0_), (x1_, y1_) = pts[j], pts[j + 1]
            if abs(y1_ - y0_) < 0.5 and abs(x1_ - x0_) > 0.5:
                lo, hi = sorted((x0_, x1_))
                xs, last = [], -1e9
                for fe, xv, ya_, yb_ in sorted(verticals, key=lambda v: v[1]):
                    if fe != ei and lo + 20 < xv < hi - 20 and ya_ + 1 < y0_ < yb_ - 1 and xv - last > 16:
                        xs.append(xv)
                        last = xv
                if xs:
                    hops[j] = xs
                    n_hops += len(xs)
        s.append(f'<path d="{rounded(pts, hops=hops)}" fill="none" stroke="{LINE}" stroke-width="1.6"/>')

    for t, b in boxes.items():
        x0, y0, w, h = b['x'], b['y'], b['w'], b['h']
        if b.get('ext'):
            s.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="12" fill="#FAFAFA" stroke="#8B9099" stroke-width="2" stroke-dasharray="7 4"/>')
            s.append(f'<path d="M{x0},{y0 + HH} L{x0},{y0 + 12} Q{x0},{y0} {x0 + 12},{y0} L{x0 + w - 12},{y0} Q{x0 + w},{y0} {x0 + w},{y0 + 12} L{x0 + w},{y0 + HH} Z" fill="#8B9099"/>')
            s.append(f'<text x="{x0 + w / 2}" y="{y0 + 26}" text-anchor="middle" font-family="Arial" font-size="17" font-weight="bold" fill="white">{escape(t)}</text>')
            s.append(f'<line x1="{x0 + KEYW}" y1="{y0 + HH}" x2="{x0 + KEYW}" y2="{y0 + h - RH}" stroke="#8B9099" stroke-width="1.2"/>')
            for i, c in enumerate(ext_rows[t]):
                y = y0 + HH + RH * i
                ty = M[t]['cols'].get(c, {}).get('type', '')
                s.append(f'<text x="{x0 + 8}" y="{y + 19}" font-family="Arial" font-size="12" font-weight="bold" fill="{INK}">PK</text>')
                s.append(f'<text x="{x0 + KEYW + 10}" y="{y + 19}" font-family="Arial" font-size="{FS}" font-weight="bold" text-decoration="underline" fill="{INK}">{escape(c)}</text>')
                s.append(f'<text x="{x0 + w - 10}" y="{y + 19}" text-anchor="end" font-family="Arial" font-size="12" fill="{MUTED}">{escape(ty)}</text>')
            y = y0 + h - RH
            s.append(f'<line x1="{x0 + 1}" y1="{y}" x2="{x0 + w - 1}" y2="{y}" stroke="#D5D8DD" stroke-width="1"/>')
            s.append(f'<text x="{x0 + w / 2}" y="{y + 19}" text-anchor="middle" font-family="Arial" font-size="12" font-style="italic" fill="{MUTED}">full table: {escape(where.get(t, "?"))}</text>')
            continue
        s.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="12" fill="white" stroke="{HEAD}" stroke-width="2"/>')
        s.append(f'<path d="M{x0},{y0 + HH} L{x0},{y0 + 12} Q{x0},{y0} {x0 + 12},{y0} L{x0 + w - 12},{y0} Q{x0 + w},{y0} {x0 + w},{y0 + 12} L{x0 + w},{y0 + HH} Z" fill="{HEAD}"/>')
        s.append(f'<text x="{x0 + w / 2}" y="{y0 + 26}" text-anchor="middle" font-family="Arial" font-size="17" font-weight="bold" fill="white">{escape(t)}</text>')
        if M[t].get('partial'):
            s.append(f'<text x="{x0 + w - 10}" y="{y0 + 14}" text-anchor="end" font-family="Arial" font-size="10" fill="#C9CED6">partial*</text>')
        s.append(f'<line x1="{x0 + KEYW}" y1="{y0 + HH}" x2="{x0 + KEYW}" y2="{y0 + h}" stroke="{HEAD}" stroke-width="1.4"/>')
        for i, (c, ty, k, nl) in enumerate(rows(t)):
            y = y0 + HH + RH * i
            if i:
                s.append(f'<line x1="{x0 + 1}" y1="{y}" x2="{x0 + w - 1}" y2="{y}" stroke="#E4E6EA" stroke-width="1"/>')
            s.append(f'<text x="{x0 + 8}" y="{y + 19}" font-family="Arial" font-size="12" font-weight="bold" fill="{INK}">{escape(k)}</text>')
            dec = ' text-decoration="underline"' if k.startswith('PK') else ''
            wt = 'bold' if k.startswith('PK') else 'normal'
            st = 'italic' if nl else 'normal'
            s.append(f'<text x="{x0 + KEYW + 10}" y="{y + 19}" font-family="Arial" font-size="{FS}" font-weight="{wt}" font-style="{st}"{dec} fill="{INK}">{escape(c)}</text>')
            s.append(f'<text x="{x0 + w - 10}" y="{y + 19}" text-anchor="end" font-family="Arial" font-size="12" fill="{MUTED}">{escape(ty)}</text>')

    notes = []
    notes.append('PK = primary key (underlined), FKn = foreign key, UQ = unique. Italic = nullable. A circle at a line end means the link is optional. Where two links cross, one arcs over the other. Dashed grey boxes are tables drawn in full in another figure.')
    if any(M[t].get('partial') for t in tables):
        notes.append('* partial: created outside the tracked migrations. Its columns come from the original schema document plus later migrations, so confirm them against the live database.')
    ny = H + 4
    import textwrap
    for n in notes:
        for ln in textwrap.wrap(n, max(60, int(W / 7.1))):
            ny += 17
            s.append(f'<text x="30" y="{ny}" font-family="Arial" font-size="12" fill="{MUTED}">{escape(ln)}</text>')
    H = ny + 14
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{int(W)}" height="{int(H)}" viewBox="0 0 {int(W)} {int(H)}">'
           f'<rect width="100%" height="100%" fill="white"/>' + ''.join(s) + '</svg>')
    base = os.path.join(OUT, 'ERD-' + slug)
    io.open(base + '.svg', 'w', encoding='utf-8').write(svg)
    import fitz
    fitz.open(base + '.svg')[0].get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False).save(base + '.png')
    return int(W), int(H), len(internal)


def partition(tables):
    """Fill parts in breadth-first order so tables that reference each other stay together."""
    tset = set(tables)
    deg = {t: sum(1 for f in M[t]['fks'] if f['parent'] in tset) +
              sum(1 for u in tables for f in M[u]['fks'] if f['parent'] == t) for t in tables}
    seen, order = set(), []
    for root in sorted(tables, key=lambda t: -deg[t]):
        if root in seen:
            continue
        queue = [root]
        seen.add(root)
        while queue:
            t = queue.pop(0)
            order.append(t)
            nbrs = [f['parent'] for f in M[t]['fks'] if f['parent'] in tset] + \
                   [u for u in tables if any(f['parent'] == t for f in M[u]['fks'])]
            for n in nbrs:
                if n not in seen:
                    seen.add(n)
                    queue.append(n)
    parts, cur, n_rows = [], [], 0
    for t in order:
        r = len(M[t]['cols']) + 3
        if cur and (n_rows + r > MAXROWS or len(cur) >= MAXTABLES):
            parts.append(cur)
            cur, n_rows = [], 0
        cur.append(t)
        n_rows += r
    if cur:
        parts.append(cur)
    return parts


plan, where = [], {}
for gi, (title, tables) in enumerate(GROUPS, 1):
    tables = [t for t in tables if t in M]
    parts = partition(tables)
    plan.append((gi, title, parts))
    for pi, part in enumerate(parts):
        for t in part:
            where[t] = f'Figure 2.{FIG_BASE + gi}' + ('abcdefgh'[pi] if len(parts) > 1 else '')

for f in os.listdir(OUT):
    if f.startswith('ERD-'):
        os.remove(os.path.join(OUT, f))
items, meta = [], []
for gi, title, parts in plan:
    for pi, part in enumerate(parts):
        letter = 'abcdefgh'[pi] if len(parts) > 1 else ''
        fig = f'Figure 2.{FIG_BASE + gi}{letter}'
        slug = f'{FIG_BASE + gi}{letter}-' + title.replace(' ', '-')
        w, h, e = draw(slug, part, where, fig)
        cap = f'{fig} | ERD: {title}' + (f' (part {pi + 1} of {len(parts)})' if len(parts) > 1 else '')
        print(cap, '|', len(part), 'tables', e, 'links', w, 'x', h)
        items.append((slug, cap, part))
        meta.append(dict(slug=slug, fig=fig, category=title, cat_no=gi, part=pi + 1, parts=len(parts), caption=cap,
                         tables=part, png=f'ERD-{slug}.png'))

html = ['<!doctype html><meta charset="utf-8"><title>ASPIRE ERD</title>'
        '<style>body{font-family:Arial;margin:24px;background:#f4f4f4}h1{margin:0 0 4px}img{max-width:100%;border:1px solid #ccc;background:#fff;margin:6px 0 4px}'
        'p.c{font-style:italic;margin:0 0 34px}nav a{margin-right:14px;white-space:nowrap}</style><h1>ASPIRE database ERD</h1>'
        '<p>Reverse-engineered from supabase/migrations. Each category is split into parts so the text stays readable. Captions are what goes under each picture in the paper.</p><nav>']
html += [f'<a href="#{sl}">{cap.split("|")[0].strip()}</a>' for sl, cap, part in items]
html.append('</nav>')
for sl, cap, part in items:
    html.append(f'<a id="{sl}" href="ERD-{sl}.png"><img src="ERD-{sl}.png"></a><p class="c">{cap}</p>')
io.open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(''.join(html))
print('missing from groups:', extra, '| tables drawn:', sum(len(p[2]) for p in items))

io.open(os.path.join(OUT, 'figures.json'), 'w', encoding='utf-8').write(json.dumps(meta, indent=1))
