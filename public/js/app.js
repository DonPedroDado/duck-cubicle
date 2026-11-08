// The page: feed polling, sprites and movement, the render loop, labels, cards, settings, appearance editor.
(function () {
  const D = window.Duck, T = D.T;
  const { rnd, pick, chance, esc } = D;
  const $ = (id) => document.getElementById(id);
  const cv = $('c'), stage = $('stage'), world = $('world'), labelsEl = $('labels');
  const gctx = cv.getContext('2d');
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let officeName = '';

  // ---------- appearance (looks), stored by the server when there is one ----------
  const LOOK_KEY = 'duck.appearance';
  let looksOnServer = false;
  const images = new Map();
  D.imageOf = (src) => { if (!src) return null; let im = images.get(src); if (!im) { im = new Image(); im.src = src; images.set(src, im); } return im.complete && im.naturalWidth ? im : null; };
  const normLooks = (d) => ({ agents: (d && d.agents) || {}, names: (d && d.names) || {}, ...(d && d.logo ? { logo: d.logo } : {}) });
  async function loadLooks() {
    if (!DEMO) { try { const r = await fetch('/api/appearance', { cache: 'no-store' }); if (r.ok) { D.looks = normLooks(await r.json()); looksOnServer = true; return; } } catch (_) {} }
    try { D.looks = normLooks(JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')); } catch (_) {}
  }
  async function saveLooks() {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(D.looks)); } catch (_) {}
    if (looksOnServer && !DEMO) {
      try { const r = await fetch('/api/appearance', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-duck': '1' }, body: JSON.stringify(D.looks) }); if (!r.ok) throw 0; } catch (_) { looksOnServer = false; }
    }
  }
  function photoHead(g, s, x, y, r) {
    const im = D.imageOf(s.look && s.look.photo);
    if (!im) return false;
    g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    g.drawImage(im, x - r, y - r, r * 2, r * 2);
    g.restore();
    return true;
  }

  // ---------- sprites ----------
  function applyLook(s) {
    const lk = D.looks.agents[s.id] || {};
    s.look = lk;
    s.skin = lk.skin || s.baseSkin; s.hair = lk.hairColor || s.baseHair; s.shirt = lk.color || s.baseShirt;
    s.name = D.looks.names[s.id] || s.rawName;
    const p = lk.persona || {};
    s.temper = p.temper != null ? p.temper : s.baseTemper;
    s.thirstBase = p.thirst != null ? p.thirst : s.baseThirst;
    s.spitter = p.spitter != null ? p.spitter : s.baseSpitter;
    s.vice = p.vice || s.baseVice;
  }
  function makeSprite(a, idx) {
    const h = D.hash(a.id);
    const s = {
      id: a.id, idx, rawName: a.name, name: a.name, role: a.role || '', status: a.status || 'idle', task: a.task || '', error: a.error || '',
      seed: (h % 1000) / 100,
      baseSkin: D.SKINS[(h >>> 3) % D.SKINS.length], baseHair: D.HAIRS[h % D.HAIRS.length], baseShirt: D.SHIRTS[(h >>> 6) % D.SHIRTS.length],
      baseTemper: 0.25 + 0.7 * (((h >>> 9) & 255) / 255), baseThirst: 0.15 + 0.75 * (((h >>> 17) & 255) / 255),
      baseSpitter: (h >>> 13) % 10 < 4, baseVice: ['beer', 'beer', 'whisky', 'wine', 'vodka'][(h >>> 5) % 5],
      x: 236, y: 112, path: [], seated: false, walking: false, typing: false, dir: 0, desk: null,
      stress: 0, drunk: 0, thirst: 0.3, empties: 0, grudge: {},
      runSince: performance.now() / 1000, waitSince: 0, doneAt: 0, cdUntil: performance.now() / 1000 + 6, wanderAt: 0,
    };
    applyLook(s); s.thirst = s.thirstBase * 0.6;
    const el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = '<div class="bub" style="display:none"></div><div class="name"></div>';
    el.querySelector('.bub').addEventListener('click', () => select(s.id));
    labelsEl.appendChild(el);
    s.el = el;
    return s;
  }

  function assignDesks() {
    [...D.sprites.values()].sort((x, y) => x.idx - y.idx).forEach((s, i) => { s.desk = D.desks[i % D.desks.length]; });
  }
  function syncAgents(list) {
    const n = Math.max(list.length, 1);
    const rows = Math.max(3, Math.ceil(n / 4));
    if (rows !== D.rows || !D.desks.length) { D.layout(n); resetCam(); }
    const ids = new Set(list.map((a) => a.id));
    for (const [id, s] of D.sprites) if (!ids.has(id)) { s.gone = true; s.el.remove(); D.sprites.delete(id); }
    const now = performance.now() / 1000;
    let nextIdx = Math.max(-1, ...[...D.sprites.values()].map((s) => s.idx)) + 1;
    for (const a of list) {
      let s = D.sprites.get(a.id);
      if (!s) { s = makeSprite(a, nextIdx++); D.sprites.set(a.id, s); D.log(`${s.name} just walked in.`, ''); }
      if (a.status !== s.status) {
        if (a.status === 'running') s.runSince = now;
        if (a.status === 'waiting') s.waitSince = now;
        if (a.status === 'error') s.errHandled = false;
        if (s.status === 'running' && a.status === 'idle') s.doneAt = now;
      }
      s.rawName = a.name; s.role = a.role || ''; s.status = a.status; s.task = a.task || ''; s.error = a.error || '';
      s.name = D.looks.names[s.id] || s.rawName;
    }
    assignDesks();
  }

  const SPEED = 40;
  function step(s, dt, now) {
    if (s.kx) { s.kx *= Math.pow(0.03, dt); if (Math.abs(s.kx) < 0.3) s.kx = 0; }
    s.walking = false;
    if (s.path && s.path.length) {
      const [px, py] = s.path[0];
      const dx = px - s.x, dy = py - s.y, dist = Math.hypot(dx, dy), mv = SPEED * (1 - Math.min(0.4, s.drunk * 0.5)) * dt;
      s.seated = false; s.walking = true;
      if (dist <= mv) { s.x = px; s.y = py; s.path.shift(); }
      else { s.x += dx / dist * mv; s.y += dy / dist * mv; }
      if (Math.abs(dx) > 0.5) s.dir = dx > 0 ? 1 : -1;
      if (s.drunk > 0.3) s.y += Math.sin(now * 6 + s.seed) * s.drunk * 0.2;
    }
    const posing = D.poseOf(s);
    if (s.scene) { s.typing = false; return; }
    const atDesk = s.desk && Math.hypot(s.desk.seatX - s.x, s.desk.seatY - s.y) < 1.5;
    const toDesk = s.status === 'running' || s.status === 'waiting' || s.status === 'error' || s.status === 'paused';
    if (toDesk) {
      if (!atDesk && !s.path.length && s.desk) D.walkTo(s, s.desk.seatX, s.desk.seatY, s.desk.ay);
      if (atDesk && !s.path.length) { s.seated = true; s.x = s.desk.seatX; s.y = s.desk.seatY; s.dir = 0; }
    } else if (!s.path.length) {
      s.seated = false;
      if (s.x < 232 || now > s.wanderAt) {
        const spot = pick(D.lounge);
        D.walkTo(s, spot[0] + rnd(-4, 4), spot[1] + rnd(-3, 3));
        s.wanderAt = now + rnd(6, 14);
      } else s.dir = s.dir || 0;
    }
    s.typing = s.status === 'running' && s.seated && !posing;
  }

  // ---------- labels ----------
  function labelFor(s, now) {
    if (s.talk && s.talk.until > now) return [s.talk.text, s.talk.kind];
    if (s.status === 'error') return ['⚠ ' + (s.error || 'error'), 'err'];
    if (s.status === 'waiting' && s.seated) return ['✋ ' + (s.task && s.task !== 'needs approval' ? s.task : 'needs you'), 'wait'];
    if (s.typing) return ['⌨ ' + (s.task || 'working'), 'task'];
    if (s.status === 'idle' && s.doneAt && now - s.doneAt < 8) return ['✓ done', 'ok'];
    return ['', ''];
  }
  function placeLabels(now) {
    const k = stage.clientWidth / D.CW;
    labelsEl.style.fontSize = Math.max(8, Math.min(11, Math.round(11 * k / 2.6))) + 'px';
    const bubMax = Math.max(80, Math.floor(3.3 * T * k - 6)) + 'px', talkMax = Math.max(110, Math.floor(5.2 * T * k)) + 'px';
    const all = [];
    for (const s of D.sprites.values()) {
      s.el.style.left = (s.x * k) + 'px';
      s.el.style.top = ((s.y - 20 + (D.poseOf(s) === 'sleep' ? 3 : 0)) * k) + 'px';
      const b = s.el.firstChild, [text, cls] = labelFor(s, now);
      const talky = ['talk', 'yell', 'drunk', 'whisper'].includes(cls);
      b.style.maxWidth = talky ? talkMax : bubMax;
      if (text) { b.textContent = text; b.className = 'bub ' + cls; b.style.display = ''; } else b.style.display = 'none';
      const nm = s.el.lastChild; if (nm.textContent !== s.name) nm.textContent = s.name;
      s.el.style.visibility = '';
      const rank = s.id === D.sel ? 0 : talky ? 1 : cls === 'wait' ? 2 : cls === 'err' ? 3 : text ? 4 : 5;
      all.push({ s, b, text, rank, x: s.x * k, y: (s.y - 20) * k });
    }
    if (all.length < 2) return;
    for (const o of all) { o.w = o.s.el.offsetWidth; o.h = o.s.el.offsetHeight; const n = o.s.el.lastChild; o.nw = n.offsetWidth; o.nh = n.offsetHeight; }
    all.sort((a, b) => a.rank - b.rank || a.y - b.y);
    const placed = [];
    const hits = (r) => placed.some((p) => r.l < p.r && r.r > p.l && r.t < p.b && r.b > p.t);
    for (const o of all) {
      const full = { l: o.x - o.w / 2, r: o.x + o.w / 2, t: o.y - o.h, b: o.y };
      if (!hits(full)) { placed.push(full); continue; }
      const name = { l: o.x - o.nw / 2, r: o.x + o.nw / 2, t: o.y - o.nh, b: o.y };
      if (o.text && o.rank > 1) o.b.style.display = 'none';
      if (o.rank <= 1 || !hits(name)) placed.push(o.rank <= 1 ? full : name); else o.s.el.style.visibility = 'hidden';
    }
  }

  // ---------- camera: zoom, pan, follow ----------
  const cam = { z: 1, x: 0, y: 0 };
  function clampCam() {
    const w = stage.clientWidth, h = stage.clientHeight;
    cam.z = clamp(cam.z, 1, 4);
    cam.x = clamp(cam.x, w * (1 - cam.z), 0); cam.y = clamp(cam.y, h * (1 - cam.z), 0);
    world.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`;
  }
  function resetCam() { cam.z = 1; cam.x = cam.y = 0; D.sel = null; clampCam(); }
  function zoomAt(f, cx, cy) {
    const z0 = cam.z; cam.z = clamp(cam.z * f, 1, 4);
    cam.x = cx - (cx - cam.x) * (cam.z / z0); cam.y = cy - (cy - cam.y) * (cam.z / z0); clampCam();
  }
  function select(id) {
    D.sel = D.sel === id ? null : id;
    if (D.sel && cam.z < 2) cam.z = 2.2;
    if (!D.sel) resetCam();
    cardsKey = '';
  }
  function follow() {
    const s = D.sel && D.sprites.get(D.sel);
    if (!s || cam.z <= 1) return;
    const k = stage.clientWidth / D.CW;
    const tx = stage.clientWidth / 2 - s.x * k * cam.z, ty = stage.clientHeight / 2 - (s.y - 10) * k * cam.z;
    cam.x += (tx - cam.x) * 0.12; cam.y += (ty - cam.y) * 0.12; clampCam();
  }
  let drag = null;
  stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved && cam.z > 1) { stage.classList.add('drag'); D.sel = null; cam.x = drag.cx + dx; cam.y = drag.cy + dy; clampCam(); }
  });
  stage.addEventListener('pointerup', (e) => {
    stage.classList.remove('drag');
    if (drag && !drag.moved) {
      const r = stage.getBoundingClientRect(), k = stage.clientWidth / D.CW;
      const wx = ((e.clientX - r.left - cam.x) / cam.z) / k, wy = ((e.clientY - r.top - cam.y) / cam.z) / k;
      let best = null, bd = 1e9;
      for (const s of D.sprites.values()) { const d = Math.hypot(s.x - wx, s.y - 8 - wy); if (d < bd) { bd = d; best = s; } }
      if (best && bd < 14) select(best.id); else if (D.sel) { D.sel = null; resetCam(); cardsKey = ''; }
    }
    drag = null;
  });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  $('zin').onclick = () => zoomAt(1.3, stage.clientWidth / 2, stage.clientHeight / 2);
  $('zout').onclick = () => zoomAt(1 / 1.3, stage.clientWidth / 2, stage.clientHeight / 2);
  $('zreset').onclick = resetCam;
  window.addEventListener('resize', clampCam);

  // ---------- cards and the gossip log ----------
  let cardsKey = '';
  const PILL = { running: 'working', idle: 'idle', error: 'error', paused: 'paused', waiting: 'needs you' };
  function bar(v, color) { return `<div class="meter"><i style="width:${Math.round(v * 100)}%;background:${color}"></i></div>`; }
  function renderCards() {
    const cardsEl = $('cards');
    const list = [...D.sprites.values()].sort((a, b) => a.idx - b.idx);
    const key = JSON.stringify(list.map((s) => [s.id, s.name, s.status, s.task, s.shirt, Math.round(s.stress * 20), Math.round(s.drunk * 20), s.id === D.sel]));
    if (key === cardsKey) return;
    cardsKey = key;
    cardsEl.innerHTML = list.map((s) => `<div class="card${s.id === D.sel ? ' sel' : ''}" data-id="${esc(s.id)}">
      <div class="top"><span class="sw" style="background:${s.shirt}"></span><b>${esc(s.name)}</b><span class="role">${esc(s.role)}</span><button class="edit" data-edit="${esc(s.id)}" title="Change appearance">✎</button></div>
      <div class="st"><span class="pill p-${s.status}">${PILL[s.status] || s.status}</span>${esc(s.status === 'error' ? s.error : s.task)}</div>
      <div class="meters"><span>💢</span>${bar(s.stress, '#ff6b6b')}<span>🍺</span>${bar(s.drunk, '#e0a33b')}</div></div>`).join('');
  }
  $('cards').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]'); if (ed) return openLooks(ed.dataset.edit);
    const c = e.target.closest('.card'); if (c) select(c.dataset.id);
  });
  function renderLog() {
    if (!D.logDirty) return; D.logDirty = false;
    $('log-list').innerHTML = (D.logLines || []).map((l) => `<div class="ev ${l.kind}"><time>${l.t}</time>${esc(l.text)}</div>`).join('') || '<div class="ev">Quiet. Too quiet.</div>';
  }

  // ---------- main loop ----------
  let last = performance.now() / 1000;
  function frame() {
    const now = performance.now() / 1000;
    if (!D.settings.anim) { setTimeout(() => requestAnimationFrame(frame), 400); return; }
    if (now - last < 1 / Number(D.settings.fps || 60) - 0.004) { requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, now - last); last = now; D.now = now;
    for (const s of D.sprites.values()) step(s, dt, now);
    D.tickChaos(dt);
    draw(now);
    placeLabels(now); follow(); renderCards(); renderLog();
    requestAnimationFrame(frame);
  }
  function draw(now) {
    const g = gctx, S = D.S || 3;
    g.setTransform(S, 0, 0, S, 0, 0); g.imageSmoothingEnabled = false; g.clearRect(0, 0, D.CW, D.CH);
    D.shake = Math.max(0, D.shake - 0.02);
    if (D.shake > 0) g.translate(rnd(-1, 1) * D.shake * 3, rnd(-1, 1) * D.shake * 3);
    D.drawRoom(g, now);
    const logo = D.imageOf(D.looks.logo);
    if (logo) { g.imageSmoothingEnabled = true; g.drawImage(logo, 11.75 * T, 5, 18, 18); g.imageSmoothingEnabled = false; }
    const list = []; D.props(g, now, list);
    const byDesk = new Map();
    for (const s of D.sprites.values()) byDesk.set(s.desk, s);
    const count = Math.max(4, Math.min(D.desks.length, Math.ceil(D.sprites.size / 4) * 4));
    D.desks.slice(0, count).forEach((d) => list.push({ z: d.y + 21, f: () => D.drawDesk(g, d, byDesk.get(d), now) }));
    for (const s of D.sprites.values()) list.push({ z: s.y, f: () => D.drawChar(g, s, now, photoHead) });
    const sel = D.sel && D.sprites.get(D.sel);
    if (sel) list.push({ z: sel.y - 0.01, f: () => D.drawRing(g, sel) });
    list.sort((a, b) => a.z - b.z).forEach((o) => o.f());
    D.drawFx(g, now);
  }

  // ---------- feed ----------
  const NAMES = [['Rex', 'CEO'], ['Mia', 'WebDev'], ['Sam', 'QA'], ['Dot', 'Analyst'], ['Bo', 'SEO'], ['Lou', 'Growth']];
  const TASKS = ['Bash: npm test', 'Edit: index.html', 'Grep: TODO', 'Read: server.js', 'Bash: git push -f', 'Write: report.md', 'Agent: refactor'];
  const demo = NAMES.map(([name, role], i) => ({ id: 'demo-' + i, name, role, status: 'idle', task: '', error: '', until: 2 + i * 3 }));
  function demoFeed() {
    const now = performance.now() / 1000;
    for (const a of demo) {
      if (now < a.until) continue;
      const r = Math.random();
      if (a.status === 'running' && r < 0.2) { a.status = 'error'; a.error = pick(['exit code 1', 'tests failed', 'merge conflict', 'ENOENT']); a.until = now + rnd(5, 8); }
      else if (a.status === 'running' && r < 0.3) { a.status = 'waiting'; a.task = 'needs approval'; a.until = now + rnd(15, 40); }
      else if (a.status === 'running') { a.status = 'idle'; a.task = ''; a.until = now + rnd(12, 30); }
      else { a.status = 'running'; a.task = pick(TASKS); a.error = ''; a.until = now + rnd(12, 35); }
    }
    return { company: 'Duck & Co', agents: demo.map(({ id, name, role, status, task, error }) => ({ id, name, role, status, task, error })) };
  }
  async function poll() {
    const banner = $('banner');
    try {
      const feed = DEMO ? demoFeed() : await (await fetch('/api/feed', { cache: 'no-store' })).json();
      officeName = D.settings.name || feed.company || 'Duck & Co';
      $('company').textContent = officeName;
      syncAgents(feed.agents || []);
      const working = (feed.agents || []).filter((a) => a.status === 'running').length;
      $('status').textContent = `${(feed.agents || []).length} agents · ${working} working · ${new Date().toLocaleTimeString()}`;
      if (!(feed.agents || []).length) { banner.style.display = 'block'; banner.innerHTML = 'Nobody is at work yet. Run <code>duck-cubicle install-hooks</code> and start a Claude Code session, or open <a href="?demo" style="color:var(--link)">?demo</a> for a pretend office.'; }
      else banner.style.display = 'none';
    } catch (e) { $('status').textContent = 'server not reachable'; }
    setTimeout(poll, DEMO ? 1000 : 2000);
  }

  // ---------- settings ----------
  function initSettings() {
    const S = D.settings;
    $('s-chaos').value = S.chaos; $('s-lang').value = S.lang; $('s-sound').checked = S.sound; $('s-fps').value = S.fps;
    $('s-anim').checked = S.anim; $('s-cards').checked = S.cards; $('s-log').checked = S.log; $('s-name').value = S.name || '';
    const apply = () => { $('cards').style.display = S.cards ? '' : 'none'; $('log').style.display = S.log ? '' : 'none'; };
    const bind = (id, key, get) => { $(id).addEventListener('change', () => { S[key] = get($(id)); D.saveSettings(); apply(); if (key === 'name') { officeName = S.name; $('company').textContent = S.name || 'Duck & Co'; } }); };
    bind('s-chaos', 'chaos', (e) => Number(e.value)); bind('s-lang', 'lang', (e) => e.value); bind('s-sound', 'sound', (e) => e.checked);
    bind('s-fps', 'fps', (e) => Number(e.value)); bind('s-anim', 'anim', (e) => e.checked); bind('s-cards', 'cards', (e) => e.checked);
    bind('s-log', 'log', (e) => e.checked); bind('s-name', 'name', (e) => e.value.trim());
    $('s-name').addEventListener('input', () => { S.name = $('s-name').value.trim(); D.saveSettings(); $('company').textContent = S.name || officeName || 'Duck & Co'; });
    apply();
    $('gear').onclick = () => { const o = $('settings').classList.toggle('open'); $('gear').setAttribute('aria-expanded', o); };
    document.addEventListener('click', (e) => { if (!e.target.closest('.right')) { $('settings').classList.remove('open'); $('gear').setAttribute('aria-expanded', 'false'); } });
    $('b-fight').onclick = () => D.fightNow();
    $('b-happy').onclick = () => D.happyHour();
    $('b-logo').onclick = () => $('f-logo').click();
    $('f-logo').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; D.looks.logo = await shrink(f, 64); saveLooks(); e.target.value = ''; };
    $('b-logo-clear').onclick = () => { delete D.looks.logo; saveLooks(); };
    $('b-export').onclick = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D.looks, null, 2)], { type: 'application/json' }));
      a.download = 'duck-cubicle-appearance.json'; document.body.appendChild(a); a.click(); a.remove();
    };
    $('b-import').onclick = () => $('f-import').click();
    $('f-import').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { D.looks = normLooks(JSON.parse(await f.text())); await saveLooks(); for (const s of D.sprites.values()) applyLook(s); cardsKey = ''; } catch (_) { alert('That file is not a Duck Cubicle appearance export.'); }
      e.target.value = '';
    };
  }
  // downscale an image to a square data URL (centre crop)
  function shrink(file, size) {
    return new Promise((res, rej) => {
      const im = new Image(); const url = URL.createObjectURL(file);
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const m = Math.min(im.naturalWidth, im.naturalHeight);
        c.getContext('2d').drawImage(im, (im.naturalWidth - m) / 2, (im.naturalHeight - m) / 2, m, m, 0, 0, size, size);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85));
      };
      im.onerror = rej; im.src = url;
    });
  }

  // ---------- appearance dialog ----------
  const HAIR_STYLES = [['short', 'Short'], ['long', 'Long'], ['bun', 'Bun'], ['pony', 'Ponytail'], ['curly', 'Curly'], ['mohawk', 'Mohawk'], ['bald', 'Bald']];
  let previewRaf = 0;
  function openLooks(id) {
    const s = D.sprites.get(id); if (!s) return;
    const dlg = $('looks');
    const d = { ...(D.looks.agents[id] || {}) }; d.persona = { ...(d.persona || {}) };
    let name = D.looks.names[id] || '';
    const val = (k, f) => (d[k] != null && d[k] !== '' ? d[k] : f);
    const sel = (k, opts) => `<select data-k="${k}"><option value="">–</option>${opts.map(([v, l]) => `<option value="${v}"${d[k] === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    dlg.innerHTML = `<h2>Appearance · ${esc(s.rawName)}</h2><div class="cols"><canvas id="pv" width="144" height="192"></canvas><div class="grid">
      <label>Name</label><input type="text" id="lk-name" maxlength="24" value="${esc(name)}" placeholder="${esc(s.rawName)}">
      <label>Hair</label>${sel('hair', HAIR_STYLES)}
      <label>Hair colour</label><input type="color" data-k="hairColor" value="${val('hairColor', s.baseHair)}">
      <label>Skin</label><div class="swatches">${D.SKINS.map((c) => `<i data-skin="${c}" style="background:${c}" class="${val('skin', s.baseSkin) === c ? 'on' : ''}"></i>`).join('')}</div>
      <label>Shirt</label><input type="color" data-k="color" value="${val('color', s.baseShirt)}">
      <label>Bottoms</label>${sel('bottom', [['trousers', 'Trousers'], ['skirt', 'Skirt']])}
      <label>Shoes</label>${sel('shoes', [['flats', 'Flat'], ['heels', 'Heels']])}
      <label>Extras</label><div><label class="check"><input type="checkbox" data-c="glasses"${d.glasses ? ' checked' : ''}> Glasses</label> <label class="check"><input type="checkbox" data-c="beard"${d.beard ? ' checked' : ''}> Beard</label></div>
      <label>Photo head</label><div><button class="mini" id="lk-photo">Choose a picture…</button> <button class="mini" id="lk-photo-x">Remove</button><input type="file" id="lk-file" accept="image/*" hidden></div>
      <label>Drink of choice</label><select data-p="vice">${D.VICES.map((v) => `<option value="${v}"${(d.persona.vice || s.baseVice) === v ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <label>Temper</label><input type="range" min="0" max="100" data-p="temper" value="${Math.round((d.persona.temper != null ? d.persona.temper : s.baseTemper) * 100)}">
      <label>Thirst</label><input type="range" min="0" max="100" data-p="thirst" value="${Math.round((d.persona.thirst != null ? d.persona.thirst : s.baseThirst) * 100)}">
      <label>Spits when angry</label><div><input type="checkbox" data-p="spitter"${(d.persona.spitter != null ? d.persona.spitter : s.baseSpitter) ? ' checked' : ''}></div>
    </div></div><div class="foot"><button id="lk-reset" class="danger">Reset</button><span><button id="lk-cancel">Cancel</button> <button id="lk-save">Save</button></span></div>`;
    const ghost = () => ({ id, seed: 1.3, x: 12, y: 28, dir: 0, status: 'idle', look: d, skin: val('skin', s.baseSkin), hair: val('hairColor', s.baseHair), shirt: val('color', s.baseShirt), drunk: 0, stress: 0, walking: false, seated: false, typing: false, vice: d.persona.vice || s.baseVice });
    const pv = dlg.querySelector('#pv').getContext('2d');
    const paint = () => { const t = performance.now() / 1000; pv.setTransform(6, 0, 0, 6, 0, 0); pv.imageSmoothingEnabled = false; pv.clearRect(0, 0, 24, 32); pv.fillStyle = '#363b51'; pv.fillRect(0, 0, 24, 32); D.drawChar(pv, ghost(), t, photoHead); if (dlg.open) previewRaf = requestAnimationFrame(paint); };
    dlg.oninput = dlg.onchange = (e) => {
      const el = e.target;
      if (el.dataset.k) d[el.dataset.k] = el.value;
      if (el.dataset.c) d[el.dataset.c] = el.checked;
      if (el.dataset.p) d.persona[el.dataset.p] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) / 100 : el.value;
    };
    dlg.onclick = (e) => {
      const sk = e.target.closest('[data-skin]');
      if (sk) { d.skin = sk.dataset.skin; dlg.querySelectorAll('[data-skin]').forEach((i) => i.classList.toggle('on', i === sk)); }
    };
    dlg.querySelector('#lk-photo').onclick = () => dlg.querySelector('#lk-file').click();
    dlg.querySelector('#lk-file').onchange = async (e) => { if (e.target.files[0]) d.photo = await shrink(e.target.files[0], 64); };
    dlg.querySelector('#lk-photo-x').onclick = () => { delete d.photo; };
    dlg.querySelector('#lk-cancel').onclick = () => dlg.close();
    dlg.querySelector('#lk-reset').onclick = () => { delete D.looks.agents[id]; delete D.looks.names[id]; saveLooks(); applyLook(s); cardsKey = ''; dlg.close(); };
    dlg.querySelector('#lk-save').onclick = () => {
      const nm = dlg.querySelector('#lk-name').value.trim();
      for (const k of Object.keys(d)) if (d[k] === '' || d[k] === false) delete d[k];
      if (!Object.keys(d.persona).length) delete d.persona;
      D.looks.agents[id] = d; if (nm) D.looks.names[id] = nm; else delete D.looks.names[id];
      saveLooks(); applyLook(s); cardsKey = ''; dlg.close();
    };
    dlg.addEventListener('close', () => cancelAnimationFrame(previewRaf), { once: true });
    dlg.showModal(); paint();
  }

  // ---------- go ----------
  (async function init() {
    await Promise.all([D.loadLines(), loadLooks()]);
    D.layout(4);
    initSettings();
    if (DEMO) D.log('Demo mode: these agents are not real. Their hangovers are.', '');
    poll(); requestAnimationFrame(frame);
  })();
})();
