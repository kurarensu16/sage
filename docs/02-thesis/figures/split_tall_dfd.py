"""Split a tall Level 1 DFD into two column files, the way Figure 2.9 already is.

A DFD here is a stack of independent process groups, so it grows downward as
processes are added and eventually will not fit a page. Splitting at a process
boundary and composing side by side (compose_columns.py) halves the height and
roughly doubles the width, which is the shape a printed page wants.

Usage: py split_tall_dfd.py <Figure-X.mmd> <process number to break before>
Writes <Figure-X>-A.mmd and <Figure-X>-B.mmd.
"""
import io, re, sys

src, brk = sys.argv[1], sys.argv[2]
s = io.open(src, encoding='utf-8').read()

marker = f'  %% ---------- {brk} ----------'
if s.count(marker) != 1:
    sys.exit(f'ABORT: {marker!r} appears {s.count(marker)} times in {src}')

head_end = s.index('  %% ---------- ')
header = s[:head_end]
body = s[head_end:]
at = body.index(marker)
a_body, b_body = body[:at], body[at:]

base = src[:-4]
note = ('%% COLUMN {c} of 2. Split from {f} so the figure fits a page; compose with\n'
        '%% compose_columns.py. Edit the halves, not a merged copy.\n')
io.open(base + '-A.mmd', 'w', encoding='utf-8', newline='\n').write(
    header + note.format(c='A', f=src) + a_body)
io.open(base + '-B.mmd', 'w', encoding='utf-8', newline='\n').write(
    header + note.format(c='B', f=src) + b_body)
print(f'  {base}-A.mmd / -B.mmd   (break before {brk})')
