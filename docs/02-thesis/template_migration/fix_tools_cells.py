"""Fill Tables 2.13/2.14 with confirmed facts: the team's development laptop (Acer Swift 5
SF514-55GT system information supplied by the owner), Android 7.0+ from android/variables.gradle
(minSdkVersion 24), versions from package.json, and the Android APK described as optional
(ASPIRE is a web application). These cells were inserted earlier in this session, so their text
is replaced in place; in the tracked file they remain part of the same pending insertion.

Run: py fix_tools_cells.py <in.docx> <out.docx>
"""
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

HW = {
    'Development computer': [
        'Development computer',
        'Acer Swift 5 (SF514-55GT) laptop: 11th Gen Intel Core i5-1135G7 at 2.40 GHz (4 cores, 8 threads), '
        '8 GB RAM, Windows 11 Pro (64-bit)',
        'Writing, building, and testing the web application and the Android build'],
    'Android test device or emulator': [
        'Android test device or emulator (optional)',
        'Android 7.0 (API level 24) or later, the minimum supported by the Capacitor Android build',
        'Installing and testing the optional Android application (APK)'],
    'End-user devices': [
        'End-user devices',
        'Any desktop, laptop, tablet, or smartphone with a modern web browser and an internet connection; the '
        'optional Android application needs Android 7.0 or later; no specialized or proprietary hardware',
        'Using ASPIRE, a web application, in all five roles; server-side computation runs on Supabase\'s managed '
        'infrastructure'],
}
SW = {
    'Frontend': [None, 'React 19, Vite 8, Tailwind CSS 4, React Router 7, Lucide React', None],
    'Backend and database': [None, 'Supabase: PostgreSQL, Supabase Auth, Row Level Security; Supabase JavaScript '
                                   'client 2', None],
    'Mobile packaging': [None, 'Capacitor 8',
                         'Optional: wraps the production web build as an installable Android application (APK) for '
                         'users who prefer it, with plugins for push and local notifications, filesystem access, '
                         'network status, and sharing'],
    'Development environment': [None, 'Visual Studio Code, Node.js 24, npm', None],
}


def live(e):
    return not any(a.tag == W + 'del' for a in e.iterancestors())


def cell_text(tc):
    return ''.join(t.text or '' for t in tc.iter(W + 't') if live(t)).strip()


def set_cell(tc, text):
    ts = [t for t in tc.iter(W + 't') if live(t)]
    assert len(ts) == 1, cell_text(tc)
    ts[0].text = text
    for hl in tc.iter(W + 'highlight'):
        hl.getparent().remove(hl)


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
done = 0
for tbl in root.iter(W + 'tbl'):
    rows = tbl.findall(W + 'tr')
    head = [cell_text(c) for c in rows[0].findall(W + 'tc')]
    spec = HW if head == ['Hardware', 'Specification', 'Use'] else SW if head == ['Category', 'Tools', 'Purpose'] else None
    if spec is None:
        continue
    for tr in rows[1:]:
        cells = tr.findall(W + 'tc')
        key = cell_text(cells[0])
        if key in spec:
            for tc, val in zip(cells, spec[key]):
                if val is not None:
                    set_cell(tc, val)
            done += 1
assert done == len(HW) + len(SW), done
files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('rows updated:', done)
