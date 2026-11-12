import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const engineSource = fs.readFileSync(new URL('../ai_guide_engine.js', import.meta.url), 'utf8');
const savedId = '507f1f77bcf86cd799439011';
const originalGuide = {
  branch: 'Đại số',
  knowledge: 'Kiến thức gốc $x^2$.',
  intuition: 'Ý tưởng gốc.',
  solution: 'Lời giải gốc.',
  pitfalls: 'Lưu ý gốc.',
  quality: { verified: true, score: '5.0/5.0', verifier: 'GPT' }
};

export async function createHarness({ role = 'admin', persisted = true, guide = originalGuide, support = false, statement = '', topic = 'Đại số' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body><div class="tab-pane active">
    <article class="exam-card"><h3 class="exam-title">Đề kiểm thử</h3>
      <div class="problem-item" id="question-2" data-content-key="tst:tst-da-nang:day-1:question-2"
        data-database-problem="true" data-source-group="tst" data-source-type="tst_question">
        <div class="problem-header"><div class="problem-id"><span>Câu 2</span></div><span class="badge-topic">Đại số</span></div>
        <div class="problem-content">Chứng minh $x^2 \ge 0$.</div>
      </div>
    </article>
  </div></body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return this.textContent; },
    set(value) { this.textContent = value; }
  });
  const updateCalls = [];
  const submitCalls = [];
  window.VMOAuth = { getSession: () => ({ role, username: role }) };
  window.MathJax = { typesetPromise: async () => {}, typesetClear: () => {} };
  window.showVMOToast = () => {};
  window.alert = () => {};
  window.setTimeout = callback => { callback(); return 1; };
  const guideRequests = [];
  window.fetch = async (url, options) => {
    guideRequests.push(JSON.parse(options.body));
    return ({
    ok: true,
    json: async () => ({ success: true, data: guide })
  }); };
  window.VMODataService = {
    getLatestAiGuide: async () => persisted ? {
      _id: savedId,
      aiGuide: guide,
      aiGuideAdminEdited: false
    } : null,
    updateAiGuide: async (...args) => {
      updateCalls.push(args);
      return { _id: savedId, aiGuide: args[1], solutionContent: args[2] };
    },
    submitSolution: async (...args) => {
      submitCalls.push(args);
      return { _id: savedId };
    }
  };
  window.eval(fs.readFileSync(new URL('../geometry_diagram.js', import.meta.url), 'utf8'));
  window.eval(engineSource);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  if (support) {
    const card = window.document.querySelector('.problem-item');
    card.dataset.sourceGroup = 'math_support';
    card.dataset.sourceType = 'standalone_question';
    card.dataset.contentKey = 'math_support:owner:clipboard-question';
  }
  if (statement) window.document.querySelector('.problem-content').setAttribute('data-raw-math', statement);
  window.document.querySelector('.badge-topic').textContent = topic;
  const button = window.document.querySelector('.btn-ai-guide');
  await window.openAIGuide(button);
  const panel = window.document.querySelector('.ai-guide-panel');
  return { window, panel, problemId: panel.id.replace('ai-panel-', ''), updateCalls, submitCalls, guideRequests };
}

const saved = await createHarness({ role: 'admin', persisted: true });
assert.match(saved.panel.textContent, /Gia sư Toán AI/);
assert.doesNotMatch(saved.panel.textContent, /Giáo sư|MongoDB|Professor/);
const referenceKey = 'vmo_official:vmo-vmo-2024-2025:day-1:question-2';
const referenced = await createHarness({ guide: { ...originalGuide, quality: { ...originalGuide.quality,
  retrieval: { mode: 'exact', sources: [{ matchType: 'exact', problemKey: referenceKey },
    { matchType: 'similar', problemKey: '<img src=x onerror=alert(1)>' }] } } } });
const referenceBadge = referenced.panel.querySelector('.ai-guide-reference-badge');
assert.match(referenceBadge.textContent, /Tham chiếu lời giải:/);
assert.ok(referenceBadge.textContent.includes(referenceKey), 'Keep the reference identity intact');
assert.doesNotMatch(referenceBadge.textContent, /RAG|exact|similar/);
assert.equal(referenceBadge.querySelector('img'), null, 'Reference labels escape source identifiers');
referenced.window.currentLang = 'en';
referenced.window.dispatchEvent(new referenced.window.CustomEvent('langchange', { detail: { lang: 'en' } }));
assert.equal(referenced.panel.querySelector('.ai-guide-reference-label').textContent, 'Solution references:');
assert.ok(referenceBadge.textContent.includes(referenceKey));
referenced.window.close();
assert.ok(saved.panel.querySelector('.btn-ai-guide-edit'), 'admin phải thấy nút chỉnh sửa');
saved.window.editAIGuideContent(saved.problemId);
assert.equal(saved.panel.querySelectorAll('.ai-guide-source-editor').length, 4,
  'phải có bốn vùng chỉnh sửa nội dung nguồn Markdown/LaTeX');
saved.panel.querySelector('[data-guide-editor="solution"]').value = 'Lời giải đã sửa với $x^2 \\ge 0$.';
assert.equal(saved.window.applyAIGuideEdits(saved.problemId), true);
assert.equal(saved.panel.querySelectorAll('.ai-guide-source-editor').length, 0, 'áp dụng phải trở lại bản xem trước');
assert.match(saved.panel.querySelector('[data-guide-field="solution"] .ai-section-content').textContent, /Lời giải đã sửa/);
assert.equal(saved.panel.querySelector('.ai-guide-quality-badge'), null,
  'chỉnh nội dung phải bỏ huy hiệu kiểm định AI cũ');
assert.ok(saved.panel.querySelector('.ai-guide-admin-edited-badge'));
await saved.window.saveAIGuideToDatabase(saved.problemId, 'Đại số');
assert.equal(saved.updateCalls.length, 1, 'bản ghi đã lưu phải cập nhật theo _id');
assert.equal(saved.updateCalls[0][0], savedId);
assert.match(saved.updateCalls[0][1].solution, /x\^2/);
assert.equal(saved.submitCalls.length, 0, 'không được tạo/upsert nhầm bản ghi mới khi đã có _id');

const fresh = await createHarness({ role: 'admin', persisted: false });
fresh.window.editAIGuideContent(fresh.problemId);
fresh.panel.querySelector('[data-guide-editor="knowledge"]').value = 'Kiến thức admin đã sửa.';
await fresh.window.saveAIGuideToDatabase(fresh.problemId, 'Đại số');
assert.equal(fresh.submitCalls.length, 1, 'bản chưa lưu phải đi qua luồng lưu AI Guide hiện hữu');
assert.equal(fresh.submitCalls[0][5].aiGuideAdminEdited, true);
assert.equal(fresh.submitCalls[0][5].aiGuide.knowledge, 'Kiến thức admin đã sửa.');

const member = await createHarness({ role: 'student', persisted: true });
assert.equal(member.panel.querySelector('.btn-ai-guide-edit'), null, 'thành viên không được thấy chức năng chỉnh sửa');
const teacher = await createHarness({ role: 'teacher', persisted: true });
assert.ok(teacher.panel.querySelector('.btn-ai-guide-edit'), 'Giáo viên được chỉnh sửa lời giải AI');
teacher.window.close();

const apiSource = fs.readFileSync(new URL('../api/data.js', import.meta.url), 'utf8');
assert.match(apiSource, /if \(action === 'update_ai_guide'\)[\s\S]*submissionKind: 'ai_guide'/,
  'API phải cập nhật đúng bản ghi AI Guide');
// API allow/deny behavior for teacher/member is exercised in teacher-permissions.test.mjs.

// Reproduce guide rendering on standalone uploads, both fresh and restored from DB.
const mathGuide = {
  ...originalGuide,
  knowledge: String.raw`**Bổ đề.** Cho $a*b*c$ và $x<y<z$.`,
  intuition: String.raw`Xét \(u_{n+1}=u_n^2\) và \[x^2+y^2\ge2xy.\]`,
  solution: String.raw`Ta có:
$$\begin{aligned}
a_1&=1\\

 a_{n+1}&=a_n+1\tag{1}
\end{aligned}$$
Do đó $a_n=n$.`,
  pitfalls: String.raw`Với n\ge1, ta có u_n\to+\infty. Không dùng <img src=x onerror="alert(1)">.`
};
for (const persisted of [false, true]) {
  const h = await createHarness({ guide: mathGuide, support: true, persisted, statement: String.raw`Cho $x<y<z$. Tính $a*b*c$.` });
  if (!persisted) assert.equal(h.guideRequests[0].problemContent, String.raw`Cho $x<y<z$. Tính $a*b*c$.`, 'Raw problem math reaches the AI unchanged');
  const field = name => h.panel.querySelector(`[data-guide-field="${name}"] .ai-section-content`);
  assert.ok(field('knowledge').textContent.includes('$a*b*c$'), 'Markdown must not consume multiplication stars in math');
  assert.ok(field('knowledge').textContent.includes('$x<y<z$'), 'HTML parsing must not consume inequalities or delimiters');
  assert.equal(field('knowledge').querySelector('em'), null, 'No emphasis tags inside math');
  assert.ok(field('knowledge').querySelector('strong'), 'Prose Markdown still renders');
  assert.ok(field('intuition').textContent.includes(String.raw`\(u_{n+1}=u_n^2\)`));
  assert.match(field('solution').textContent, /\$\$\\begin\{aligned\}[\s\S]*\\end\{aligned\}\$\$/);
  assert.ok(field('solution').textContent.includes(String.raw`a_1&=1\\`), 'Aligned rows and ampersands remain TeX');
  assert.equal(field('solution').querySelectorAll('p').length, 1, 'Blank lines inside display math cannot split paragraphs');
  assert.equal(field('pitfalls').querySelector('img'), null, 'AI HTML is not executable markup');
  assert.ok(field('pitfalls').textContent.includes('$n\\ge1$'), 'Bare formula recovery remains available');
  h.window.editAIGuideContent(h.problemId);
  assert.equal(h.panel.querySelector('[data-guide-editor="solution"]').value, mathGuide.solution, 'Source is preserved for editing/saving');
  h.window.applyAIGuideEdits(h.problemId);
  assert.ok(field('knowledge').textContent.includes('$a*b*c$'), 'Admin edits use the same safe formatter');
  h.window.close();
}
// Live Stewart §1.1 responses may contain escaped prose newlines.
for (const persisted of [false,true]) {
 const escaped = {...originalGuide,solution:String.raw`Bước 1:\n$3x-5y=7$.\n\nBước 2:\n$y=(3x-7)/5$.\n\nVới $x\neq0$, $\nu$, $\nabla f$, $x\notin A$.`};
 const h=await createHarness({guide:escaped,persisted});
 const field=h.panel.querySelector('[data-guide-field="solution"] .ai-section-content');
 assert.equal(field.querySelectorAll('p').length,3);assert.equal(field.querySelectorAll('br').length,2);
 assert.ok(field.textContent.includes(String.raw`$x\neq0$`));assert.ok(field.textContent.includes(String.raw`$\nabla f$`));assert.ok(field.textContent.includes(String.raw`$x\notin A$`));
 assert.equal(field.textContent.includes(String.raw`\nBước`),false);
 h.window.editAIGuideContent(h.problemId);assert.equal(h.panel.querySelector('[data-guide-editor="solution"]').value,escaped.solution);
 h.window.close();
}
const bare = await createHarness({ support: true, guide: {
  ...originalGuide,
  knowledge: '<p><strong>Bổ đề</strong>: $x<y<z$.</p>',
  solution: String.raw`\begin{aligned}a_1&=1\\a_{n+1}&=a_n+1\end{aligned}`,
  pitfalls: String.raw`Ta có u_n^2=1. Với n\ge1, ta có u_n\to+\infty.`
} });
const bareSolution = bare.panel.querySelector('[data-guide-field="solution"] .ai-section-content');
assert.equal(bareSolution.textContent.trim(), String.raw`$$\begin{aligned}a_1&=1\\a_{n+1}&=a_n+1\end{aligned}$$`, 'Bare multiline environments get one complete display delimiter');
assert.ok(bare.panel.querySelector('[data-guide-field="knowledge"] strong'), 'Saved prose HTML remains readable');
const recovered = bare.panel.querySelector('[data-guide-field="pitfalls"] .ai-section-content').textContent;
assert.ok(recovered.includes('$u_n^2=1$'), 'Newly recovered formulas must not receive nested delimiters');
assert.ok(!/[\uE100\uE101\uE110\uE111]/.test(bare.panel.textContent), 'No internal placeholders reach the UI');
bare.window.close();

// Printing is available to members, and covers fresh, saved and edited guides.
for (const persisted of [false, true]) {
  const h = await createHarness({ role: 'student', persisted, support: true, guide: mathGuide });
  assert.ok(h.panel.querySelector('.btn-ai-guide-print'));
  const popup = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.test/print', runScripts: 'outside-only' });
  let prints = 0, focused = false, releaseMath, releaseFonts, renderSource;
  const order = [];
  h.window.open = (url, target) => { assert.equal(url, ''); assert.equal(target, '_blank'); order.push('open'); return popup.window; };
  popup.window.focus = () => { focused = true; };
  popup.window.print = () => { prints++; order.push('print'); };
  Object.defineProperty(popup.window.document, 'fonts', { configurable: true, value: {ready: new Promise(resolve => { releaseFonts = resolve; })} });
  h.window.MathJax.typesetPromise = async ([root]) => {
    renderSource = root.innerHTML;
    await new Promise(resolve => { releaseMath = resolve; });
    const equation = h.window.document.createElement('mjx-container'); equation.textContent = 'Rendered math'; root.append(equation);
    const css = h.window.document.createElement('style'); css.id = 'MJX-CHTML-styles'; css.textContent = 'mjx-container{display:inline-block}'; h.window.document.head.append(css);
    order.push('math');
  };
  const pending = h.window.printAIGuide(h.problemId);
  assert.equal(h.panel.querySelector('.btn-ai-guide-print').disabled, true);
  assert.equal(prints, 0, 'Do not print before MathJax completes');
  assert.ok(renderSource.includes('$a*b*c$'));
  assert.ok(renderSource.includes('$x&lt;y&lt;z$'));
  assert.ok(renderSource.includes('Đề bài'));
  releaseMath();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(prints, 0, 'Wait for print-document fonts after math');
  releaseFonts(); assert.equal(await pending, true);
  assert.equal(prints, 1); assert.equal(focused, true);
  assert.deepEqual(order, ['open', 'math', 'print']);
  const out = popup.window.document;
  assert.equal(out.querySelectorAll('section[data-guide-field]').length, 4);
  assert.ok(out.querySelector('mjx-container'));
  assert.ok(out.getElementById('MJX-CHTML-styles'));
  assert.equal(out.querySelector('main').hasAttribute('style'), false, 'Offscreen source styles never leak into the printout');
  assert.equal(out.querySelectorAll('.ai-guide-actions, textarea, script, img').length, 0);
  assert.ok(out.querySelector('style').textContent.includes('@page'));
  assert.ok(out.body.textContent.includes('Lưu dưới dạng PDF'));
  assert.equal(h.window.document.querySelector('main.tex2jax_process'), null, 'Temporary math root is cleaned up');
  assert.equal(h.panel.querySelector('.btn-ai-guide-print').disabled, false);
  assert.equal(h.submitCalls.length + h.updateCalls.length, 0, 'Printing never writes the guide to the database');
  popup.window.close(); h.window.close();
}
const draftPrint = await createHarness();
draftPrint.window.editAIGuideContent(draftPrint.problemId);
draftPrint.panel.querySelector('[data-guide-editor="solution"]').value = 'Bản đang sửa $x<y$.';
const draftPopup = new JSDOM('<!doctype html><html><body></body></html>', { runScripts:'outside-only' });
draftPrint.window.open = () => draftPopup.window; draftPopup.window.focus = () => {}; draftPopup.window.print = () => {};
assert.equal(await draftPrint.window.printAIGuide(draftPrint.problemId), true);
assert.ok(draftPopup.window.document.body.textContent.includes('Bản đang sửa $x<y$.'));
assert.equal(draftPrint.panel.dataset.guideEditing, 'true', 'Printing preserves the active editor');
assert.equal(draftPrint.updateCalls.length + draftPrint.submitCalls.length, 0);
draftPrint.window.open = () => null;
let popupNotice = '';
draftPrint.window.alert = value => { popupNotice = value; };
assert.equal(await draftPrint.window.printAIGuide(draftPrint.problemId), false);
assert.match(popupNotice, /cửa sổ bật lên/);
draftPrint.window.open = () => draftPopup.window;
draftPrint.window.MathJax.typesetPromise = async () => { throw new Error('TeX render failed'); };
assert.equal(await draftPrint.window.printAIGuide(draftPrint.problemId), false);
assert.match(draftPopup.window.document.querySelector('[role="alert"]').textContent, /TeX render failed/);
assert.equal(draftPrint.panel.querySelector('.btn-ai-guide-print').disabled, false);
draftPopup.window.close(); draftPrint.window.close();
console.log('Admin AI Guide editor, standalone LaTeX and print/PDF readiness: OK');

// Recheck sources bypasses saved-guide reuse, without silently overwriting DB data.
for(const role of ['admin','student']){
 const h=await createHarness({role,persisted:true,support:true});
 const {window,problemId}=h;window.confirm=()=>true;
 assert.ok(h.panel.querySelector('.btn-ai-guide-refresh'));
 assert.equal(h.guideRequests.length,0);
 const fresh={...originalGuide,solution:'Lời giải mới $x=2$.',quality:{verified:true,score:'5.0/5.0',retrieval:{mode:'exact',sources:[{problemKey:'tst:hcm:question-6'}]}}};
 window.fetch=async(url,options)=>{h.guideRequests.push(JSON.parse(options.body));return{ok:true,json:async()=>({success:true,data:fresh})};};
 await window.regenerateAIGuide(problemId,h.panel.querySelector('.btn-ai-guide-refresh'));
 const next=window.document.getElementById(`ai-panel-${problemId}`);
 assert.notEqual(next,h.panel);assert.ok(next.textContent.includes('Lời giải mới'));assert.ok(next.textContent.includes('tst:hcm:question-6'));
 assert.ok(next.querySelector('.ai-guide-refresh-notice'));assert.equal(h.guideRequests.length,1);assert.equal(h.guideRequests[0].contentKey,'math_support:owner:clipboard-question');
 assert.equal(h.updateCalls.length+h.submitCalls.length,0);
 // A failed refresh keeps the currently displayed proof and its source evidence.
 window.fetch=async()=>({ok:false,json:async()=>({error:'Model timeout'})});
 await window.regenerateAIGuide(problemId,next.querySelector('.btn-ai-guide-refresh'));
 assert.equal(window.document.getElementById(`ai-panel-${problemId}`),next);
 assert.ok(next.textContent.includes('Lời giải mới'));assert.match(next.querySelector('[role="alert"]').textContent,/Model timeout/);
 assert.equal(next.querySelector('.btn-ai-guide-refresh').disabled,false);
 assert.equal(window.document.querySelectorAll('.ai-guide-panel').length,1);
 // A deliberate refresh can be cancelled and cannot start twice concurrently.
 let calls=0;window.confirm=()=>false;window.fetch=async()=>{calls++;throw Error('unexpected');};
 await window.regenerateAIGuide(problemId,next.querySelector('.btn-ai-guide-refresh'));assert.equal(calls,0);
 window.confirm=()=>true;let release;window.fetch=async()=>{calls++;await new Promise(r=>{release=r;});return{ok:true,json:async()=>({success:true,data:fresh})};};
 const first=window.regenerateAIGuide(problemId,next.querySelector('.btn-ai-guide-refresh'));
 await window.regenerateAIGuide(problemId,next.querySelector('.btn-ai-guide-refresh'));assert.equal(calls,1);release();await first;
 assert.equal(window.document.querySelectorAll('.ai-guide-panel').length,1);
 window.close();
}
console.log('Saved AI Guide refresh: new retrieval, source badge, explicit save, error preservation, cancel and duplicate-click guard: OK');
