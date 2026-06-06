// Mission Control v3 — Codex-style sidebar + Claude-Code-extension-style chat.
// Vanilla ES module. Lightweight: no terminal, no heavy deps.

// ---------------------------------------------------------------- config
const LS = {
  get backend() { return (localStorage.getItem('mc_backend') || '').replace(/\/+$/, ''); },
  set backend(v) { localStorage.setItem('mc_backend', v.replace(/\/+$/, '')); },
  get token() { return localStorage.getItem('mc_token') || ''; },
  set token(v) { localStorage.setItem('mc_token', v); },
  get name() { return localStorage.getItem('mc_name') || ''; },
  set name(v) { localStorage.setItem('mc_name', v); },
};
function wsBase() { return LS.backend.replace(/^http/, 'ws'); }
function configured() { return !!LS.backend && !!LS.token; }
function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// ---------------------------------------------------------------- dom utils
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) { if (kid == null) continue; n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid); }
  return n;
}
let toastTimer;
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }
function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Codex-style thin line mic (inherits currentColor)
const MIC_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/></svg>';
const SEND_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>';
// Exact "Clawd" mascot from the Claude Code extension (resources/clawd.svg)
const CLAWD_SVG = '<svg viewBox="0 0 47 38" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.08191 10.0769V0.938461H9.37422V10.0769H5.08191ZM9.23305 10.0769V0.938461H13.5254V10.0769H9.23305ZM13.3842 10.0769V0.938461H17.6765V10.0769H13.3842ZM17.5353 10.0769V0.938461H21.8276V10.0769H17.5353ZM21.6865 10.0769V0.938461H25.9788V10.0769H21.6865ZM25.8376 10.0769V0.938461H30.1299V10.0769H25.8376ZM29.9888 10.0769V0.938461H34.2811V10.0769H29.9888ZM34.1399 10.0769V0.938461H38.4322V10.0769H34.1399ZM38.291 10.0769V0.938461H42.5834V10.0769H38.291ZM0.930769 19.0769V9.93846H5.22308V19.0769H0.930769ZM5.08191 19.0769V9.93846H9.37422V19.0769H5.08191ZM9.23305 19.0769V14.5077H13.5254V19.0769H9.23305ZM13.3842 19.0769V9.93846H17.6765V19.0769H13.3842ZM17.5353 19.0769V9.93846H21.8276V19.0769H17.5353ZM21.6865 19.0769V9.93846H25.9788V19.0769H21.6865ZM25.8376 19.0769V9.93846H30.1299V19.0769H25.8376ZM29.9888 19.0769V9.93846H34.2811V19.0769H29.9888ZM34.1399 19.0769V14.5077H38.4322V19.0769H34.1399ZM38.291 19.0769V9.93846H42.5834V19.0769H38.291ZM42.4422 19.0769V9.93846H46.7345V19.0769H42.4422ZM5.08191 28.0769V18.9385H9.37422V28.0769H5.08191ZM9.23305 28.0769V18.9385H13.5254V28.0769H9.23305ZM13.3842 28.0769V18.9385H17.6765V28.0769H13.3842ZM17.5353 28.0769V18.9385H21.8276V28.0769H17.5353ZM21.6865 28.0769V18.9385H25.9788V28.0769H21.6865ZM25.8376 28.0769V18.9385H30.1299V28.0769H25.8376ZM29.9888 28.0769V18.9385H34.2811V28.0769H29.9888ZM34.1399 28.0769V18.9385H38.4322V28.0769H34.1399ZM38.291 28.0769V18.9385H42.5834V28.0769H38.291ZM5.08191 37.0769V27.9385H9.37422V37.0769H5.08191ZM13.3842 37.0769V27.9385H17.6765V37.0769H13.3842ZM29.9888 37.0769V27.9385H34.2811V37.0769H29.9888ZM38.291 37.0769V27.9385H42.5834V37.0769H38.291Z" fill="#D97757"/></svg>';
const _sv = (b) => '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + b + '</svg>';
const ICON = {
  up: _sv('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 8 12 3 17 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  doc: _sv('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>'),
  globe: _sv('<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"/>'),
  hand: _sv('<path d="M9 11V6a1.5 1.5 0 0 1 3 0v4"/><path d="M12 10V5a1.5 1.5 0 0 1 3 0v5"/><path d="M15 11V7a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.2-1.7L4 15a1.6 1.6 0 0 1 2.3-2.2L8 14V8a1.5 1.5 0 0 1 3 0"/>'),
  code: _sv('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  plan: _sv('<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>'),
  bolt: _sv('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  shield: _sv('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
};
const MODES = [
  { id: 'ask', label: 'Ask before edits', desc: 'Claude will ask for approval before making each edit', ico: ICON.hand },
  { id: 'editauto', label: 'Edit automatically', desc: 'Claude will edit your selected text or the whole file', ico: ICON.code },
  { id: 'plan', label: 'Plan mode', desc: 'Claude will explore the code and present a plan before editing', ico: ICON.plan },
  { id: 'auto', label: 'Auto mode', desc: 'Claude will automatically choose the best permission mode for each task', ico: ICON.bolt },
  { id: 'bypass', label: 'Bypass permissions', desc: 'Claude will not ask for approval before running potentially dangerous commands', ico: ICON.shield },
];
function modeMeta(id) { return MODES.find(m => m.id === id) || MODES[4]; }

// ---------------------------------------------------------------- markdown (safe subset)
function mdToHtml(s) {
  if (!s) return '';
  const codes = [];
  s = s.replace(/```([\s\S]*?)```/g, (_, c) => { codes.push('<pre class="code">' + escapeHtml(c) + '</pre>'); return '' + (codes.length - 1) + ''; });
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push('<code>' + escapeHtml(c) + '</code>'); return '' + (codes.length - 1) + ''; });
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
  s = s.replace(/^\s*[-*]\s+(.+)$/gm, '• $1');
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/(\d+)/g, (_, i) => codes[+i]);
  return s;
}

// ---------------------------------------------------------------- api
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Authorization': 'Bearer ' + LS.token };
  let opts = { method, headers };
  if (body !== undefined) { if (body instanceof FormData) opts.body = body; else { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); } }
  let res;
  try { res = await fetch(LS.backend + path, opts); } catch { throw new Error('offline'); }
  if (res.status === 401) { go('/setup?err=auth'); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}
let skillCache = null;
async function getSkills() { if (!skillCache) { try { skillCache = (await api('/api/skills')).skills || []; } catch { skillCache = []; } } return skillCache; }

// ---------------------------------------------------------------- reconnecting ws (token in subprotocol)
function rws(path, onMsg, onOpen) {
  let ws, closed = false, delay = 600, timer;
  function open() {
    ws = new WebSocket(wsBase() + path, ['mc.' + LS.token]);
    ws.onopen = () => { delay = 600; netBanner(false); onOpen && onOpen(ws); };
    ws.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data)); } catch {} };
    ws.onclose = () => { if (closed) return; netBanner(true); timer = setTimeout(open, delay); delay = Math.min(delay * 1.7, 8000); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  open();
  return { send: (o) => { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); return true; } catch { return false; } } return false; }, close: () => { closed = true; clearTimeout(timer); try { ws.close(); } catch {} } };
}
let _banner = null;
function netBanner(show) { if (show) { if (_banner) return; _banner = el('div', { class: 'banner warn' }, 'Reconnecting…'); app.prepend(_banner); } else if (_banner) { _banner.remove(); _banner = null; } }

// ---------------------------------------------------------------- router
function go(hash) { location.hash = hash; }
function parseHash() { const h = location.hash.replace(/^#/, '') || '/'; const [path, qs] = h.split('?'); return { path, params: Object.fromEntries(new URLSearchParams(qs || '')) }; }
let mainTeardown = null, mainRepaint = null;
async function route() {
  if (mainTeardown) { try { mainTeardown(); } catch {} mainTeardown = null; }
  mainRepaint = null;
  const { path, params } = parseHash();
  if (!configured() && path !== '/setup') return go('/setup');
  if (path === '/setup') { destroyShell(); return viewSetup(params); }
  if (path === '/settings') { destroyShell(); return viewSettings(); }
  ensureShell();
  if (path.startsWith('/s/')) { const [, , proj, win] = path.split('/'); curSel = proj + '/' + win; viewSession(proj, win); }
  else { curSel = null; viewHome(); }
  refreshSidebar();
}
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------- shell
let shellBuilt = false, sideListEl = null, mainEl = null, eventsSock = null, curSel = null;
const sideData = { pinned: [], all: [], sessions: [] };
const expanded = new Set();
function destroyShell() { shellBuilt = false; sideListEl = mainEl = null; if (eventsSock) { eventsSock.close(); eventsSock = null; } }
function ensureShell() {
  if (shellBuilt) return;
  app.innerHTML = '';
  sideListEl = el('div', { class: 'side-list' });
  const sidebar = el('aside', { class: 'sidebar' },
    el('div', { class: 'side-head' }, el('div', { class: 'side-brand', title: 'Home', onclick: () => { go('/'); closeDrawer(); } }, '✳ Mission Control'), el('button', { class: 'iconbtn', title: 'Settings', onclick: () => go('/settings') }, '⚙')),
    sideListEl,
    el('button', { class: 'browse-all', onclick: openBrowseAll }, '＋ Browse all projects'));
  const scrim = el('div', { class: 'scrim', onclick: closeDrawer });
  mainEl = el('main', { class: 'main' });
  app.append(el('div', { class: 'layout' }, sidebar, scrim, mainEl));
  shellBuilt = true;
  loadSidebar();
  eventsSock = rws('/api/events', (m) => { if (m.type === 'sessions') { sideData.sessions = m.sessions; refreshSidebar(); mainRepaint && mainRepaint(); } });
}
function setMain(...nodes) { if (!mainEl) return; mainEl.innerHTML = ''; for (const n of nodes) if (n) mainEl.append(n); }
function openDrawer() { document.querySelector('.layout')?.classList.add('drawer-open'); }
function closeDrawer() { document.querySelector('.layout')?.classList.remove('drawer-open'); }

async function loadSidebar() {
  try { const [c, s] = await Promise.all([api('/api/projects/candidates'), api('/api/sessions')]); sideData.pinned = c.pinned || []; sideData.all = c.all || []; sideData.sessions = s.sessions || []; } catch {}
  refreshSidebar();
}
function termsFor(ps) { return sideData.sessions.filter(s => s.project === ps).sort((a, b) => a.window - b.window); }
function rollupStatus(t) { if (t.some(x => x.status === 'error')) return 'error'; if (t.some(x => x.status === 'idle')) return 'idle'; if (t.some(x => x.status === 'working')) return 'working'; return t.length ? 'unknown' : 'off'; }
function refreshSidebar() {
  if (!sideListEl) return;
  sideListEl.innerHTML = '';
  sideListEl.append(el('div', { class: 'side-home' + (curSel === null ? ' sel' : ''), onclick: () => { go('/'); closeDrawer(); } },
    el('span', { class: 'sh-ico' }, '⌂'), el('span', {}, 'Active conversations')));
  const by = {}; for (const c of sideData.all) by[slug(c.name)] = c;
  if (!sideData.pinned.length) sideListEl.append(el('div', { class: 'side-empty' }, 'No pinned projects. Tap “Browse all”.'));
  for (const name of sideData.pinned) {
    const ps = slug(name), cand = by[ps], terms = termsFor(ps), isOpen = expanded.has(ps);
    const row = el('div', { class: 'side-proj' + (curSel && curSel.startsWith(ps + '/') ? ' sel' : '') });
    row.append(el('div', { class: 'sp-head', onclick: () => { isOpen ? expanded.delete(ps) : expanded.add(ps); refreshSidebar(); } },
      el('span', { class: 'caret' }, isOpen ? '▾' : '▸'), el('span', { class: 'dot ' + rollupStatus(terms) }), el('span', { class: 'sp-name' }, name), terms.length ? el('span', { class: 'sp-count' }, String(terms.length)) : null));
    if (isOpen) {
      for (const t of terms) row.append(el('div', { class: 'sp-term' + (curSel === t.id ? ' active' : ''), onclick: () => { go('/s/' + t.id); closeDrawer(); } }, el('span', { class: 'dot ' + t.status }), el('span', { class: 'spt-title' }, '#' + t.window + (t.lastEventDisplay ? ' · ' + t.lastEventDisplay : ''))));
      row.append(el('div', { class: 'sp-open', onclick: () => openOrAddTerminal(name, cand && cand.cwd) }, '＋ ' + (terms.length ? 'new terminal' : 'open terminal')));
      if (!cand) row.append(el('div', { class: 'sp-note' }, 'folder not found on Desktop'));
    }
    sideListEl.append(row);
  }
}
async function openOrAddTerminal(name, cwd) {
  try { if (cwd) { try { await api('/api/projects', { method: 'POST', body: { name, cwd } }); } catch {} } const r = await api('/api/sessions', { method: 'POST', body: { project: name } }); await loadSidebar(); if (r.id) go('/s/' + r.id); closeDrawer(); }
  catch (e) { toast('open failed: ' + e.message); }
}
async function openBrowseAll() {
  const bd = el('div', { class: 'sheet-backdrop' }); bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
  const list = el('div', { class: 'sheet-list' }); const search = el('input', { placeholder: 'Search Desktop projects…', autocapitalize: 'off' });
  bd.append(el('div', { class: 'sheet' }, el('div', { class: 'sheet-grip' }), el('h3', {}, 'All projects'), el('div', { class: 'sheet-search' }, search), list));
  document.body.append(bd);
  const pinnedSet = () => new Set(sideData.pinned.map(slug));
  function paint(items) {
    list.innerHTML = ''; const pin = pinnedSet();
    for (const c of items.slice(0, 300)) {
      const isPin = pin.has(slug(c.name));
      list.append(el('div', { class: 'browse-row' },
        el('div', { class: 'br-info', onclick: () => { openOrAddTerminal(c.name, c.cwd); bd.remove(); } },
          el('div', { class: 'br-name' }, c.name, c.live ? el('span', { class: 'br-live' }, '● live') : null),
          el('div', { class: 'br-meta' }, (c.hasGit ? 'git · ' : '') + (c.hasManifest ? 'CLAUDE.md' : 'no manifest'))),
        el('button', { class: 'br-pin' + (isPin ? ' on' : ''), title: isPin ? 'Unpin' : 'Pin', onclick: async () => { try { const r = await api('/api/projects/' + (isPin ? 'unpin' : 'pin'), { method: 'POST', body: { name: c.name } }); sideData.pinned = r.pinned; refreshSidebar(); paint(flt()); } catch {} } }, isPin ? '★' : '☆')));
    }
    if (!items.length) list.append(el('div', { class: 'side-empty' }, 'No match'));
  }
  const flt = () => { const q = search.value.toLowerCase(); return sideData.all.filter(c => c.name.toLowerCase().includes(q)); };
  search.addEventListener('input', () => paint(flt())); paint(sideData.all);
}

// ---------------------------------------------------------------- HOME overview
function viewHome() {
  const wrap = el('div', { class: 'm-body home-over' });
  const head = el('div', { class: 'm-head' }, el('button', { class: 'iconbtn ham', onclick: openDrawer }, '☰'), el('div', { class: 'm-title' }, el('span', { class: 'm-proj' }, '✳ Claude Code')));
  function paint() {
    wrap.innerHTML = '';
    const live = sideData.sessions.slice().sort((a, b) => (b.lastActivityTs || 0) - (a.lastActivityTs || 0));
    if (!live.length) { wrap.append(el('div', { class: 'chat-empty' }, el('div', { class: 'ce-icon', html: CLAWD_SVG }), el('div', { class: 'ce-text', html: 'Open a project from the left to start.<br>Your teammates can chat with Claude here — no terminal needed.' }))); return; }
    wrap.append(el('div', { class: 'over-title' }, 'Active conversations'));
    const grid = el('div', { class: 'over-grid' });
    for (const s of live) grid.append(el('div', { class: 'over-card', onclick: () => go('/s/' + s.id) }, el('div', { class: 'oc-top' }, el('span', { class: 'dot ' + s.status }), el('span', { class: 'oc-name' }, s.project + ' #' + s.window)), el('div', { class: 'oc-last' }, s.lastEventDisplay || s.status)));
    wrap.append(grid);
  }
  paint(); mainRepaint = paint; setMain(head, wrap);
}

// ---------------------------------------------------------------- SESSION (Claude-extension-style chat)
function viewSession(proj, win) {
  const id = proj + '/' + win; const seen = new Set(); const pendingOpt = []; let atBottom = true;
  const log = el('div', { class: 'chatlog' });
  const empty = el('div', { class: 'chat-empty' }, el('div', { class: 'ce-icon', html: CLAWD_SVG }), el('div', { class: 'ce-text' }, 'Ask Claude anything — or type / for a command.'));
  const jump = el('button', { class: 'jump', hidden: 'true' }, '↓ latest');
  const thinking = el('div', { class: 'thinking', hidden: 'true' }, el('span', { class: 'th-star' }, '✻'), el('span', { class: 'th-word' }, 'Working'), el('span', { class: 'th-time' }, ''));
  const bodyScroll = el('div', { class: 'm-body scrollable chatscroll' }, empty, log, thinking, jump);
  bodyScroll.addEventListener('scroll', () => { atBottom = bodyScroll.scrollHeight - bodyScroll.scrollTop - bodyScroll.clientHeight < 80; jump.hidden = atBottom; });
  jump.addEventListener('click', () => { bodyScroll.scrollTop = bodyScroll.scrollHeight; });
  const toBottom = () => { if (atBottom) bodyScroll.scrollTop = bodyScroll.scrollHeight; };
  // "thinking" indicator while Claude works (like the extension's ✻ Ruminating…)
  let thinkTimer = null, thinkStart = 0, thinkN = 0;
  const WORDS = ['Thinking', 'Ruminating', 'Crunching', 'Percolating', 'Pondering', 'Noodling', 'Brewing', 'Cogitating', 'Working', 'Conjuring', 'Computing', 'Simmering', 'Mulling'];
  const thWord = thinking.querySelector('.th-word'), thTime = thinking.querySelector('.th-time');
  function setThinking(on) {
    if (on) {
      thinking.hidden = false;
      if (!thinkTimer) {
        thinkStart = Date.now(); thinkN = 0;
        const tick = () => { if (thinkN % 3 === 0) thWord.textContent = WORDS[Math.floor(Math.random() * WORDS.length)]; const s = Math.round((Date.now() - thinkStart) / 1000); thTime.textContent = s > 1 ? ` (${s}s · esc to interrupt)` : ''; thinkN++; };
        tick(); thinkTimer = setInterval(tick, 1000);
      }
      toBottom();
    } else { thinking.hidden = true; if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null; } }
  }

  const stopBtn = el('button', { class: 'stopbtn', title: 'Interrupt Claude (Esc)' }, '■ Stop');
  stopBtn.addEventListener('click', () => { if (!sock.send({ type: 'key', key: 'escape' })) api('/api/sessions/' + id + '/interrupt', { method: 'POST' }).catch(() => {}); toast('stop sent'); });
  const moreBtn = el('button', { class: 'iconbtn', title: 'Actions' }, '⋯');
  moreBtn.addEventListener('click', () => openActions(id, sock, ta));
  const header = el('div', { class: 'm-head' }, el('button', { class: 'iconbtn ham', onclick: openDrawer }, '☰'), el('div', { class: 'm-title' }, el('span', { class: 'm-proj' }, proj), el('span', { class: 'm-sub' }, '#' + win)), stopBtn, moreBtn);

  // ---- input (Claude-extension style) + slash autocomplete ----
  const ta = el('textarea', { rows: 1, placeholder: 'Reply to Claude…   (type / for commands)' });
  const autoGrow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
  const slashPop = el('div', { class: 'slash-pop', hidden: 'true' }); let slashItems = [], slashIdx = 0;
  async function updateSlash() {
    autoGrow(); const m = ta.value.match(/^\/(\S*)$/);
    if (!m) { slashPop.hidden = true; return; }
    const q = m[1].toLowerCase(); const all = await getSkills();
    const m2 = ta.value.match(/^\/(\S*)$/);                 // re-validate after await (input may have changed)
    if (!m2 || m2[1].toLowerCase() !== q) return;
    slashItems = all.filter(s => s.invocation.replace(/^\//, '').toLowerCase().includes(q)).slice(0, 8); slashIdx = 0; renderSlash();
  }
  function renderSlash() {
    if (!slashItems.length) { slashPop.hidden = true; return; }
    slashPop.innerHTML = '';
    slashItems.forEach((s, i) => slashPop.append(el('div', { class: 'slash-item' + (i === slashIdx ? ' on' : ''), onclick: () => pickSlash(s) }, el('span', { class: 'si-inv' }, s.invocation), el('span', { class: 'si-desc' }, s.description))));
    slashPop.hidden = false;
  }
  function pickSlash(s) { ta.value = s.invocation + ' '; slashPop.hidden = true; ta.focus(); autoGrow(); }
  ta.addEventListener('input', updateSlash);
  ta.addEventListener('keydown', e => {
    if (!slashPop.hidden && slashItems.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); slashIdx = (slashIdx + 1) % slashItems.length; renderSlash(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); slashIdx = (slashIdx - 1 + slashItems.length) % slashItems.length; renderSlash(); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pickSlash(slashItems[slashIdx]); return; }
      if (e.key === 'Escape') { slashPop.hidden = true; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); doSend(); }
  });
  const micBtn = el('button', { class: 'ib-mic', title: 'Voice', html: MIC_SVG });
  const sendBtn = el('button', { class: 'ib-send', title: 'Send', html: SEND_SVG });
  function doSend() {
    const text = ta.value.trim(); if (!text) return;
    ta.value = ''; autoGrow(); slashPop.hidden = true;
    if (!text.startsWith('/')) appendUser(text);  // slash commands echo back as "ran /cmd" — skip optimistic to avoid a ghost dup
    if (!sock.send({ type: 'send', text, submit: true })) api('/api/sessions/' + id + '/send', { method: 'POST', body: { text, submit: true } }).catch(() => toast('send failed'));
    setThinking(true);  // instant feedback; status heartbeat keeps/clears it
  }
  sendBtn.addEventListener('click', doSend);
  setupMic(micBtn, id, (txt) => { if (txt) appendUser(txt); });
  const plusBtn = el('button', { class: 'ib-btn', title: 'Add' }, '＋'); plusBtn.addEventListener('click', () => openPlus(id, ta));
  const slashBtn = el('button', { class: 'ib-btn', title: 'Slash command' }, '/'); slashBtn.addEventListener('click', () => { if (!ta.value.startsWith('/')) ta.value = '/' + ta.value; ta.focus(); updateSlash(); });
  const permChip = el('button', { class: 'perm-chip' }); setChip(permChip, 'bypass');
  permChip.addEventListener('click', () => openModes(id, permChip));
  api('/api/sessions/' + id + '/mode').then(d => setChip(permChip, d.mode || 'bypass')).catch(() => {});
  const composer = el('div', { class: 'composer' }, slashPop,
    el('div', { class: 'inputbox' },
      el('div', { class: 'ib-top' }, ta, micBtn),
      el('div', { class: 'ib-bar' },
        el('div', { class: 'ib-left' }, plusBtn, slashBtn),
        el('div', { class: 'ib-right' }, permChip, sendBtn))));

  function appendUser(text) { empty.hidden = true; const node = el('div', { class: 'msg user' }, el('div', { class: 'msg-label' }, LS.name || 'You'), el('div', { class: 'msg-body', html: mdToHtml(text) })); log.append(node); pendingOpt.push({ text: text.trim(), node }); toBottom(); }
  function addEvent(e) {
    if (seen.has(e.seq)) return; seen.add(e.seq); empty.hidden = true;
    if (e.role === 'user' && e.kind === 'text') { const t = (e.text || e.display || '').trim(); const i = pendingOpt.findIndex(o => o.text === t); if (i !== -1) { pendingOpt[i].node.remove(); pendingOpt.splice(i, 1); } }
    const node = renderEvent(e); if (node) { log.append(node); toBottom(); }
  }
  setMain(header, bodyScroll, composer);
  const sock = rws('/api/stream/' + proj + '/' + win, (m) => {
    if (m.type === 'snapshot') { log.innerHTML = ''; seen.clear(); pendingOpt.length = 0; empty.hidden = (m.events.length > 0); for (const e of m.events) addEvent(e); setThinking(m.status === 'working'); bodyScroll.scrollTop = bodyScroll.scrollHeight; }
    else if (m.type === 'event') addEvent(m.event);
    else if (m.type === 'status') setThinking(m.status === 'working');
  });
  mainTeardown = () => { sock.close(); if (thinkTimer) clearInterval(thinkTimer); };
}

function setChip(chipEl, modeId) {
  const m = modeMeta(modeId);
  chipEl.dataset.mode = m.id;
  chipEl.innerHTML = '<span class="pc-ico">' + m.ico + '</span><span class="pc-label">' + escapeHtml(m.label) + '</span><span class="pc-caret">▾</span>';
}

function openModes(id, chipEl) {
  const cur = chipEl.dataset.mode || 'bypass';
  const bd = el('div', { class: 'sheet-backdrop' }); bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
  const list = el('div', { class: 'more-list' });
  MODES.forEach(m => {
    list.append(el('button', {
      class: 'mode-item' + (m.id === cur ? ' on' : ''),
      onclick: async () => {
        bd.remove(); toast('switching to ' + m.label + '…', 4000);
        try {
          const r = await api('/api/sessions/' + id + '/set-mode', { method: 'POST', body: { mode: m.id } });
          setChip(chipEl, r.mode);
          toast(r.reached ? ('Mode: ' + modeMeta(r.mode).label) : ('Couldn’t switch — still ' + modeMeta(r.mode).label), 3500);
        } catch { toast('mode switch failed'); }
      }
    }, el('span', { class: 'mi-ico', html: m.ico }),
      el('span', { class: 'mi-text' }, el('span', { class: 'mi-title' }, m.label), el('span', { class: 'mi-desc' }, m.desc)),
      m.id === cur ? el('span', { class: 'mi-check' }, '✓') : null));
  });
  bd.append(el('div', { class: 'sheet' }, el('div', { class: 'sheet-grip' }),
    el('div', { class: 'modes-head' }, el('span', {}, 'Modes'), el('span', { class: 'modes-hint' }, '⇧+tab to switch')), list));
  document.body.append(bd);
}

function openPlus(id, ta) {
  const bd = el('div', { class: 'sheet-backdrop' }); bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
  const item = (ico, label, fn) => el('button', { class: 'plus-item', onclick: () => { bd.remove(); fn(); } }, el('span', { class: 'pi-ico', html: ico }), el('span', {}, label));
  bd.append(el('div', { class: 'sheet' }, el('div', { class: 'sheet-grip' }),
    el('div', { class: 'more-list' },
      item(ICON.up, 'Upload from computer', () => pickAndUpload(id, ta, '')),
      item(ICON.doc, 'Add context', () => pickAndUpload(id, ta, 'Context file: ')),
      item(ICON.globe, 'Browse the web', () => { ta.value = (ta.value ? ta.value + ' ' : '') + 'Search the web for '; ta.focus(); }))));
  document.body.append(bd);
}

function pickAndUpload(id, ta, prefix) {
  const inp = el('input', { type: 'file' });
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    toast('uploading ' + f.name + '…', 5000);
    const fd = new FormData(); fd.append('file', f, f.name);
    try { const d = await api('/api/sessions/' + id + '/upload', { method: 'POST', body: fd }); ta.value = (ta.value ? ta.value + ' ' : '') + (prefix || '') + d.path + ' '; ta.focus(); toast('attached ' + d.name); }
    catch { toast('upload failed'); }
  });
  inp.click();
}

function renderEvent(e) {
  if (e.kind === 'text') {
    if (e.role === 'user') return el('div', { class: 'msg user' }, el('div', { class: 'msg-label' }, 'You'), el('div', { class: 'msg-body', html: mdToHtml(e.text || e.display) }));
    return el('div', { class: 'msg asst', html: mdToHtml(e.text || e.display) });
  }
  if (e.kind === 'tool_call') return el('div', { class: 'tool-line' }, el('span', { class: 'tdot', html: '&#9679;' }), el('span', { class: 'ttext' }, e.display));
  if (e.kind === 'tool_result') { const ok = e.tool && e.tool.ok !== false; return el('div', { class: 'tool-res' + (ok ? '' : ' err') }, el('span', { class: 'tcorner', html: '&#9495;' }), el('span', { class: 'ttext' }, e.display)); }
  if (e.kind === 'thinking') return el('div', { class: 'think' }, '✻ ' + e.display);
  if (e.kind === 'system') {
    if (e.display.startsWith('PR #')) { const u = e.text || ''; const safe = /^https?:\/\//i.test(u) ? u : '#'; return el('div', { class: 'sys' }, el('a', { href: safe, target: '_blank', rel: 'noopener noreferrer' }, e.display)); }
    return el('div', { class: 'sys' + (/error/i.test(e.display) ? ' error' : '') }, e.display);
  }
  return null;
}

function openActions(id, sock, ta) {
  const bd = el('div', { class: 'sheet-backdrop' }); bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
  const item = (label, fn, cls = '') => el('button', { class: 'more-item ' + cls, onclick: () => { fn(); bd.remove(); } }, label);
  bd.append(el('div', { class: 'sheet' }, el('div', { class: 'sheet-grip' }), el('h3', {}, 'Actions'),
    el('div', { class: 'more-list' },
      item('⌘ Skills & commands', () => openPalette(id, ta)),
      item('⌃C  Force stop (kill running command)', () => { if (!sock.send({ type: 'key', key: 'ctrl-c' })) api('/api/sessions/' + id + '/key', { method: 'POST', body: { key: 'ctrl-c' } }).catch(() => {}); toast('Ctrl-C sent'); }),
      item('🗑  Kill this terminal', async () => { try { await api('/api/sessions/' + id, { method: 'DELETE' }); toast('terminal killed'); await loadSidebar(); go('/'); } catch { toast('kill failed'); } }, 'danger'))));
  document.body.append(bd);
}

// ---------------------------------------------------------------- palette
async function openPalette(id, ta) {
  const bd = el('div', { class: 'sheet-backdrop' }); bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
  const list = el('div', { class: 'sheet-list' }, el('div', { class: 'center-load' }, el('span', { class: 'spin' }))); const search = el('input', { placeholder: 'Search 150+ skills & commands…', autocapitalize: 'off' });
  bd.append(el('div', { class: 'sheet' }, el('div', { class: 'sheet-grip' }), el('h3', {}, 'Skills & Commands'), el('div', { class: 'sheet-search' }, search), list));
  document.body.append(bd);
  function paint(items) {
    list.innerHTML = ''; if (!items.length) { list.append(el('div', { class: 'side-empty' }, 'No match')); return; }
    for (const s of items.slice(0, 200)) list.append(el('div', { class: 'skill' },
      el('div', { class: 'info', onclick: () => { if (ta) { ta.value = (ta.value ? ta.value + ' ' : '') + s.invocation + ' '; } bd.remove(); ta && ta.focus(); } }, el('div', { class: 'inv' }, s.invocation), el('div', { class: 'desc' }, s.description)),
      el('span', { class: 'scope' }, s.scope),
      el('button', { class: 'run', title: 'Run now', onclick: async () => { bd.remove(); try { await api('/api/sessions/' + id + '/run-skill', { method: 'POST', body: { invocation: s.invocation } }); toast('ran ' + s.invocation); } catch { toast('failed'); } } }, '▶')));
  }
  const all = await getSkills(); search.addEventListener('input', () => { const q = search.value.toLowerCase(); paint(all.filter(s => s.invocation.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))); }); paint(all);
}

// ---------------------------------------------------------------- voice
let _voiceCache = { val: null, ts: 0 };
async function isVoiceEnabled() { const now = Date.now(); if (_voiceCache.val !== null && now - _voiceCache.ts < 60000) return _voiceCache.val; try { const c = await api('/api/config'); _voiceCache = { val: !!c.voiceEnabled, ts: now }; } catch { _voiceCache = { val: false, ts: now }; } return _voiceCache.val; }
function setupMic(btn, id, onText) {
  let rec = null, chunks = [], recording = false;
  async function start() {
    if (recording) return; if (!(await isVoiceEnabled())) return browserDictate();
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('mic blocked'); return; }
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      btn.classList.remove('recording'); recording = false; if (blob.size < 800) return;
      toast('transcribing…', 4000); const fd = new FormData(); fd.append('file', blob, 'voice.' + ((rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm'));
      try { const d = await api('/api/sessions/' + id + '/voice?send=true', { method: 'POST', body: fd }); if (d.transcript) { onText(d.transcript); toast('sent: ' + d.transcript.slice(0, 40)); } else toast('nothing heard'); } catch { toast('voice failed'); }
    };
    rec.start(1000); recording = true; btn.classList.add('recording'); toast('listening… tap to stop', 6000);
  }
  function stop() { if (rec && recording) rec.stop(); }
  btn.addEventListener('click', () => { recording ? stop() : start(); });
  function browserDictate() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { toast('no voice available (add GROQ_API_KEY)'); return; }
    const r = new SR(); r.lang = 'en-IN'; r.interimResults = false; btn.classList.add('recording'); toast('listening (browser)…', 6000);
    r.onresult = e => { const txt = e.results[0][0].transcript; btn.classList.remove('recording'); api('/api/sessions/' + id + '/send', { method: 'POST', body: { text: txt } }).then(() => { onText(txt); toast('sent: ' + txt.slice(0, 40)); }).catch(() => toast('send failed')); };
    r.onerror = () => { btn.classList.remove('recording'); toast('voice error'); }; r.onend = () => btn.classList.remove('recording'); r.start();
  }
}

// ---------------------------------------------------------------- SETUP / SETTINGS
function viewSetup(params) {
  const backendIn = el('input', { type: 'url', placeholder: 'https://your-mac.ts.net  or  http://localhost:8765', value: LS.backend || location.origin, autocapitalize: 'off', autocorrect: 'off' });
  const tokenIn = el('input', { type: 'password', placeholder: 'paste MC_TOKEN', value: LS.token, autocapitalize: 'off', autocorrect: 'off' });
  const nameIn = el('input', { type: 'text', placeholder: 'your name (optional)', value: LS.name, autocapitalize: 'words' });
  const status = el('p', { class: 'hint' }, params.err === 'auth' ? '⚠ Token rejected — check it.' : 'Point at your Mac and paste the token from ~/.mission-control/.env');
  if (params.err === 'auth') status.style.color = 'var(--error)';
  const btn = el('button', { class: 'btn' }, 'Test & Save');
  btn.addEventListener('click', async () => {
    const b = backendIn.value.trim().replace(/\/+$/, ''), t = tokenIn.value.trim(); if (!b || !t) return toast('Enter both fields');
    btn.innerHTML = ''; btn.append(el('span', { class: 'spin' }));
    try { const res = await fetch(b + '/api/auth/verify', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); if (res.ok) { LS.backend = b; LS.token = t; LS.name = nameIn.value.trim(); toast('Connected ✓'); go('/'); } else { status.textContent = 'Token rejected (HTTP ' + res.status + ')'; status.style.color = 'var(--error)'; } }
    catch { status.textContent = 'Could not reach ' + b; status.style.color = 'var(--error)'; } btn.textContent = 'Test & Save';
  });
  app.innerHTML = '';
  app.append(el('div', { class: 'scroll' }, el('div', { class: 'form' }, el('div', { class: 'logo' }, '✳'), el('h2', {}, 'Mission Control'), status,
    el('div', { class: 'field' }, el('label', {}, 'Backend URL'), backendIn), el('div', { class: 'field' }, el('label', {}, 'Access token'), tokenIn), el('div', { class: 'field' }, el('label', {}, 'Display name'), nameIn), btn)));
}
function viewSettings() {
  const pushRow = el('div', { class: 'setting-row' }, el('div', { class: 'k' }, 'Push notifications'), el('div', { class: 'v' }, 'checking…'));
  app.innerHTML = '';
  app.append(el('div', { class: 'topbar' }, el('button', { class: 'iconbtn backbtn', onclick: () => go('/') }, '‹'), el('div', { style: 'flex:1' }, el('h1', {}, 'Settings'))),
    el('div', { class: 'scroll' }, el('div', { class: 'form' },
      el('div', { class: 'setting-row' }, el('div', { class: 'k' }, 'Backend'), el('div', { class: 'v' }, LS.backend)),
      el('div', { class: 'setting-row' }, el('div', { class: 'k' }, 'Token'), el('div', { class: 'v' }, '••••' + LS.token.slice(-6))),
      el('div', { class: 'setting-row' }, el('div', { class: 'k' }, 'Name'), el('div', { class: 'v' }, LS.name || '—')), pushRow,
      el('button', { class: 'btn', onclick: enablePush }, 'Enable push notifications'),
      el('button', { class: 'btn secondary', onclick: testPush }, 'Send test notification'),
      el('button', { class: 'btn secondary', onclick: () => go('/setup') }, 'Change backend / token / name'),
      el('button', { class: 'btn danger', onclick: () => { localStorage.removeItem('mc_token'); go('/setup'); } }, 'Sign out'))));
  pushRow.lastChild.textContent = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
}
async function enablePush() {
  try { if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return toast('push unsupported');
    if (await Notification.requestPermission() !== 'granted') return toast('permission denied');
    const cfg = await api('/api/config'); if (!cfg.vapidPublicKey) return toast('no VAPID key on server');
    const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(cfg.vapidPublicKey) });
    await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } }); toast('push enabled ✓'); } catch (e) { toast('push failed: ' + e.message); }
}
async function testPush() { try { const d = await api('/api/push/test', { method: 'POST' }); toast('sent to ' + d.delivered + ' device(s)'); } catch { toast('failed'); } }
function urlB64ToUint8(b64) { const pad = '='.repeat((4 - b64.length % 4) % 4); const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(s); const a = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return a; }

// ---------------------------------------------------------------- boot
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
route();
