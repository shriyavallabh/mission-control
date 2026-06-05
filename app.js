// Mission Control — phone PWA. Vanilla ES module. Talks to the backend defined
// in Settings (localStorage). Implements CONTRACT.md exactly.

// ----------------------------------------------------------------------------
// config / storage
// ----------------------------------------------------------------------------
const LS = {
  get backend() { return (localStorage.getItem('mc_backend') || '').replace(/\/+$/, ''); },
  set backend(v) { localStorage.setItem('mc_backend', v.replace(/\/+$/, '')); },
  get token() { return localStorage.getItem('mc_token') || ''; },
  set token(v) { localStorage.setItem('mc_token', v); },
};
function wsBase() { return LS.backend.replace(/^http/, 'ws'); }
function configured() { return !!LS.backend && !!LS.token; }

// ----------------------------------------------------------------------------
// dom helpers
// ----------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return n;
}
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ----------------------------------------------------------------------------
// api client
// ----------------------------------------------------------------------------
async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { 'Authorization': 'Bearer ' + LS.token };
  let opts = { method, headers };
  if (body !== undefined) {
    if (body instanceof FormData) { opts.body = body; }
    else { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  let res;
  try { res = await fetch(LS.backend + path, opts); }
  catch (e) { throw new NetErr('offline'); }
  if (res.status === 401) { go('/setup?err=auth'); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (raw) return res;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}
class NetErr extends Error {}

// ----------------------------------------------------------------------------
// router
// ----------------------------------------------------------------------------
function go(hash) { location.hash = hash; }
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path, params };
}
let teardown = null;
async function route() {
  if (teardown) { try { teardown(); } catch {} teardown = null; }
  const { path, params } = parseHash();
  if (!configured() && path !== '/setup') return go('/setup');
  if (path === '/setup') return viewSetup(params);
  if (path === '/settings') return viewSettings();
  if (path.startsWith('/s/')) {
    const [, , proj, win] = path.split('/');
    return viewSession(proj, win);
  }
  return viewHome();
}
window.addEventListener('hashchange', route);

// ----------------------------------------------------------------------------
// reconnecting websocket
// ----------------------------------------------------------------------------
function rws(pathWithToken, onMsg, onOpen) {
  let ws, closed = false, delay = 600, timer;
  function open() {
    ws = new WebSocket(wsBase() + pathWithToken);
    ws.onopen = () => { delay = 600; onOpen && onOpen(ws); };
    ws.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data)); } catch {} };
    ws.onclose = () => {
      if (closed) return;
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 1.7, 8000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  open();
  return {
    send: (o) => { try { ws.readyState === 1 && ws.send(JSON.stringify(o)); } catch {} },
    close: () => { closed = true; clearTimeout(timer); try { ws.close(); } catch {} },
  };
}

// ----------------------------------------------------------------------------
// shared chrome
// ----------------------------------------------------------------------------
function topbar(title, { back = false, sub = '', right = null } = {}) {
  return el('div', { class: 'topbar' },
    back ? el('button', { class: 'iconbtn backbtn', onclick: () => go('/') }, '‹') : null,
    el('div', { style: 'flex:1;min-width:0' },
      el('h1', {}, title),
      sub ? el('div', { class: 'sub' }, sub) : null),
    right);
}

// ----------------------------------------------------------------------------
// SETUP view
// ----------------------------------------------------------------------------
function viewSetup(params) {
  const guessed = LS.backend || location.origin;
  const backendIn = el('input', { type: 'url', placeholder: 'https://your-mac.ts.net  or  http://localhost:8765', value: guessed, autocapitalize: 'off', autocorrect: 'off' });
  const tokenIn = el('input', { type: 'password', placeholder: 'paste MC_TOKEN', value: LS.token, autocapitalize: 'off', autocorrect: 'off' });
  const status = el('p', { class: 'hint' }, params.err === 'auth' ? '⚠ Token rejected — check it and try again.' : 'Point this at your Mac and paste the token from ~/.mission-control/.env');
  if (params.err === 'auth') status.style.color = 'var(--error)';
  const btn = el('button', { class: 'btn' }, 'Test & Save');
  btn.addEventListener('click', async () => {
    const b = backendIn.value.trim().replace(/\/+$/, '');
    const t = tokenIn.value.trim();
    if (!b || !t) return toast('Enter both fields');
    btn.innerHTML = ''; btn.appendChild(el('span', { class: 'spin' }));
    try {
      const res = await fetch(b + '/api/auth/verify', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
      if (res.ok) { LS.backend = b; LS.token = t; toast('Connected ✓'); go('/'); }
      else { status.textContent = 'Token rejected (HTTP ' + res.status + ')'; status.style.color = 'var(--error)'; }
    } catch (e) { status.textContent = 'Could not reach ' + b; status.style.color = 'var(--error)'; }
    btn.textContent = 'Test & Save';
  });
  render(
    el('div', { class: 'scroll' },
      el('div', { class: 'form' },
        el('div', { class: 'logo' }, '\u{1F6F0}️'),
        el('h2', {}, 'Mission Control'),
        status,
        el('div', { class: 'field' }, el('label', {}, 'Backend URL'), backendIn),
        el('div', { class: 'field' }, el('label', {}, 'Access token'), tokenIn),
        btn)));
}

// ----------------------------------------------------------------------------
// HOME view
// ----------------------------------------------------------------------------
function viewHome() {
  const list = el('div', { class: 'home-pad' }, el('div', { class: 'center-load' }, el('span', { class: 'spin' }), 'Loading sessions…'));
  const scroll = el('div', { class: 'scroll' }, list);
  render(
    topbar('Mission Control', { sub: LS.backend.replace(/^https?:\/\//, ''), right: el('button', { class: 'iconbtn', onclick: () => go('/settings') }, '⚙️') }),
    scroll);

  function paint(sessions) {
    const byProj = {};
    for (const s of sessions) (byProj[s.project] ||= []).push(s);
    const projects = Object.keys(byProj).sort();
    list.innerHTML = '';
    if (!projects.length) {
      list.appendChild(el('div', { class: 'empty' },
        el('h2', {}, 'No live terminals'),
        el('p', { html: 'Start your fleet on the Mac:<br><code>~/.mission-control/bin/fleet seed</code><br><code>~/.mission-control/bin/fleet up</code>' })));
      return;
    }
    for (const p of projects) {
      const terms = byProj[p].sort((a, b) => a.window - b.window);
      const card = el('div', { class: 'proj' },
        el('div', { class: 'proj-head' },
          el('div', { class: 'name' }, p),
          el('div', { class: 'count' }, terms.length + (terms.length === 1 ? ' term' : ' terms'))));
      for (const s of terms) {
        card.appendChild(el('div', { class: 'term', onclick: () => go('/s/' + s.project + '/' + s.window) },
          el('div', { class: 'dot ' + s.status }),
          el('div', { class: 'meta' },
            el('div', { class: 'title' }, s.title || (p + ' · ' + s.window)),
            el('div', { class: 'last' }, s.lastEventDisplay || statusLabel(s.status))),
          el('div', { class: 'win' }, '#' + s.window)));
      }
      card.appendChild(el('button', { class: 'addterm', onclick: () => addTerminal(p) }, '+ new terminal'));
      list.appendChild(card);
    }
  }
  // initial fetch + live updates
  api('/api/sessions').then(d => paint(d.sessions)).catch(e => {
    list.innerHTML = ''; list.appendChild(el('div', { class: 'empty' }, el('h2', {}, 'Can’t reach backend'), el('p', {}, String(e.message || e))));
  });
  const sock = rws('/api/events?token=' + encodeURIComponent(LS.token), (m) => { if (m.type === 'sessions') paint(m.sessions); });
  teardown = () => sock.close();
}
function statusLabel(s) { return { working: 'working…', idle: 'waiting for you', error: 'error', unknown: 'idle' }[s] || s; }

async function addTerminal(project) {
  try { const r = await api('/api/sessions', { method: 'POST', body: { project } }); toast('terminal opened'); if (r.id) go('/s/' + r.id); }
  catch (e) { toast('failed: ' + e.message); }
}

// ----------------------------------------------------------------------------
// SESSION view
// ----------------------------------------------------------------------------
function viewSession(proj, win) {
  const id = proj + '/' + win;
  const seen = new Set();
  let rawMode = false, rawTimer = null, atBottom = true;

  const feed = el('div', { class: 'feed' });
  const rawPre = el('pre', { class: 'raw', hidden: 'true' });
  const scroll = el('div', { class: 'scroll', style: 'position:relative' }, feed, rawPre);
  const jump = el('button', { class: 'jump', hidden: 'true', onclick: () => { scroll.scrollTop = scroll.scrollHeight; } }, '↓ latest');
  scroll.appendChild(jump);
  scroll.addEventListener('scroll', () => {
    atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
    jump.hidden = atBottom;
  });

  const ta = el('textarea', { rows: 1, placeholder: 'Message this terminal…', oninput: autoGrow });
  function autoGrow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  const micBtn = el('button', { class: 'cbtn mic', title: 'Voice' }, '\u{1F3A4}');
  const sendBtn = el('button', { class: 'cbtn send', title: 'Send' }, '↑');
  const statusDot = el('span', { class: 'dot unknown' });

  sendBtn.addEventListener('click', doSend);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSend(); } });

  async function doSend() {
    const text = ta.value.trim();
    if (!text) return;
    ta.value = ''; autoGrow();
    appendOptimistic(text);
    try { sock.send({ type: 'send', text, submit: true }); }
    catch { api('/api/sessions/' + id + '/send', { method: 'POST', body: { text } }).catch(() => toast('send failed')); }
  }
  function appendOptimistic(text) {
    feed.appendChild(el('div', { class: 'bubble user' }, text));
    if (atBottom) scroll.scrollTop = scroll.scrollHeight;
  }

  setupMic(micBtn, id, (txt) => { if (txt) appendOptimistic(txt); });

  const right = el('button', { class: 'iconbtn', title: 'Raw terminal', onclick: toggleRaw }, '▤');
  function toggleRaw() {
    rawMode = !rawMode;
    rawPre.hidden = !rawMode; feed.hidden = rawMode;
    right.style.color = rawMode ? 'var(--accent)' : '';
    if (rawMode) { pollRaw(); rawTimer = setInterval(pollRaw, 1300); }
    else { clearInterval(rawTimer); }
  }
  async function pollRaw() {
    try { const d = await api('/api/sessions/' + id + '/raw?lines=200'); rawPre.textContent = d.raw; rawPre.scrollTop = rawPre.scrollHeight; }
    catch {}
  }

  const escPill = el('button', { class: 'tool-pill esc', onclick: () => sock.send({ type: 'key', key: 'escape' }) }, '⎋ esc');
  const palettePill = el('button', { class: 'tool-pill', onclick: () => openPalette(id, ta) }, '⌘ skills');
  const enterPill = el('button', { class: 'tool-pill', onclick: () => sock.send({ type: 'key', key: 'enter' }) }, '↵ enter');

  const composer = el('div', { class: 'composer' },
    el('div', { class: 'composer-tools' }, palettePill, escPill, enterPill),
    el('div', { class: 'composer-row' }, micBtn, ta, sendBtn));

  render(
    topbar(proj, { back: true, sub: 'terminal #' + win, right }),
    scroll, composer);

  function setStatus(s) { statusDot.className = 'dot ' + s; }

  function addEvent(e) {
    if (seen.has(e.seq)) return;
    seen.add(e.seq);
    const node = renderEvent(e);
    if (node) { feed.appendChild(node); if (atBottom) scroll.scrollTop = scroll.scrollHeight; }
  }

  const sock = rws('/api/stream/' + proj + '/' + win + '?token=' + encodeURIComponent(LS.token), (m) => {
    if (m.type === 'snapshot') {
      feed.innerHTML = ''; seen.clear();
      for (const e of m.events) addEvent(e);
      setStatus(m.status);
      scroll.scrollTop = scroll.scrollHeight;
    } else if (m.type === 'event') { addEvent(m.event); }
    else if (m.type === 'status') { setStatus(m.status); }
    else if (m.type === 'raw') { if (rawMode) { rawPre.textContent = m.data; } }
  });
  teardown = () => { sock.close(); clearInterval(rawTimer); };
}

function renderEvent(e) {
  if (e.kind === 'text') {
    return el('div', { class: 'bubble ' + (e.role === 'user' ? 'user' : 'assistant') }, e.text || e.display);
  }
  if (e.kind === 'tool_call') {
    return el('div', { class: 'chip' }, el('span', { class: 'ico' }, toolIcon(e.tool && e.tool.name)), el('span', { class: 'txt' }, e.display));
  }
  if (e.kind === 'tool_result') {
    const ok = e.tool && e.tool.ok !== false;
    return el('div', { class: 'chip ' + (ok ? 'ok' : 'err') }, el('span', { class: 'ico' }, ok ? '✓' : '✕'), el('span', { class: 'txt' }, e.display));
  }
  if (e.kind === 'thinking') { return el('div', { class: 'think' }, '\u{1F4AD} ' + e.display); }
  if (e.kind === 'system') {
    if (e.display.startsWith('PR #')) return el('div', { class: 'sys prlink' }, el('a', { href: e.text || '#', target: '_blank' }, e.display));
    const err = /error/i.test(e.display);
    return el('div', { class: 'sys' + (err ? ' error' : '') }, e.display);
  }
  return null;
}
function toolIcon(name) {
  const m = { Bash: '▶', Read: '\u{1F4D6}', Edit: '✎', Write: '\u{1F4DD}', Skill: '✨', Agent: '\u{1F916}', Workflow: '\u{1F500}', TodoWrite: '☑', ToolSearch: '\u{1F50D}', Grep: '\u{1F50D}', Glob: '\u{1F4C2}', AskUserQuestion: '❓', ExitPlanMode: '\u{1F4CB}' };
  return m[name] || '\u{1F527}';
}

// ----------------------------------------------------------------------------
// command palette
// ----------------------------------------------------------------------------
async function openPalette(id, ta) {
  const backdrop = el('div', { class: 'sheet-backdrop' });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  const listEl = el('div', { class: 'sheet-list' }, el('div', { class: 'center-load' }, el('span', { class: 'spin' })));
  const search = el('input', { placeholder: 'Search 150+ skills & commands…', autocapitalize: 'off' });
  const sheet = el('div', { class: 'sheet' },
    el('div', { class: 'sheet-grip' }),
    el('h3', {}, 'Skills & Commands'),
    el('div', { class: 'sheet-search' }, search),
    listEl);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  let all = [];
  function paint(items) {
    listEl.innerHTML = '';
    if (!items.length) { listEl.appendChild(el('div', { class: 'empty' }, el('p', {}, 'No match'))); return; }
    for (const s of items.slice(0, 200)) {
      listEl.appendChild(el('div', { class: 'skill' },
        el('div', { class: 'info', onclick: () => { ta.value = (ta.value ? ta.value + ' ' : '') + s.invocation + ' '; backdrop.remove(); ta.focus(); } },
          el('div', { class: 'inv' }, s.invocation),
          el('div', { class: 'desc' }, s.description)),
        el('span', { class: 'scope' }, s.scope),
        el('button', { class: 'run', title: 'Run now', onclick: async () => { backdrop.remove(); try { await api('/api/sessions/' + id + '/run-skill', { method: 'POST', body: { invocation: s.invocation } }); toast('ran ' + s.invocation); } catch (e) { toast('failed'); } } }, '▶')));
    }
  }
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    paint(all.filter(s => s.invocation.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)));
  });
  try { const d = await api('/api/skills'); all = d.skills; paint(all); }
  catch (e) { listEl.innerHTML = ''; listEl.appendChild(el('div', { class: 'empty' }, el('p', {}, 'Failed to load skills'))); }
}

// ----------------------------------------------------------------------------
// voice (mic)
// ----------------------------------------------------------------------------
let voiceEnabledCache = null;
async function isVoiceEnabled() {
  if (voiceEnabledCache !== null) return voiceEnabledCache;
  try { const c = await api('/api/config'); voiceEnabledCache = !!c.voiceEnabled; } catch { voiceEnabledCache = false; }
  return voiceEnabledCache;
}
function setupMic(btn, id, onText) {
  let rec = null, chunks = [], recording = false;
  async function start() {
    if (recording) return;
    if (!(await isVoiceEnabled())) return browserDictate();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast('mic blocked'); return; }
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      btn.classList.remove('recording'); recording = false;
      if (blob.size < 800) return;
      toast('transcribing…', 4000);
      const fd = new FormData();
      fd.append('file', blob, 'voice.' + ((rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm'));
      try {
        const d = await api('/api/sessions/' + id + '/voice?send=true', { method: 'POST', body: fd });
        if (d.transcript) { onText(d.transcript); toast('sent: ' + d.transcript.slice(0, 40)); }
        else toast('nothing heard');
      } catch (e) { toast('voice failed'); }
    };
    rec.start(); recording = true; btn.classList.add('recording');
    toast('listening… tap to stop', 6000);
  }
  function stop() { if (rec && recording) rec.stop(); }
  btn.addEventListener('click', () => { recording ? stop() : start(); });

  function browserDictate() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('no voice available (add GROQ_API_KEY)'); return; }
    const r = new SR(); r.lang = 'en-IN'; r.interimResults = false;
    btn.classList.add('recording'); toast('listening (browser)…', 6000);
    r.onresult = (e) => {
      const txt = e.results[0][0].transcript;
      btn.classList.remove('recording');
      api('/api/sessions/' + id + '/send', { method: 'POST', body: { text: txt } })
        .then(() => { onText(txt); toast('sent: ' + txt.slice(0, 40)); }).catch(() => toast('send failed'));
    };
    r.onerror = () => { btn.classList.remove('recording'); toast('voice error'); };
    r.onend = () => btn.classList.remove('recording');
    r.start();
  }
}

// ----------------------------------------------------------------------------
// SETTINGS view
// ----------------------------------------------------------------------------
function viewSettings() {
  const pushRow = el('div', { class: 'setting-row' }, el('div', { class: 'k' }, 'Push notifications'), el('div', { class: 'v' }, 'checking…'));
  render(
    topbar('Settings', { back: true }),
    el('div', { class: 'scroll' },
      el('div', { class: 'form' },
        el('div', { class: 'setting-row' }, el('div', { class: 'k' }, 'Backend'), el('div', { class: 'v' }, LS.backend)),
        el('div', { class: 'setting-row' }, el('div', { class: 'k' }, 'Token'), el('div', { class: 'v' }, '••••' + LS.token.slice(-6))),
        pushRow,
        el('button', { class: 'btn', onclick: enablePush }, 'Enable push notifications'),
        el('button', { class: 'btn secondary', onclick: testPush }, 'Send test notification'),
        el('button', { class: 'btn secondary', onclick: () => go('/setup') }, 'Change backend / token'),
        el('button', { class: 'btn danger', onclick: () => { localStorage.removeItem('mc_token'); go('/setup'); } }, 'Sign out'))));
  Notification && (pushRow.lastChild.textContent = Notification.permission);
}
async function enablePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('push unsupported');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('permission denied');
    const cfg = await api('/api/config');
    if (!cfg.vapidPublicKey) return toast('no VAPID key on server');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(cfg.vapidPublicKey) });
    await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    toast('push enabled ✓');
  } catch (e) { toast('push failed: ' + e.message); }
}
async function testPush() { try { const d = await api('/api/push/test', { method: 'POST' }); toast('sent to ' + d.delivered + ' device(s)'); } catch { toast('failed'); } }
function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ----------------------------------------------------------------------------
// render + boot
// ----------------------------------------------------------------------------
function render(...nodes) { app.innerHTML = ''; for (const n of nodes) if (n) app.appendChild(n); }

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
route();
