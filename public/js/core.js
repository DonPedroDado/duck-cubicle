// Shared state and helpers: layout, walking routes, text (with the censor), the gossip log, sound.
(function () {
  const T = 16, BASE_CW = 352;
  const D = window.Duck = {
    T, CW: BASE_CW, CH: 208, sprites: new Map(), fx: [], decals: [], L: {}, now: 0,
    desks: [], lounge: [], rows: 3, scenes: new Set(), looks: { agents: {}, names: {} },
    settings: { chaos: 2, lang: 'bleep', sound: false, fps: 60, anim: true, cards: true, log: true, name: '' },
    shake: 0,
  };
  const rnd = D.rnd = (a, b) => a + Math.random() * (b - a);
  const pick = D.pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = D.chance = (p) => Math.random() < p;
  D.hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  D.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- settings ----------
  try { Object.assign(D.settings, JSON.parse(localStorage.getItem('duck.settings') || '{}')); } catch (_) {}
  D.saveSettings = () => { try { localStorage.setItem('duck.settings', JSON.stringify(D.settings)); } catch (_) {} };
  D.K = () => [0.12, 0.6, 1.4, 3][D.settings.chaos] ?? 1;          // how often trouble starts

  // ---------- office layout (tiles of 16 px; three rows of four desks, a lounge on the right) ----------
  const ROWS_Y = [3, 7.5, 10.5];
  const COLS_X = [1, 4.5, 8, 11.5];
  D.GAPS = [8, 61, 117, 173, 224];                 // vertical walkways between desk columns
  D.layout = function (n) {
    const rows = Math.max(3, Math.ceil(n / 4));
    D.rows = rows;
    const ys = ROWS_Y.slice(); for (let r = 3; r < rows; r++) ys.push(10.5 + 3.5 * (r - 2));
    D.deskRows = ys;
    D.aisles = ys.map((y) => y * T + 36);
    D.desks = [];
    ys.forEach((dy, r) => COLS_X.forEach((dx) => D.desks.push({ x: dx * T, y: dy * T, seatX: dx * T + 22, seatY: dy * T + 12, ay: dy * T + 36, row: r })));
    D.CH = (13 + (rows - 3) * 3.5) * T;
    D.lounge = [[16, 4.4], [18, 4.4], [20, 4.4], [16.2, 8.4], [20.6, 7.4], [15.8, 6.4], [18.5, 9.2], [16.5, 5.8], [19.6, 5.8], [15.6, 10.4], [21, 5.8]].map(([x, y]) => [x * T, y * T]);
    for (let r = 3; r < rows; r++) { const y = (10.5 + 3.5 * (r - 2)) * T; D.lounge.push([16.5 * T, y + 20], [19 * T, y + 24], [21 * T, y + 20]); }
    // the bar: a counter in the bottom right of the lounge, drinkers lean on it from the front
    D.bar = { x: 16.8 * T, y: 9.9 * T, w: 4.2 * T, spots: [[17.6 * T, 12.1 * T], [19.1 * T, 12.1 * T], [20.5 * T, 12.1 * T]], taken: [null, null, null] };
    D.sofa = { x: 16 * T, y: 2.4 * T, w: 5 * T };
    resize();
  };
  function resize() {
    const cv = document.getElementById('c');
    if (!cv) return;
    const S = 3;
    cv.width = D.CW * S; cv.height = D.CH * S;
    document.getElementById('stage').style.aspectRatio = D.CW + '/' + D.CH;
    D.S = S;
  }
  D.gapNear = (x) => D.GAPS.reduce((b, g) => (Math.abs(g - x) < Math.abs(b - x) ? g : b));
  D.aisleNear = (y) => D.aisles.reduce((b, a) => (Math.abs(a - y) < Math.abs(b - y) ? a : b));
  D.standPoint = (desk) => [desk.seatX, desk.ay];

  // ---------- walking ----------
  // Desks sit on the left of the glass partition; the doorway is at y=112, the corridor at x=224.
  const DOOR_Y = 112, CORR = 224, deskSide = (x) => x < 222;
  D.walkTo = function (s, tx, ty, tAy) {
    const pts = [];
    let cx = s.x, cy = s.y;
    if (deskSide(cx)) {
      const ay = s.seated ? s.desk.ay : D.aisleNear(cy);
      if (Math.abs(ay - cy) > 3) pts.push([cx, ay]);
      cy = ay;
    }
    const tay = tAy != null ? tAy : D.aisleNear(ty);
    if (deskSide(cx) && !deskSide(tx)) { pts.push([CORR, cy], [CORR, DOOR_Y], [240, DOOR_Y]); }
    else if (!deskSide(cx) && deskSide(tx)) { pts.push([240, DOOR_Y], [CORR, DOOR_Y], [CORR, tay]); cy = tay; cx = CORR; }
    else if (deskSide(cx) && deskSide(tx) && Math.abs(tay - cy) > 3) { const g = D.gapNear(cx); pts.push([g, cy], [g, tay]); cy = tay; }
    if (deskSide(tx) && Math.abs(ty - tay) > 3) pts.push([tx, tay]);
    pts.push([tx, ty]);
    s.path = pts;
    s.arrivedAt = null;
  };
  D.arrived = (s) => !s.path || !s.path.length;

  // ---------- text ----------
  D.loadLines = async function () {
    try { D.L = await (await fetch('lines.json')).json(); } catch (_) { D.L = {}; }
    const stems = (D.L.bad && D.L.bad.length ? D.L.bad : ['fuck\\w*', 'shit\\w*', 'asshole\\w*']).join('|');
    D.badRe = new RegExp('\\b(' + stems + ')\\b', 'gi');
  };
  D.censor = function (text) {
    const mode = D.settings.lang;
    if (mode === 'raw' || !D.badRe) return text;
    D.badRe.lastIndex = 0;
    let hit = false;
    const out = text.replace(D.badRe, (w) => {
      hit = true;
      if (mode === 'cartoon') return '#@%&!$*'.slice(0, Math.max(3, Math.min(6, w.length)));
      return w[0] + '*'.repeat(w.length - 1);
    });
    if (hit && mode === 'bleep') D.sfx('bleep');
    return out;
  };
  D.line = (key, name, me) => {
    const arr = D.L[key] && D.L[key].length ? D.L[key] : ['...'];
    return pick(arr).replace(/\{name\}/g, name || 'you').replace(/\{me\}/g, me || '');
  };
  D.fill = (t, name) => String(t).replace(/\{name\}/g, name || 'you');
  D.dur = (t) => Math.max(1.4, Math.min(4.2, 0.9 + t.length * 0.055));

  // ---------- gossip log ----------
  D.log = function (text, kind) {
    D.logLines = D.logLines || [];
    const d = new Date();
    D.logLines.unshift({ t: d.toTimeString().slice(0, 5), text: D.censorQuiet(text), kind: kind || '' });
    D.logLines.length = Math.min(D.logLines.length, 60);
    D.logDirty = true;
  };
  D.censorQuiet = (text) => { const m = D.sfx; D.sfx = () => {}; try { return D.censor(text); } finally { D.sfx = m; } };

  // ---------- sound (WebAudio, off by default) ----------
  let ac = null;
  D.sfx = function (name) {
    if (!D.settings.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;
      const tone = (type, f0, f1, dur, vol) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
      };
      const noise = (dur, vol) => {
        const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = vol; s.connect(g).connect(ac.destination); s.start(t);
      };
      if (name === 'bleep') tone('sine', 1000, 1000, 0.22, 0.05);
      else if (name === 'glug') { tone('sine', 300, 120, 0.12, 0.08); setTimeout(() => D.sfx('glug2'), 140); }
      else if (name === 'glug2') tone('sine', 260, 100, 0.12, 0.08);
      else if (name === 'spit') noise(0.12, 0.12);
      else if (name === 'slam') { noise(0.1, 0.25); tone('square', 120, 50, 0.12, 0.08); }
      else if (name === 'smash') noise(0.35, 0.2);
      else if (name === 'burp') tone('sawtooth', 110, 55, 0.45, 0.07);
      else if (name === 'pow') { noise(0.08, 0.3); tone('square', 200, 60, 0.1, 0.1); }
      else if (name === 'cheers') tone('triangle', 1400, 1800, 0.18, 0.06);
    } catch (_) {}
  };
})();
