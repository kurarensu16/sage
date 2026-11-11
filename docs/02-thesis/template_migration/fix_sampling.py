import sys, zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W='{%s}'%NS['w']

def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W+'t') if not any(a.tag==W+'del' for a in t.iterancestors()))

def new_para_like(template, text):
    p = etree.fromstring(etree.tostring(template))
    runs=[r for r in p.iter(W+'r') if r.find(W+'t') is not None]
    runs[0].find(W+'t').text=text
    runs[0].find(W+'t').set('{http://www.w3.org/XML/1998/namespace}space','preserve')
    for r in runs[1:]: r.getparent().remove(r)
    return p

TARGET = ("The study takes place at DYCI, Bulacan, Philippines, with respondents recruited "
          "purposively from users of the five ASPIRE roles and a separate panel of IT "
          "experts. Proposed end-user targets are 40 students, 8 faculty members, and "
          "1\u20133 Dean, Registrar, or administrator respondents (approximately 49\u201351 "
          "end users), with 1\u20133 IT experts as a separate proposed group. These figures "
          "are recruitment targets, not finalized participation totals; actual numbers will "
          "be reported with the evaluation results.")

NEW_PARA = ("This study uses nonprobability purposive sampling: respondents are deliberately "
            "selected because they meet predefined criteria relevant to the research "
            "objectives, rather than through random selection (Etikan, Musa, & Alkassim, "
            "2016). The inclusion criteria below define which users of each role qualify as "
            "a respondent.")

REF_OLD = ("Dr. Yanga's Colleges, Inc. (2025). Student handbook (2025")
REF_NEW_TEXT = ("Etikan, I., Musa, S. A., & Alkassim, R. S. (2016). Comparison of convenience "
                "sampling and purposive sampling. American Journal of Theoretical and Applied "
                "Statistics, 5(1), 1\u20134. https://doi.org/10.11648/j.ajtas.20160501.11")

zin=zipfile.ZipFile(IN)
files={n:zin.read(n) for n in zin.namelist()}
root=etree.fromstring(files['word/document.xml'])
all_p=list(root.iter(W+'p'))

hits=[p for p in all_p if vis_text(p).strip()==TARGET]
assert len(hits)==1, len(hits)
target_p = hits[0]
new_p = new_para_like(target_p, NEW_PARA)
target_p.addnext(new_p)

ref_hits=[p for p in all_p if vis_text(p).startswith(REF_OLD)]
assert len(ref_hits)==1, len(ref_hits)
ref_p = ref_hits[0]
new_ref = new_para_like(ref_p, REF_NEW_TEXT)
ref_p.addprevious(new_ref)

files['word/document.xml']=etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n,b in files.items(): z.writestr(n,b)
print('done')
