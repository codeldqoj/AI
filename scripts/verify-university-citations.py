"""Verify pinned PDFs and physical-page anchors. Usage: python scripts/verify-university-citations.py PDF_DIRECTORY
PDF_DIRECTORY contains <sourceId>.pdf downloaded from each sources.json pdfUrl.
No application data or production database is changed.
"""
import hashlib,json,re,subprocess,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sources={s['id']:s for s in json.loads((root/'data/university-materials/sources.json').read_text())}
citations=json.loads((root/'data/university-materials/citations.json').read_text())
normalize=lambda s:re.sub(r'[^a-z0-9]','',s.lower())
needed={r['sourceId'] for course in citations.values() for refs in course.values() for r in refs}
texts={}
with tempfile.TemporaryDirectory() as temporary:
 for source_id in sorted(needed):
  source=sources[source_id];pdf=Path(sys.argv[1])/(source_id+'.pdf')
  assert hashlib.sha256(pdf.read_bytes()).hexdigest()==source['pdfSha256'], f'{source_id}: PDF edition changed; review pagination'
  output=Path(temporary)/(source_id+'.txt')
  subprocess.run(['pdftotext','-layout',str(pdf),str(output)],check=True)
  texts[source_id]=output.read_text().split('\f')
  assert len(texts[source_id])-1==source['pdfPages'],source_id
 count=0
 for course_id,sections in citations.items():
  book=json.loads((root/f'data/university-materials/{course_id}.json').read_text())
  assert set(sections)=={s['id'] for s in book['sections']}
  for section_id,refs in sections.items():
   assert refs,(course_id,section_id)
   for ref in refs:
    page=ref['pdfPage'];source_id=ref['sourceId'];assert 1<=page<=sources[source_id]['pdfPages']
    assert normalize(ref['verificationText']) in normalize(texts[source_id][page-1]),(course_id,section_id,source_id,page)
    count+=1
 print(f'PASS: {len(needed)} PDF editions, 80 sections, {count} physical-page references verified')
