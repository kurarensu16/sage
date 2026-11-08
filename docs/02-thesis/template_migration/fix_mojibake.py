"""Repair double-encoded text (UTF-8 bytes once misread as Windows-1252, e.g. an em dash
showing as "a-euro-quote") inside a .docx's text runs, without touching XML structure or
already-correct text. Uses ftfy.fix_encoding, which is a no-op on text that isn't mojibake.

Run: py fix_mojibake.py <in.docx> <out.docx>
Prints every distinct (before -> after) substitution made, with a count.
"""
import io
import sys
import zipfile
from collections import Counter

import ftfy
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']

zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
changes = Counter()

for part in ('word/document.xml',):
    if part not in files:
        continue
    root = etree.fromstring(files[part])
    for tag in (W + 't', W + 'delText'):
        for el in root.iter(tag):
            if el.text:
                fixed = ftfy.fix_encoding(el.text)
                if fixed != el.text:
                    changes[(el.text, fixed)] += 1
                    el.text = fixed
    files[part] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)

print('%d distinct substitutions, %d total occurrences' % (len(changes), sum(changes.values())))
for (before, after), n in sorted(changes.items(), key=lambda x: -x[1]):
    print('  x%-4d %r -> %r' % (n, before, after))
