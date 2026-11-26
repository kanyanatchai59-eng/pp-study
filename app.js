/* PP Study — static study app. Data stays in this browser (localStorage). */
'use strict';

const KEY = 'ppstudy.v1';
const SUBJECTS = ['อาญา', 'แพ่งและพาณิชย์', 'วิ.อาญา', 'วิ.แพ่ง', 'พยานหลักฐาน', 'พระธรรมนูญและศาลแขวง', 'รัฐธรรมนูญ', 'วิชาเลือก', 'ภาษาอังกฤษ'];
const ELECTIVES = ['เยาวชนและครอบครัว', 'ทรัพย์สินทางปัญญา', 'ภาษีอากร', 'แรงงาน', 'ล้มละลาย', 'การค้าระหว่างประเทศ', 'วิธีพิจารณาคดีผู้บริโภค'];
const COLS = [['todo', 'ต้องทำ'], ['doing', 'กำลังทำ'], ['review', 'ทบทวน'], ['done', 'เสร็จ']];
const TARGET_MIN = 25; // ข้อสอบจริง 10 ข้อ 4 ชม. 10 นาที ≈ 25 นาทีต่อข้อ

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const dayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TH = '๐๑๒๓๔๕๖๗๘๙';
const toThai = s => String(s).replace(/[0-9]/g, d => TH[d]);
const toArabic = s => String(s).replace(/[๐-๙]/g, d => TH.indexOf(d));
const thDate = s => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return `${d} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][m - 1]} ${y + 543}`; };
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return dayStr(new Date(y, m - 1, d + n)); };
const daysBetween = (a, b) => { const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); };

/* ---------- state ---------- */
function defaultState() {
  return {
    v: 1,
    goal: { examDate: '', elective: '', weeklyHours: 15, weeklyQuestions: 5, why: '' },
    logs: [], attempts: [], drafts: {}, lessonState: {}, myLessons: [], myQuestions: [],
    rounds: [], days: {}, unlocked: {}
  };
}
let S = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { return defaultState(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('บันทึกไม่สำเร็จ: พื้นที่ในเบราว์เซอร์อาจเต็ม'); }
  checkAchievements();
}
function markActive() { S.days[dayStr()] = true; }

/* ---------- data ---------- */
let EXAM = { questions: [] }, LAWS = [];
const lawCache = new Map();
async function loadData() {
  const [e, l] = await Promise.all([fetch('data/exam2562.json').then(r => r.json()), fetch('data/laws.json').then(r => r.json())]);
  EXAM = e; LAWS = l;
}
async function lawText(no) {
  if (lawCache.has(no)) return lawCache.get(no);
  const law = LAWS.find(x => x.no === no);
  const t = await fetch(law.file).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
  lawCache.set(no, t);
  return t;
}
function allQuestions() { return [...EXAM.questions, ...S.myQuestions.map(q => Object.assign({ set: 'ของฉัน' }, q))]; }
function lessonsFromExam() {
  const out = [];
  for (const q of EXAM.questions) q.points.forEach((p, i) => {
    if (p.deka && p.deka.length) out.push({ id: `${q.id}#${i}`, deka: p.deka, text: p.text, sections: p.sections, subject: q.subject, src: `ธงคำตอบ ปี ${q.set} ข้อ ${q.no}`, qid: q.id });
  });
  return out;
}
function allLessons() { return [...lessonsFromExam(), ...S.myLessons.map(l => Object.assign({ src: 'บทเรียนของฉัน', mine: true }, l))]; }

/* ---------- stats & achievements ---------- */
function streak() {
  let d = dayStr(), n = 0;
  if (!S.days[d]) d = addDays(d, -1);
  while (S.days[d]) { n++; d = addDays(d, -1); }
  return n;
}
function weekStart() { const d = new Date(); const wd = (d.getDay() + 6) % 7; return dayStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd)); }
function minutesSince(start) { return S.logs.filter(l => l.date >= start).reduce((a, l) => a + (+l.minutes || 0), 0); }
function totalHours() { return S.logs.reduce((a, l) => a + (+l.minutes || 0), 0) / 60; }
function bestScore(qid) { const a = S.attempts.filter(x => x.qid === qid && x.score != null); return a.length ? Math.max(...a.map(x => x.score)) : null; }
function knownLessons() { return Object.values(S.lessonState).filter(x => x.status === 'known').length; }
function roundDone(r) { return r.cards.length > 0 && r.cards.every(c => c.col === 'done'); }

const ACH = [
  ['goal', '🎯', 'ตั้งเป้าหมาย', 'บันทึกวันสอบเป้าหมาย', () => !!S.goal.examDate],
  ['elective', '🧭', 'เลือกวิชาเลือก', 'เลือกวิชาเลือก 1 วิชา', () => !!S.goal.elective],
  ['first', '✍️', 'ก้าวแรก', 'ส่งคำตอบข้อสอบข้อแรก', () => S.attempts.length >= 1],
  ['ten', '🔟', 'สิบครั้ง', 'ส่งคำตอบครบ 10 ครั้ง', () => S.attempts.length >= 10],
  ['set2562', '🏁', 'พิชิตชุด 2562', 'ทำข้อสอบปี 2562 ครบทั้ง 10 ข้อ', () => EXAM.questions.length > 0 && EXAM.questions.every(q => S.attempts.some(a => a.qid === q.id))],
  ['ace', '💯', 'ครบทุกประเด็น', 'ตรวจเองได้ 100% ในข้อใดข้อหนึ่ง', () => S.attempts.some(a => a.score === 100)],
  ['streak3', '🔥', 'ต่อเนื่อง 3 วัน', 'มีกิจกรรมเรียน 3 วันติด', () => streak() >= 3],
  ['streak7', '🔥', 'ต่อเนื่อง 7 วัน', 'มีกิจกรรมเรียน 7 วันติด', () => streak() >= 7],
  ['streak30', '🌋', 'ต่อเนื่อง 30 วัน', 'มีกิจกรรมเรียน 30 วันติด', () => streak() >= 30],
  ['h10', '⏱️', '10 ชั่วโมง', 'บันทึกเวลาเรียนสะสม 10 ชั่วโมง', () => totalHours() >= 10],
  ['h50', '⏳', '50 ชั่วโมง', 'บันทึกเวลาเรียนสะสม 50 ชั่วโมง', () => totalHours() >= 50],
  ['h100', '🏛️', '100 ชั่วโมง', 'บันทึกเวลาเรียนสะสม 100 ชั่วโมง', () => totalHours() >= 100],
  ['deka10', '📚', 'จำฎีกา 10 เรื่อง', 'กด "จำได้" ในบทเรียนฎีกา 10 เรื่อง', () => knownLessons() >= 10],
  ['deka30', '🧠', 'จำฎีกา 30 เรื่อง', 'กด "จำได้" ในบทเรียนฎีกา 30 เรื่อง', () => knownLessons() >= 30],
  ['round', '🏆', 'ปิดรอบเรียน', 'ทุกการ์ดในรอบเรียนหนึ่งรอบอยู่ช่อง "เสร็จ"', () => S.rounds.some(roundDone)]
];
let achReady = false;
function checkAchievements() {
  if (!achReady) return;
  let changed = false;
  for (const [id, e, name] of ACH) {
    const test = ACH.find(a => a[0] === id)[4];
    if (!S.unlocked[id] && test()) { S.unlocked[id] = dayStr(); changed = true; toast(`${e} ปลดล็อกความสำเร็จ: ${name}`); }
  }
  if (changed) localStorage.setItem(KEY, JSON.stringify(S));
}

/* ---------- ui helpers ---------- */
let toastTimer;
function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.display = 'none', 2600);
}
function bar(p) { return `<div class="bar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`; }
function setTop(t) { $('#topinfo').textContent = t || ''; }
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('คัดลอกแล้ว'); }
  catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); toast('คัดลอกแล้ว'); }
}

/* ---------- router ---------- */
const views = { home: viewHome, exam: viewExam, lessons: viewLessons, laws: viewLaws, goals: viewGoals, board: viewBoard, data: viewData };
let stopTimer = null;
function route() {
  if (stopTimer) { stopTimer(); stopTimer = null; }
  const h = location.hash.replace(/^#/, '') || 'home';
  const [name, ...rest] = h.split('/');
  const v = views[name] || viewHome;
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === name || (name === 'data' && a.dataset.t === 'home')));
  setTop('');
  window.scrollTo(0, 0);
  v($('#app'), rest.map(decodeURIComponent));
}
window.addEventListener('hashchange', route);

/* ---------- HOME ---------- */
function viewHome(el) {
  const g = S.goal, today = dayStr();
  const left = g.examDate ? daysBetween(today, g.examDate) : null;
  const wk = weekStart();
  const wkMin = minutesSince(wk), wkQ = S.attempts.filter(a => a.date >= wk).length;
  const due = allLessons().filter(l => { const st = S.lessonState[l.id]; return !st || st.status !== 'known' || (st.next && st.next <= today); }).length;
  const next = allQuestions().find(q => !S.attempts.some(a => a.qid === q.id));
  const recent = ACH.filter(a => S.unlocked[a[0]]).sort((a, b) => S.unlocked[b[0]].localeCompare(S.unlocked[a[0]])).slice(0, 4);
  el.innerHTML = `
  <div class="card">
    ${g.examDate ? `<h2>${left >= 0 ? `อีก ${left} วัน ถึงวันสอบเป้าหมาย` : 'เลยวันสอบเป้าหมายแล้ว'}</h2>
      <div class="muted small">วันสอบเป้าหมาย ${thDate(g.examDate)}${g.elective ? ` · วิชาเลือก: ${esc(g.elective)}` : ''}</div>
      ${g.why ? `<p class="small" style="margin:8px 0 0">“${esc(g.why)}”</p>` : ''}`
      : `<h2>เริ่มจากตั้งเป้าหมาย</h2><p class="small muted">ใส่วันสอบเป้าหมาย วิชาเลือก และเวลาเรียนต่อสัปดาห์ แล้วหน้านี้จะนับถอยหลังให้</p><a class="btn primary" href="#goals">ตั้งเป้าหมาย</a>`}
  </div>
  <div class="grid2" style="margin-bottom:12px">
    <div class="stat"><b>🔥 ${streak()}</b><span>วันติดต่อกัน</span></div>
    <div class="stat"><b>${(wkMin / 60).toFixed(1)}/${g.weeklyHours || 0}</b><span>ชั่วโมงสัปดาห์นี้</span></div>
    <div class="stat"><b>${wkQ}/${g.weeklyQuestions || 0}</b><span>ข้อที่ตอบสัปดาห์นี้</span></div>
    <div class="stat"><b>${due}</b><span>บทเรียนฎีกาที่ต้องทบทวน</span></div>
  </div>
  <div class="card">
    <h2>ทำต่อ</h2>
    ${next ? `<a class="list-item" href="#exam/${encodeURIComponent(next.id)}"><b>${next.set === 'ของฉัน' ? 'ข้อสอบของฉัน' : `ปี ${next.set} ข้อ ${next.no}`}</b> · ${esc(next.subject)}<br><span class="small muted">${esc(next.title)}</span></a>` : '<p class="small">ทำข้อสอบครบทุกข้อแล้ว ลองทำซ้ำข้อที่คะแนนต่ำ หรือเพิ่มข้อสอบของมิ้มเอง</p>'}
    <div class="row"><a class="btn" href="#lessons/due">ทบทวนฎีกา (${due})</a><a class="btn" href="#goals">บันทึกเวลาเรียน</a><a class="btn" href="#board">เปิดบอร์ด</a></div>
  </div>
  <div class="card">
    <h2>ความสำเร็จล่าสุด</h2>
    ${recent.length ? `<div class="badges">${recent.map(a => `<div class="badge on"><div class="e">${a[1]}</div><b>${a[2]}</b><small>${thDate(S.unlocked[a[0]])}</small></div>`).join('')}</div>` : '<p class="small muted">ยังไม่มี เริ่มจากตั้งเป้าหมายหรือส่งคำตอบข้อแรก</p>'}
    <p style="margin:10px 0 0"><a href="#goals">ดูทั้งหมด ${Object.keys(S.unlocked).length}/${ACH.length}</a></p>
  </div>
  <div class="card">
    <h2>โครงสร้างข้อสอบสนามใหญ่ (ข้อเขียน)</h2>
    <ul class="small" style="padding-left:18px;margin:0">
      <li><b>วันแรก</b> กฎหมายอาญา 4 ข้อ + แพ่งและพาณิชย์ 6 ข้อ เวลา 4 ชม. 10 นาที <span class="tag ok">ตามข้อสอบทางการปี 2562</span></li>
      <li><b>วันที่สอง</b> พยานหลักฐาน 3 ข้อ, พระธรรมนูญศาลยุติธรรมกับ พ.ร.บ.ศาลแขวงฯ 1 ข้อ, รัฐธรรมนูญ 1 ข้อ, วิชาเลือก 1 วิชา 2 ข้อ และภาษาอังกฤษ <span class="tag ok">ระเบียบ ก.ต. (ฉบับที่ 3) พ.ศ. 2567</span></li>
      <li><b>วันที่สาม</b> วิ.อาญา 4 ข้อ + วิ.แพ่ง 6 ข้อ <span class="tag warn">สรุปจากเว็บเอกชน ตรวจกับประกาศ ก.ต.</span></li>
      <li>ต้องแจ้งวิชาเลือกในวันยื่นใบสมัคร</li>
    </ul>
  </div>
  <div class="card"><h2>ข้อมูลของมิ้ม</h2>
    <p class="small muted" style="margin:0 0 8px">คำตอบ เป้าหมาย และบอร์ด เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ได้ขึ้นเว็บ ถ้าจะย้ายไปอีกเครื่อง ให้ส่งออกไฟล์แล้วนำเข้าที่เครื่องใหม่</p>
    <a class="btn" href="#data">ส่งออก / นำเข้าข้อมูล</a>
  </div>`;
}

/* ---------- EXAM ---------- */
let examFilter = 'ทั้งหมด';
function viewExam(el, args) {
  if (args[0] === 'new') return viewExamNew(el);
  if (args[0]) return viewQuestion(el, args[0]);
  const qs = allQuestions();
  const filters = ['ทั้งหมด', 'อาญา', 'แพ่ง', 'ยังไม่ทำ', 'ของฉัน'];
  const shown = qs.filter(q => examFilter === 'ทั้งหมด' || (examFilter === 'ยังไม่ทำ' ? !S.attempts.some(a => a.qid === q.id) : examFilter === 'ของฉัน' ? q.set === 'ของฉัน' : q.subject.startsWith(examFilter)));
  el.innerHTML = `
  <div class="card">
    <h2>ฝึกข้อสอบ</h2>
    <p class="small muted" style="margin:0">ข้อสอบจริงสนามใหญ่ปี 2562 ข้อเท็จจริงเล่าใหม่ให้กระชับแต่ครบประเด็น ต้นฉบับพร้อมธงคำตอบอยู่ที่ <a href="${esc(EXAM.url)}" target="_blank" rel="noopener">เว็บ ก.ต.</a> ตอบแล้วเทียบเฉลยทีละประเด็น</p>
    <div class="chips">${filters.map(f => `<span class="chip ${f === examFilter ? 'on' : ''}" data-f="${f}">${f}</span>`).join('')}</div>
    <div class="row"><button class="primary" id="rand">🎲 สุ่มข้อที่ยังไม่ทำ</button><a class="btn" href="#exam/new">＋ เพิ่มข้อสอบของฉัน</a></div>
  </div>
  ${shown.map(q => { const b = bestScore(q.id); const n = S.attempts.filter(a => a.qid === q.id).length; return `
    <a class="list-item" href="#exam/${encodeURIComponent(q.id)}">
      <div class="row" style="justify-content:space-between"><b>${q.set === 'ของฉัน' ? 'ข้อสอบของฉัน' : `ปี ${q.set} ข้อ ${q.no}`} · ${esc(q.subject)}</b>
      ${b != null ? `<span class="tag ${b >= 80 ? 'ok' : b >= 50 ? '' : 'warn'}">ดีที่สุด ${b}%</span>` : n ? '<span class="tag">ทำแล้ว</span>' : '<span class="tag warn">ยังไม่ทำ</span>'}</div>
      <div class="small muted">${esc(q.title)}</div></a>`; }).join('') || '<div class="empty">ไม่มีข้อในหมวดนี้</div>'}`;
  $$('.chip', el).forEach(c => c.onclick = () => { examFilter = c.dataset.f; viewExam(el, []); });
  $('#rand', el).onclick = () => {
    const pool = qs.filter(q => !S.attempts.some(a => a.qid === q.id));
    const pick = (pool.length ? pool : qs)[Math.floor(Math.random() * (pool.length || qs.length))];
    if (pick) location.hash = `exam/${encodeURIComponent(pick.id)}`;
  };
}

function claudePrompt(q, answer) {
  const year = q.set === 'ของฉัน' ? '' : q.set;
  return `ช่วยตรวจคำตอบข้อสอบผู้ช่วยผู้พิพากษาตามโปรโตคอลของ Project นี้: ชี้จุดผิดทีละข้อก่อนสรุป ติดป้าย [ตัวบท-ยืนยัน] [ฎีกา-ยืนยัน] [ความเห็น]${year ? ` และตรวจว่ามาตราที่ใช้ถูกแก้ไขหลังปี ${year} หรือไม่` : ''}

ข้อสอบ: ${q.set === 'ของฉัน' ? 'ข้อสอบของฉัน' : `ปี ${q.set} ข้อ ${q.no}`} (${q.subject}) — ${q.title}
ข้อเท็จจริง (สรุป):
${(q.facts || []).join('\n')}
คำถาม: ${q.ask}

คำตอบของฉัน:
${answer || '(ยังไม่ได้เขียน)'}

ประเด็นตามธงคำตอบ (สรุป):
${(q.points || []).map((p, i) => `${i + 1}. ${p.text}${p.sections ? ` [${p.sections}]` : ''}${p.deka && p.deka.length ? ` (เทียบ ฎ. ${p.deka.join(', ')})` : ''}`).join('\n')}`;
}

function viewQuestion(el, qid) {
  const q = allQuestions().find(x => x.id === qid);
  if (!q) { el.innerHTML = '<div class="empty">ไม่พบข้อสอบนี้ <a href="#exam">กลับ</a></div>'; return; }
  setTop(q.set === 'ของฉัน' ? 'ข้อสอบของฉัน' : `ปี ${q.set} ข้อ ${q.no}`);
  const past = S.attempts.filter(a => a.qid === qid).sort((a, b) => b.ts - a.ts);
  let revealed = false, secs = 0, running = false, iv = null;
  el.innerHTML = `
  <p><a href="#exam">‹ รายการข้อสอบ</a></p>
  <div class="card">
    <h2>${q.set === 'ของฉัน' ? 'ข้อสอบของฉัน' : `ปี ${q.set} ข้อ ${q.no}`} · ${esc(q.subject)}</h2>
    <div class="small muted" style="margin-bottom:8px">${esc(q.title)}</div>
    <div class="facts">${(q.facts || []).map(f => `<p>${esc(f)}</p>`).join('')}</div>
    <div class="ask">ให้วินิจฉัยว่า ${esc(q.ask)}</div>
    ${q.set !== 'ของฉัน' ? `<p class="tiny muted" style="margin:8px 0 0">ข้อเท็จจริงเล่าใหม่ด้วยถ้อยคำของผู้ทำเว็บ ก่อนสรุปผลให้เทียบต้นฉบับที่ <a href="${esc(EXAM.url)}" target="_blank" rel="noopener">เว็บ ก.ต.</a></p>` : ''}
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <span class="timer" id="tm">00:00</span>
      <span class="row"><button class="sm" id="tgo">▶ จับเวลา</button><button class="sm ghost" id="trs">รีเซ็ต</button></span>
    </div>
    <div class="tiny muted">เป้า ${TARGET_MIN} นาทีต่อข้อ (สอบจริง 10 ข้อ 4 ชม. 10 นาที)</div>
    <label for="ans">คำตอบ (บันทึกอัตโนมัติ) — ประเด็น → ตัวบท → ปรับบท → สรุป</label>
    <textarea id="ans" placeholder="เขียนคำตอบที่นี่">${esc(S.drafts[qid] || '')}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="primary" id="reveal">ดูเฉลยและตรวจเอง</button>
      <button id="cp">📋 คัดลอกให้ Claude ตรวจ</button>
      <a class="btn" href="https://claude.ai/projects" target="_blank" rel="noopener">เปิด Claude</a>
    </div>
  </div>
  <div id="key"></div>
  ${past.length ? `<div class="card"><h2>ประวัติการตอบ</h2>${past.map(a => `<details style="margin:6px 0"><summary>${thDate(a.date)} · ${a.score != null ? a.score + '%' : 'ยังไม่ตรวจ'} · ${Math.round((a.secs || 0) / 60)} นาที</summary><div class="small" style="white-space:pre-wrap;margin-top:6px">${esc(a.answer)}</div><button class="sm ghost" data-del="${a.id}">ลบรายการนี้</button></details>`).join('')}</div>` : ''}`;
  const ans = $('#ans', el), tm = $('#tm', el);
  ans.oninput = () => { S.drafts[qid] = ans.value; localStorage.setItem(KEY, JSON.stringify(S)); };
  const show = () => { tm.textContent = `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`; tm.classList.toggle('over', secs > TARGET_MIN * 60); };
  $('#tgo', el).onclick = () => {
    running = !running; $('#tgo', el).textContent = running ? '⏸ พัก' : '▶ จับเวลาต่อ';
    if (running) iv = setInterval(() => { secs++; show(); }, 1000); else clearInterval(iv);
  };
  $('#trs', el).onclick = () => { secs = 0; show(); };
  stopTimer = () => clearInterval(iv);
  $('#cp', el).onclick = () => copyText(claudePrompt(q, ans.value));
  $$('[data-del]', el).forEach(b => b.onclick = () => { if (!confirm('ลบประวัติการตอบรายการนี้?')) return; S.attempts = S.attempts.filter(a => a.id !== b.dataset.del); save(); viewQuestion(el, qid); });
  $('#reveal', el).onclick = () => {
    if (revealed) return; revealed = true;
    if (!ans.value.trim() && !confirm('ยังไม่ได้เขียนคำตอบ จะดูเฉลยเลยไหม?')) { revealed = false; return; }
    const k = $('#key', el);
    k.innerHTML = `<div class="card"><h2>เฉลยตามธงคำตอบ (สรุป)</h2>
      <p class="small muted" style="margin:0 0 4px">ติ๊กประเด็นที่คำตอบของมิ้มวินิจฉัยถูกและอ้างตัวบทถูก</p>
      ${(q.points || []).map((p, i) => `<label class="point" style="color:inherit;font-size:15px;margin:0"><input type="checkbox" data-i="${i}"><span>${esc(p.text)}<br>
        ${p.sections ? `<span class="tag">${esc(p.sections)}</span>` : ''}${(p.deka || []).map(d => `<span class="tag ok">เทียบ ฎ. ${esc(d)}</span>`).join('')}</span></label>`).join('')}
      ${q.note ? `<div class="note">${esc(q.note)}</div>` : ''}
      <div class="note">ธงคำตอบอิงกฎหมาย ณ ปีที่สอบ ก่อนนำไปอ้าง ให้ตรวจตัวบทฉบับปัจจุบันในแท็บตัวบท</div>
      <div class="row"><button class="primary" id="saveScore">บันทึกคะแนน</button><span class="small muted" id="sc"></span></div></div>`;
    const boxes = $$('input[type=checkbox]', k);
    const calc = () => Math.round(100 * boxes.filter(b => b.checked).length / (boxes.length || 1));
    boxes.forEach(b => b.onchange = () => $('#sc', k).textContent = `${calc()}%`);
    $('#saveScore', k).onclick = () => {
      S.attempts.push({ id: uid(), qid, date: dayStr(), ts: Date.now(), answer: ans.value, checks: boxes.map(b => b.checked), score: calc(), secs });
      if (secs >= 60) S.logs.push({ id: uid(), date: dayStr(), minutes: Math.round(secs / 60), topic: q.subject, note: `ทำข้อสอบ ${q.title}` });
      delete S.drafts[qid]; markActive(); save();
      toast(`บันทึกแล้ว ${calc()}%`); viewQuestion(el, qid);
    };
    k.scrollIntoView({ behavior: 'smooth' });
  };
}

function viewExamNew(el) {
  el.innerHTML = `<p><a href="#exam">‹ รายการข้อสอบ</a></p>
  <div class="card"><h2>เพิ่มข้อสอบของฉัน</h2>
    <p class="small muted" style="margin:0">ใช้เก็บโจทย์จากหนังสือหรือข้อสอบเนติฯ ที่ฝึกอยู่ ข้อมูลอยู่ในเครื่องนี้เท่านั้น</p>
    <label>วิชา</label><select id="sub">${SUBJECTS.map(s => `<option>${s}</option>`).join('')}</select>
    <label>ชื่อเรื่อง</label><input id="ti" placeholder="เช่น ลักทรัพย์กับยักยอก">
    <label>ข้อเท็จจริง</label><textarea id="fa" style="min-height:140px"></textarea>
    <label>คำถาม (ให้วินิจฉัยว่า…)</label><input id="as">
    <label>ประเด็นเฉลย บรรทัดละ 1 ประเด็น (ใส่มาตราในวงเล็บเหลี่ยมได้ เช่น … [ป.อ. ม.335])</label><textarea id="pts" style="min-height:120px"></textarea>
    <div class="row" style="margin-top:10px"><button class="primary" id="ok">บันทึก</button></div></div>`;
  $('#ok', el).onclick = () => {
    const title = $('#ti', el).value.trim(), facts = $('#fa', el).value.trim();
    if (!title || !facts) { toast('ใส่ชื่อเรื่องและข้อเท็จจริงก่อน'); return; }
    const points = $('#pts', el).value.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/^(.*?)\s*\[(.+)\]\s*$/); return m ? { text: m[1], sections: m[2], deka: [] } : { text: s, sections: '', deka: [] }; });
    const q = { id: 'my-' + uid(), subject: $('#sub', el).value, no: '', title, facts: facts.split(/\n+/), ask: $('#as', el).value.trim(), points };
    S.myQuestions.push(q); save(); location.hash = `exam/${encodeURIComponent(q.id)}`;
  };
}

/* ---------- LESSONS (ฎีกา) ---------- */
let lessonFilter = 'ต้องทบทวน', lessonQuery = '';
function viewLessons(el, args) {
  if (args[0] === 'due') lessonFilter = 'ต้องทบทวน';
  if (args[0] === 'new') return viewLessonNew(el);
  const today = dayStr();
  const isDue = l => { const st = S.lessonState[l.id]; return !st || st.status !== 'known' || (st.next && st.next <= today); };
  const all = allLessons();
  const filters = ['ต้องทบทวน', 'ทั้งหมด', 'จำได้แล้ว', 'อาญา', 'แพ่ง', 'ของฉัน'];
  const q = lessonQuery.trim();
  const shown = all.filter(l => {
    const st = S.lessonState[l.id];
    const okF = lessonFilter === 'ทั้งหมด' || (lessonFilter === 'ต้องทบทวน' && isDue(l)) || (lessonFilter === 'จำได้แล้ว' && st && st.status === 'known') || (lessonFilter === 'ของฉัน' && l.mine) || ((lessonFilter === 'อาญา' || lessonFilter === 'แพ่ง') && (l.subject || '').startsWith(lessonFilter));
    const okQ = !q || [l.text, l.sections, (l.deka || []).join(' '), l.note].join(' ').includes(q) || toArabic([l.text, l.sections].join(' ')).includes(toArabic(q));
    return okF && okQ;
  });
  el.innerHTML = `
  <div class="card"><h2>บทเรียนจากฎีกา</h2>
    <p class="small muted" style="margin:0">หลักกฎหมายตามที่ธงคำตอบทางการอ้างฎีกาเทียบ (สรุปจากธง ไม่ใช่คำพิพากษาฉบับเต็ม) อ่านฉบับเต็มได้ที่ <a href="https://deka.supremecourt.or.th" target="_blank" rel="noopener">ระบบสืบค้นคำพิพากษาศาลฎีกา</a></p>
    <div class="chips">${filters.map(f => `<span class="chip ${f === lessonFilter ? 'on' : ''}" data-f="${f}">${f}</span>`).join('')}</div>
    <div class="row"><input id="lq" placeholder="ค้นเลขฎีกา มาตรา หรือคำ" value="${esc(lessonQuery)}" style="flex:1"><a class="btn" href="#lessons/new">＋ บทเรียนของฉัน</a></div>
  </div>
  ${shown.map(l => { const st = S.lessonState[l.id] || {}; return `<div class="card">
    <div class="row" style="justify-content:space-between"><b>ฎ. ${esc((l.deka || []).join(', '))}</b>${st.status === 'known' ? `<span class="tag ok">จำได้ · ทบทวน ${thDate(st.next)}</span>` : st.status === 'learning' ? '<span class="tag warn">กำลังจำ</span>' : '<span class="tag">ใหม่</span>'}</div>
    <p style="margin:6px 0">${esc(l.text)}</p>
    ${l.sections ? `<span class="tag">${esc(l.sections)}</span>` : ''} <span class="tiny muted">${esc(l.src)}${l.qid ? ` · <a href="#exam/${encodeURIComponent(l.qid)}">ดูโจทย์</a>` : ''}</span>
    ${l.note ? `<p class="small muted" style="margin:6px 0 0">${esc(l.note)}</p>` : ''}
    <div class="row" style="margin-top:8px"><button class="sm primary" data-k="${esc(l.id)}">จำได้</button><button class="sm" data-a="${esc(l.id)}">ทบทวนพรุ่งนี้</button>${l.mine ? `<button class="sm ghost" data-x="${esc(l.id)}">ลบ</button>` : ''}</div>
  </div>`; }).join('') || '<div class="empty">ไม่มีบทเรียนในหมวดนี้ 🎉</div>'}`;
  $$('.chip', el).forEach(c => c.onclick = () => { lessonFilter = c.dataset.f; viewLessons(el, []); });
  const lq = $('#lq', el); lq.oninput = () => { lessonQuery = lq.value; clearTimeout(lq._t); lq._t = setTimeout(() => { viewLessons(el, []); const n = $('#lq', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); };
  $$('[data-k]', el).forEach(b => b.onclick = () => {
    const st = S.lessonState[b.dataset.k] || { reviews: 0 };
    const gaps = [3, 7, 14, 30, 60]; st.reviews = (st.reviews || 0) + 1; st.status = 'known'; st.next = addDays(dayStr(), gaps[Math.min(st.reviews - 1, gaps.length - 1)]);
    S.lessonState[b.dataset.k] = st; markActive(); save(); viewLessons(el, []);
  });
  $$('[data-a]', el).forEach(b => b.onclick = () => { S.lessonState[b.dataset.a] = { status: 'learning', next: addDays(dayStr(), 1), reviews: 0 }; markActive(); save(); viewLessons(el, []); });
  $$('[data-x]', el).forEach(b => b.onclick = () => { if (!confirm('ลบบทเรียนนี้?')) return; S.myLessons = S.myLessons.filter(x => x.id !== b.dataset.x); delete S.lessonState[b.dataset.x]; save(); viewLessons(el, []); });
}
function viewLessonNew(el) {
  el.innerHTML = `<p><a href="#lessons">‹ บทเรียนฎีกา</a></p><div class="card"><h2>เพิ่มบทเรียนของฉัน</h2>
    <p class="small muted" style="margin:0">ใส่เลขฎีกาที่เปิดอ่านจากแหล่งทางการแล้วเท่านั้น</p>
    <label>เลขฎีกา (คั่นด้วยจุลภาค)</label><input id="dk" placeholder="เช่น 1234/2566">
    <label>วิชา</label><select id="sb">${SUBJECTS.map(s => `<option>${s}</option>`).join('')}</select>
    <label>หลักที่ได้</label><textarea id="tx" style="min-height:110px"></textarea>
    <label>มาตราที่เกี่ยวข้อง</label><input id="se">
    <label>ที่มา / หมายเหตุ</label><input id="nt" placeholder="เช่น ดุลพาห 2569/1 หน้า …">
    <div class="row" style="margin-top:10px"><button class="primary" id="ok">บันทึก</button></div></div>`;
  $('#ok', el).onclick = () => {
    const deka = $('#dk', el).value.split(',').map(s => s.trim()).filter(Boolean), text = $('#tx', el).value.trim();
    if (!deka.length || !text) { toast('ใส่เลขฎีกาและหลักที่ได้ก่อน'); return; }
    S.myLessons.push({ id: 'ml-' + uid(), deka, text, subject: $('#sb', el).value, sections: $('#se', el).value.trim(), note: $('#nt', el).value.trim() });
    save(); lessonFilter = 'ของฉัน'; location.hash = 'lessons';
  };
}

/* ---------- LAWS ---------- */
function lawCard(l) {
  return `<a class="list-item" href="#laws/${l.no}"><b>${esc(l.short)}</b> <span class="tiny muted">ไฟล์ ${l.no}</span>${l.warn ? ' <span class="tag warn">มีคำเตือน</span>' : ''}<br><span class="small muted">${esc(l.title)}</span></a>`;
}
function viewLaws(el, args) {
  if (args[0]) return viewLaw(el, +args[0], args[1]);
  const core = LAWS.filter(l => l.group === 'core'), gen = LAWS.filter(l => l.group === 'general');
  const mine = S.goal.elective;
  el.innerHTML = `
  <div class="card"><h2>ค้นทุกฉบับ</h2>
    <div class="row"><input id="gq" placeholder="คำที่ต้องการค้น เช่น ค่าไถ่, ภาระจำยอม" style="flex:1"><button class="primary" id="gs">ค้น</button></div>
    <div id="gres" class="small"></div></div>
  <div class="card"><h2>ตัวบทวิชาหลัก</h2>${core.map(lawCard).join('')}</div>
  <div class="card"><h2>PP วิชาเลือก</h2>
    <p class="small" style="margin:0 0 8px">สนามใหญ่วันที่สองเลือกสอบ <b>1 วิชา 2 ข้อ</b> จาก 7 วิชา และต้องแจ้งตอนยื่นใบสมัคร (ระเบียบ ก.ต. ฉบับที่ 3 พ.ศ. 2567)${mine ? ` · วิชาที่มิ้มเลือก: <b>${esc(mine)}</b>` : ' · <a href="#goals">เลือกวิชาเลือก</a>'}</p>
    ${ELECTIVES.map(s => `<details ${s === mine ? 'open' : ''} style="margin:6px 0"><summary>${s === mine ? '⭐ ' : ''}${s}</summary><div style="margin-top:6px">${LAWS.filter(l => l.group === 'elective' && l.subjects.includes(s)).map(lawCard).join('')}</div></details>`).join('')}
    <h3>ใช้ได้ทุกวิชา</h3>${gen.map(lawCard).join('')}
    <div class="note">ล้มละลาย: ไฟล์ 39 ยังไม่รวม พ.ร.บ.ล้มละลาย (ฉบับที่ 11) พ.ศ. 2569 (ราชกิจจาฯ 24 พ.ย. 2569 ใช้บังคับเมื่อพ้น 180 วันนับแต่วันประกาศ) ให้อ่านคู่กับไฟล์ 47 · ประมวลรัษฎากร: ยังไม่ยืนยันว่ารวมการแก้ไขที่ออกเป็นกฎหมายชื่ออื่นครบ</div>
  </div>
  <p class="tiny muted">ข้อความตัวบทคัดจากระบบฐานข้อมูลกฎหมายของสำนักงานคณะกรรมการกฤษฎีกา ณ 26 พ.ย. 2569 อ้างอิงทางการให้เทียบราชกิจจานุเบกษา</p>`;
  const run = async () => {
    const q = $('#gq', el).value.trim(); const out = $('#gres', el);
    if (q.length < 2) { out.innerHTML = '<p class="muted">พิมพ์อย่างน้อย 2 ตัวอักษร</p>'; return; }
    out.innerHTML = '<p class="muted">กำลังค้น…</p>';
    const res = [];
    for (const l of LAWS) {
      let t; try { t = await lawText(l.no); } catch (e) { continue; }
      const blocks = splitBlocks(t); let n = 0;
      blocks.forEach((b, i) => { if (n < 8 && b.text.includes(q)) { n++; res.push({ l, i, b }); } });
      out.innerHTML = `<p class="muted">กำลังค้น… ${LAWS.indexOf(l) + 1}/${LAWS.length}</p>`;
    }
    out.innerHTML = res.length ? `<p class="muted">พบ ${res.length} ตำแหน่ง (แสดงไม่เกิน 8 ต่อฉบับ)</p>` + res.map(r => `<div class="hit" data-l="${r.l.no}" data-i="${r.i}"><b>${esc(r.l.short)}</b> ${esc(r.b.label)}<br>${snippet(r.b.text, q)}</div>`).join('') : '<p class="muted">ไม่พบ</p>';
    $$('.hit', out).forEach(h => h.onclick = () => { pendingHit = { i: +h.dataset.i, q }; location.hash = `laws/${h.dataset.l}`; });
  };
  $('#gs', el).onclick = run; $('#gq', el).onkeydown = e => { if (e.key === 'Enter') run(); };
}
function splitBlocks(t) {
  const parts = t.split(/\n(?=มาตรา\s*[๐-๙0-9]+)/);
  return parts.map(p => { const m = p.match(/^มาตรา\s*([๐-๙0-9]+(?:\/[๐-๙0-9]+)?)/); return { text: p, sec: m ? toArabic(m[1]) : null, label: m ? `มาตรา ${m[1]}` : 'ส่วนต้น' }; });
}
function snippet(text, q) {
  const i = text.indexOf(q); const s = Math.max(0, i - 50), e = Math.min(text.length, i + q.length + 70);
  return (s > 0 ? '…' : '') + esc(text.slice(s, i)) + '<mark>' + esc(q) + '</mark>' + esc(text.slice(i + q.length, e)) + (e < text.length ? '…' : '');
}
let pendingHit = null;
async function viewLaw(el, no, sec) {
  const l = LAWS.find(x => x.no === no);
  if (!l) { el.innerHTML = '<div class="empty">ไม่พบ</div>'; return; }
  setTop(l.short);
  el.innerHTML = `<p><a href="#laws">‹ ตัวบททั้งหมด</a></p>
  <div class="card"><h2>${esc(l.title)}</h2>
    <div class="small muted">ไฟล์ ${l.no} · ราชกิจจาฯ ล่าสุดในเชิงอรรถ: ${esc(l.latest || '-')}</div>
    ${l.url ? `<div class="small"><a href="${esc(l.url)}" target="_blank" rel="noopener">เปิดต้นฉบับที่เว็บกฤษฎีกา</a></div>` : ''}
    ${l.warn ? `<div class="note">${esc(l.warn)}</div>` : ''}</div>
  <div class="sticky-tools"><div class="row">
    <input id="sec" inputmode="numeric" placeholder="ไปมาตรา เช่น 335 หรือ 188/1" style="flex:1;min-width:120px"><button id="go">ไป</button>
    <input id="fq" placeholder="ค้นในฉบับนี้" style="flex:2;min-width:140px"><button id="fs">ค้น</button></div>
    <button class="sm" id="fshow" hidden style="margin-top:6px"></button>
    <div id="fres" class="small" style="max-height:40vh;overflow:auto"></div></div>
  <div class="card law-body" id="body"><span class="muted">กำลังโหลดตัวบท…</span></div>`;
  let t; try { t = await lawText(no); } catch (e) { $('#body', el).innerHTML = '<span class="muted">โหลดไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่</span>'; return; }
  const blocks = splitBlocks(t), seen = new Set();
  const body = $('#body', el);
  body.innerHTML = blocks.map((b, i) => { let id = ''; if (b.sec && !seen.has(b.sec)) { seen.add(b.sec); id = ` id="m-${b.sec.replace('/', '-')}"`; } return `<div class="blk" data-i="${i}"${id}>${esc(b.text)}</div>`; }).join('');
  const flash = (node, q) => {
    if (!node) return;
    if (q) { const b = blocks[+node.dataset.i]; node.innerHTML = esc(b.text).split(esc(q)).join(`<mark>${esc(q)}</mark>`); }
    node.scrollIntoView({ behavior: 'smooth', block: 'start' }); node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 1600);
  };
  const go = v => { v = toArabic(String(v).trim().replace(/^มาตรา\s*/, '')); const n = $(`#m-${CSS.escape(v.replace('/', '-'))}`, body); if (n) flash(n); else toast(`ไม่พบมาตรา ${v} ในฉบับนี้`); };
  $('#go', el).onclick = () => go($('#sec', el).value);
  $('#sec', el).onkeydown = e => { if (e.key === 'Enter') go(e.target.value); };
  const find = () => {
    const q = $('#fq', el).value.trim(), out = $('#fres', el); if (!q) { out.innerHTML = ''; return; }
    const hits = []; blocks.forEach((b, i) => { if (b.text.includes(q)) hits.push(i); });
    out.innerHTML = hits.length ? `<p class="muted">พบใน ${hits.length} ช่วง</p>` + hits.slice(0, 150).map(i => `<div class="hit" data-i="${i}"><b>${esc(blocks[i].label)}</b> ${snippet(blocks[i].text, q)}</div>`).join('') : '<p class="muted">ไม่พบ</p>';
    $$('.hit', out).forEach(h => h.onclick = () => { out.hidden = true; $('#fshow', el).hidden = false; flash($(`.blk[data-i="${h.dataset.i}"]`, body), q); });
    out.hidden = false; $('#fshow', el).hidden = true; $('#fshow', el).textContent = `แสดงผลค้น (${hits.length})`;
  };
  $('#fshow', el).onclick = () => { $('#fres', el).hidden = false; $('#fshow', el).hidden = true; };
  $('#fs', el).onclick = find; $('#fq', el).onkeydown = e => { if (e.key === 'Enter') find(); };
  if (pendingHit) { const p = pendingHit; pendingHit = null; $('#fq', el).value = p.q; setTimeout(() => flash($(`.blk[data-i="${p.i}"]`, body), p.q), 50); }
  else if (sec) go(sec);
}

/* ---------- GOALS & ACHIEVEMENTS ---------- */
function viewGoals(el) {
  const g = S.goal, wk = weekStart();
  const wkMin = minutesSince(wk), wkQ = S.attempts.filter(a => a.date >= wk).length;
  const logs = [...S.logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const bySubj = {}; S.logs.forEach(l => bySubj[l.topic] = (bySubj[l.topic] || 0) + (+l.minutes || 0));
  el.innerHTML = `
  <div class="card"><h2>เป้าหมาย</h2>
    <label>วันสอบเป้าหมาย</label><input type="date" id="ed" value="${esc(g.examDate)}">
    <label>วิชาเลือก (เลือก 1 วิชา)</label><select id="el"><option value="">ยังไม่เลือก</option>${ELECTIVES.map(s => `<option ${s === g.elective ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <div class="grid2"><div><label>ชั่วโมงเรียนต่อสัปดาห์</label><input type="number" min="0" id="wh" value="${esc(g.weeklyHours)}"></div>
    <div><label>ข้อสอบที่ตอบต่อสัปดาห์</label><input type="number" min="0" id="wq" value="${esc(g.weeklyQuestions)}"></div></div>
    <label>ทำไมต้องสอบให้ได้ (แสดงที่หน้าแรก)</label><input id="why" value="${esc(g.why)}">
    <div class="row" style="margin-top:10px"><button class="primary" id="sg">บันทึกเป้าหมาย</button></div></div>
  <div class="card"><h2>สัปดาห์นี้</h2>
    <div class="small">เวลาเรียน ${(wkMin / 60).toFixed(1)} / ${g.weeklyHours || 0} ชม.</div>${bar(g.weeklyHours ? 100 * wkMin / 60 / g.weeklyHours : 0)}
    <div class="small" style="margin-top:8px">ข้อสอบที่ตอบ ${wkQ} / ${g.weeklyQuestions || 0} ข้อ</div>${bar(g.weeklyQuestions ? 100 * wkQ / g.weeklyQuestions : 0)}
    <div class="small muted" style="margin-top:8px">เรียนต่อเนื่อง ${streak()} วัน · สะสม ${totalHours().toFixed(1)} ชม.</div></div>
  <div class="card"><h2>บันทึกเวลาเรียน</h2>
    <div class="grid2"><div><label>วันที่</label><input type="date" id="ld" value="${dayStr()}"></div><div><label>นาที</label><input type="number" min="1" id="lm" value="60"></div></div>
    <label>วิชา</label><select id="lt">${SUBJECTS.map(s => `<option>${s}</option>`).join('')}</select>
    <label>ทำอะไร</label><input id="ln" placeholder="เช่น อ่าน ป.อ. ม.334–336">
    <div class="row" style="margin-top:10px"><button class="primary" id="al">บันทึก</button></div>
    ${Object.keys(bySubj).length ? `<h3>เวลาสะสมรายวิชา</h3>${Object.entries(bySubj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="small">${esc(k)} · ${(v / 60).toFixed(1)} ชม.</div>`).join('')}` : ''}
    ${logs.length ? `<h3>ล่าสุด</h3>${logs.map(l => `<div class="row small" style="justify-content:space-between;border-top:1px solid var(--line);padding:6px 0"><span>${thDate(l.date)} · ${esc(l.topic)} · ${l.minutes} นาที<br><span class="muted">${esc(l.note)}</span></span><button class="sm ghost" data-dl="${l.id}">ลบ</button></div>`).join('')}` : ''}</div>
  <div class="card"><h2>การพิชิตความสำเร็จ ${Object.keys(S.unlocked).length}/${ACH.length}</h2>
    <div class="badges">${ACH.map(a => `<div class="badge ${S.unlocked[a[0]] ? 'on' : ''}"><div class="e">${a[1]}</div><b>${a[2]}</b><small>${S.unlocked[a[0]] ? thDate(S.unlocked[a[0]]) : esc(a[3])}</small></div>`).join('')}</div></div>`;
  $('#sg', el).onclick = () => {
    S.goal = { examDate: $('#ed', el).value, elective: $('#el', el).value, weeklyHours: +$('#wh', el).value || 0, weeklyQuestions: +$('#wq', el).value || 0, why: $('#why', el).value.trim() };
    save(); toast('บันทึกเป้าหมายแล้ว'); viewGoals(el);
  };
  $('#al', el).onclick = () => {
    const m = +$('#lm', el).value; if (!m) { toast('ใส่จำนวนนาที'); return; }
    const d = $('#ld', el).value || dayStr();
    S.logs.push({ id: uid(), date: d, minutes: m, topic: $('#lt', el).value, note: $('#ln', el).value.trim() });
    S.days[d] = true; save(); toast('บันทึกแล้ว'); viewGoals(el);
  };
  $$('[data-dl]', el).forEach(b => b.onclick = () => { S.logs = S.logs.filter(l => l.id !== b.dataset.dl); save(); viewGoals(el); });
}

/* ---------- BOARD ---------- */
let curRound = null;
function ensureRound() {
  if (!S.rounds.length) {
    S.rounds.push({ id: uid(), name: 'รอบที่ 1: ปูพื้นตัวบทและหลัก', created: dayStr(), note: '', cards: SUBJECTS.map(s => ({ id: uid(), text: s, col: 'todo' })) });
    localStorage.setItem(KEY, JSON.stringify(S));
  }
  if (!curRound || !S.rounds.find(r => r.id === curRound)) curRound = S.rounds[S.rounds.length - 1].id;
}
function viewBoard(el) {
  ensureRound();
  const r = S.rounds.find(x => x.id === curRound);
  const done = r.cards.filter(c => c.col === 'done').length;
  el.innerHTML = `
  <div class="card"><h2>บอร์ดการเรียนแต่ละรอบ</h2>
    <div class="chips">${S.rounds.map(x => `<span class="chip ${x.id === curRound ? 'on' : ''}" data-r="${x.id}">${esc(x.name.split(':')[0])}${roundDone(x) ? ' ✓' : ''}</span>`).join('')}</div>
    <div class="row" style="justify-content:space-between"><b>${esc(r.name)}</b><span class="small muted">เริ่ม ${thDate(r.created)} · เสร็จ ${done}/${r.cards.length}</span></div>
    ${bar(r.cards.length ? 100 * done / r.cards.length : 0)}
    <div class="row" style="margin-top:10px"><input id="nc" placeholder="เพิ่มการ์ด เช่น อ่าน ป.อ. ภาค 1" style="flex:1"><button class="primary" id="ac">เพิ่ม</button></div>
  </div>
  <div class="board">${COLS.map(([k, name], ci) => `<div class="col"><h4>${name} (${r.cards.filter(c => c.col === k).length})</h4>
    ${r.cards.filter(c => c.col === k).map(c => `<div class="kcard"><span class="kt">${esc(c.text)}</span><div class="row">
      ${ci > 0 ? `<button class="sm ghost" data-mv="${c.id}" data-to="${COLS[ci - 1][0]}" aria-label="ย้ายซ้าย">◀</button>` : ''}
      ${ci < COLS.length - 1 ? `<button class="sm" data-mv="${c.id}" data-to="${COLS[ci + 1][0]}" aria-label="ย้ายขวา">▶</button>` : ''}
      <button class="sm ghost" data-rm="${c.id}" aria-label="ลบ">🗑</button></div></div>`).join('')}</div>`).join('')}</div>
  <div class="card" style="margin-top:12px"><h2>สรุปรอบนี้</h2>
    <textarea id="rn" style="min-height:100px" placeholder="อะไรได้ผล อะไรต้องแก้ในรอบหน้า">${esc(r.note || '')}</textarea>
    <div class="row" style="margin-top:10px"><button id="sn">บันทึกสรุป</button><button id="rr">เปลี่ยนชื่อรอบ</button><button class="ghost" id="dr">ลบรอบนี้</button></div>
    <hr><h3>เริ่มรอบใหม่</h3>
    <input id="rnm" placeholder="เช่น รอบที่ ${S.rounds.length + 1}: ฝึกเขียนตอบจับเวลา">
    <label style="display:flex;gap:8px;align-items:center;color:inherit"><input type="checkbox" id="cp" style="width:auto" checked> ยกการ์ดที่ยังไม่เสร็จมาด้วย</label>
    <label style="display:flex;gap:8px;align-items:center;color:inherit"><input type="checkbox" id="cs" style="width:auto"> เริ่มด้วยการ์ดครบทุกวิชา</label>
    <div class="row" style="margin-top:8px"><button class="primary" id="nr">สร้างรอบใหม่</button></div></div>`;
  $$('[data-r]', el).forEach(c => c.onclick = () => { curRound = c.dataset.r; viewBoard(el); });
  const add = () => { const v = $('#nc', el).value.trim(); if (!v) return; r.cards.push({ id: uid(), text: v, col: 'todo' }); save(); viewBoard(el); };
  $('#ac', el).onclick = add; $('#nc', el).onkeydown = e => { if (e.key === 'Enter') add(); };
  $$('[data-mv]', el).forEach(b => b.onclick = () => { const c = r.cards.find(x => x.id === b.dataset.mv); c.col = b.dataset.to; markActive(); save(); viewBoard(el); });
  $$('[data-rm]', el).forEach(b => b.onclick = () => { r.cards = r.cards.filter(x => x.id !== b.dataset.rm); save(); viewBoard(el); });
  $('#sn', el).onclick = () => { r.note = $('#rn', el).value; save(); toast('บันทึกสรุปแล้ว'); };
  $('#rr', el).onclick = () => { const n = prompt('ชื่อรอบ', r.name); if (n && n.trim()) { r.name = n.trim(); save(); viewBoard(el); } };
  $('#dr', el).onclick = () => { if (!confirm(`ลบ "${r.name}" และการ์ดทั้งหมดในรอบนี้?`)) return; S.rounds = S.rounds.filter(x => x.id !== r.id); curRound = null; save(); viewBoard(el); };
  $('#nr', el).onclick = () => {
    const name = $('#rnm', el).value.trim() || `รอบที่ ${S.rounds.length + 1}`;
    let cards = [];
    if ($('#cs', el).checked) cards = SUBJECTS.map(s => ({ id: uid(), text: s, col: 'todo' }));
    if ($('#cp', el).checked) cards = cards.concat(r.cards.filter(c => c.col !== 'done' && !cards.some(x => x.text === c.text)).map(c => ({ id: uid(), text: c.text, col: 'todo' })));
    const nr = { id: uid(), name, created: dayStr(), note: '', cards }; S.rounds.push(nr); curRound = nr.id; save(); viewBoard(el);
  };
}

/* ---------- DATA ---------- */
function viewData(el) {
  el.innerHTML = `<p><a href="#home">‹ หน้าแรก</a></p>
  <div class="card"><h2>ส่งออก / นำเข้าข้อมูล</h2>
    <p class="small">ข้อมูลทั้งหมด (คำตอบ ประวัติคะแนน เป้าหมาย บันทึกเวลา บทเรียน บอร์ด) อยู่ในเบราว์เซอร์นี้เท่านั้น ถ้าล้างข้อมูลเบราว์เซอร์ ข้อมูลจะหาย ควรส่งออกเก็บไว้เป็นระยะ</p>
    <div class="row"><button class="primary" id="ex">⬇️ ส่งออกเป็นไฟล์</button><label class="btn" style="margin:0;color:inherit;font-size:15px">⬆️ นำเข้าไฟล์<input type="file" id="im" accept="application/json,.json" style="display:none"></label></div>
    <p class="tiny muted">ย้ายเครื่อง: ส่งออกจากเครื่องเดิม ส่งไฟล์ให้ตัวเอง แล้วนำเข้าที่เครื่องใหม่ (ข้อมูลในเครื่องใหม่จะถูกแทนที่)</p></div>
  <div class="card"><h2>ล้างข้อมูล</h2><p class="small muted">ลบทุกอย่างในเครื่องนี้ กู้คืนไม่ได้ ถ้ายังไม่ได้ส่งออก</p><button class="ghost" id="rs">ล้างข้อมูลทั้งหมด</button></div>`;
  $('#ex', el).onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pp-study-${dayStr()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#im', el).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!d || typeof d !== 'object' || !('goal' in d)) throw 0;
      if (!confirm('แทนที่ข้อมูลในเครื่องนี้ด้วยไฟล์ที่เลือก?')) return; S = Object.assign(defaultState(), d); save(); toast('นำเข้าแล้ว'); location.hash = 'home';
    } catch (err) { toast('ไฟล์ไม่ถูกต้อง'); }
  };
  $('#rs', el).onclick = () => { if (!confirm('ล้างข้อมูลทั้งหมดในเครื่องนี้? กู้คืนไม่ได้')) return; S = defaultState(); save(); toast('ล้างแล้ว'); location.hash = 'home'; };
}

/* ---------- boot ---------- */
(async function boot() {
  try { await loadData(); }
  catch (e) { $('#app').innerHTML = '<div class="empty">โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง</div>'; return; }
  achReady = true; checkAchievements();
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
