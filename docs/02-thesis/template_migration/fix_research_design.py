import sys, zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W='{%s}'%NS['w']

def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W+'t') if not any(a.tag==W+'del' for a in t.iterancestors()))

def set_text(p, text):
    runs=[r for r in p.iter(W+'r') if r.find(W+'t') is not None]
    assert runs
    runs[0].find(W+'t').text=text
    runs[0].find(W+'t').set('{http://www.w3.org/XML/1998/namespace}space','preserve')
    for r in runs[1:]: r.getparent().remove(r)

OLD = ("This developmental study evaluates the ASPIRE artifact using two related but separate "
       "instruments: an IT Expert questionnaire and an End-User questionnaire. Both contain a "
       "four-point TAM section measuring Perceived Usefulness and Perceived Ease of Use. The "
       "Expert ISO/IEC 25010:2023 section covers all nine characteristics; the End-User "
       "section covers seven, excluding Compatibility and Maintainability. Expert and "
       "end-user findings are interpreted separately, without inventing combined respondent "
       "scores.")
NEW = ("This study uses a quantitative, developmental research design. Data is gathered "
       "through structured survey questionnaires only, using closed, four-point Likert-scale "
       "instruments; no interviews, observation, or other qualitative data collection is "
       "used. The ASPIRE artifact is evaluated using two related but separate instruments: an "
       "IT Expert questionnaire and an End-User questionnaire. Both contain a four-point TAM "
       "section measuring Perceived Usefulness and Perceived Ease of Use. The Expert ISO/IEC "
       "25010:2023 section covers all nine characteristics; the End-User section covers "
       "seven, excluding Compatibility and Maintainability. Expert and end-user findings are "
       "interpreted separately, without inventing combined respondent scores.")

zin=zipfile.ZipFile(IN)
files={n:zin.read(n) for n in zin.namelist()}
root=etree.fromstring(files['word/document.xml'])
hits=[p for p in root.iter(W+'p') if vis_text(p).strip()==OLD]
assert len(hits)==1, len(hits)
set_text(hits[0], NEW)
files['word/document.xml']=etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n,b in files.items(): z.writestr(n,b)
print('done')
