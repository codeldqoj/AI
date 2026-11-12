import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
def E(statement, steps, result, insight):
    return {'statement':statement, 'steps':steps.split(' § '), 'result':result, 'insight':insight}
def S(id,title,theory,method,pitfall,examples,refs):
    assert len(examples)>=5 and all(len(e['steps'])>=3 for e in examples)
    return dict(id=id,title=title,theory=theory.split(' § '),method=method.split(' § '),pitfalls=[pitfall],examples=examples,references=refs)
def polish(value):
    if isinstance(value,str): return value.replace(r'\prime\prime',"''").replace(r'\prime',"'")
    if isinstance(value,list): return [polish(v) for v in value]
    if isinstance(value,dict): return {k:polish(v) for k,v in value.items()}
    return value
def save(course,prerequisites,outcomes,sections):
    data=dict(schemaVersion=1,revision='2026-10-25.1',courseId=course,prerequisites=prerequisites,outcomes=outcomes,sections=sections)
    (ROOT/'data/university-materials'/f'{course}.json').write_text(json.dumps(polish(data),ensure_ascii=False,indent=2)+'\n')
