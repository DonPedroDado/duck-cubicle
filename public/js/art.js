// All drawing: the room, props, desks, people, bottles, particles and floor mess. Plain canvas rects at 16 px tiles, no image assets.
(function () {
  const D = window.Duck, T = D.T;
  let g = null;
  const rect = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const lerp = (a, b, u) => a + (b - a) * u;

  D.SHIRTS = ['#e05d5d', '#4f9dde', '#57b86b', '#e0a33b', '#a66de0', '#3bc4c4', '#e07ab8', '#9aa0b4', '#f07b3f', '#6fcf97', '#c9b458', '#5f7ee0'];
  D.HAIRS = ['#2b1d14', '#111111', '#6b3e1f', '#c9a04a', '#8b4513', '#3b2a20', '#d9d0c1', '#4a2b1a'];
  D.SKINS = ['#f1c7a3', '#d9a47a', '#b87b52', '#f5d5b8', '#c68e62'];
  D.VICES = ['beer', 'whisky', 'wine', 'vodka'];
  const BOTTLE = {
    beer: { body: '#7a4417', label: '#e8d9a0', cap: '#d9c25a', liquid: '#e0a33b' },
    whisky: { body: '#b87420', label: '#2b2b2b', cap: '#3b2a20', liquid: '#c98a2b' },
    wine: { body: '#2d5a3a', label: '#d8c9c9', cap: '#6b1f2a', liquid: '#8a1f3a' },
    vodka: { body: '#cfe3f0', label: '#4f7fcf', cap: '#cfcfcf', liquid: '#e8f4fb' },
  };

  // tiny 3x5 glyphs for z, !, ?
  const GLYPH = { Z: ['111', '001', '010', '100', '111'], '!': ['1', '1', '1', '0', '1'], '?': ['111', '001', '011', '000', '010'] };
  function glyph(ch, x, y, c) {
    const rows = GLYPH[ch]; if (!rows) return;
    rows.forEach((r, j) => [...r].forEach((b, i) => { if (b === '1') rect(c, x + i, y + j, 1, 1); }));
  }

  function bottleStanding(vice, x, y) {
    const b = BOTTLE[vice] || BOTTLE.beer;
    rect(b.cap, x, y - 8, 1, 1); rect(b.body, x, y - 7, 1, 2); rect(b.body, x - 1, y - 5, 3, 5); rect(b.label, x - 1, y - 3, 3, 2);
  }
  // bottle held towards a mouth, d = -1 | 1; tip: how far it is tilted up (0..1)
  function bottleHeld(vice, x, y, d, tip) {
    const b = BOTTLE[vice] || BOTTLE.beer;
    if (tip > 0.5) {                                 // upside down-ish, at the lips
      rect(b.body, x, y - 3, 3, 4); rect(b.label, x, y - 2, 3, 1); rect(b.cap, x + 1, y - 5, 1, 2);
      rect(b.liquid, x + 1, y - 3, 1, 1);
    } else {
      rect(b.body, x - 1, y, 3, 5); rect(b.label, x - 1, y + 2, 3, 1); rect(b.body, x, y - 2, 1, 2); rect(b.cap, x, y - 3, 1, 1);
    }
  }

  // ---------- room ----------
  D.drawRoom = function (ctx, t) {
    g = ctx;
    const CW = D.CW, CH = D.CH;
    const hr = new Date().getHours(), night = hr < 7 || hr >= 20;
    for (let y = 2; y < CH / T; y++) for (let x = 0; x < 22; x++) {
      const lounge = x >= 15;
      rect((x + y) % 2 ? (lounge ? '#4a3d57' : '#3a3f56') : (lounge ? '#463a52' : '#363b51'), x * T, y * T, T, T);
    }
    rect('#5b4a6b', 16.5 * T, 6.3 * T, 4.6 * T, 3 * T);                       // rug
    rect('#4b4f6b', 0, 0, CW, 2 * T); rect('#3a3d55', 0, 2 * T - 3, CW, 3);   // back wall
    for (const wx of [1.5, 5.5, 9.5, 16.5]) {
      rect('#2c2f44', wx * T - 1, 5, 34, 18);
      rect(night ? '#1c2a4a' : '#8fc7ff', wx * T, 6, 32, 16);
      if (!night) { const cx = (t * 3 + wx * 11) % 44 - 8; rect('rgba(255,255,255,.85)', wx * T + cx, 11, 8, 3); rect('rgba(255,255,255,.85)', wx * T + cx + 2, 9, 4, 2); }
      else rect('#f5f1c8', wx * T + 24, 9, 3, 3);
      rect('#2c2f44', wx * T + 15, 6, 2, 16);
    }
    // neon beer mug over the lounge
    const flick = Math.floor(t * 7) % 23 === 0;
    const neon = flick ? '#7a4a1a' : '#ffb347';
    rect(neon, 20.1 * T, 8, 8, 10); rect('#4b4f6b', 20.1 * T + 1, 9, 6, 2); rect(neon, 20.1 * T + 8, 10, 2, 5); rect('#4b4f6b', 20.1 * T + 2, 12, 4, 5);
    rect(neon, 20.1 * T + 2, 12, 4, 5); rect(flick ? '#7a4a1a' : '#fff3c4', 20.1 * T + 1, 8, 6, 2);
    // wall clock
    rect('#e9e7f2', 13 * T, 7, 12, 12); rect('#4b4f6b', 13 * T + 1, 8, 10, 10);
    const now = new Date();
    const hand = (a, len) => { g.beginPath(); g.moveTo(13 * T + 6, 13); g.lineTo(13 * T + 6 + Math.sin(a) * len, 13 - Math.cos(a) * len); g.stroke(); };
    g.strokeStyle = '#e9e7f2'; g.lineWidth = 1;
    hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2, 3);
    hand(now.getMinutes() / 60 * Math.PI * 2, 4);
    // glass partition with a doorway
    rect('rgba(160,200,255,.18)', 14 * T + 6, 2 * T, 4, 4 * T);
    rect('rgba(160,200,255,.18)', 14 * T + 6, 8 * T, 4, CH - 8 * T);
    rect('#6c7090', 14 * T + 6, 2 * T, 4, 2); rect('#6c7090', 14 * T + 6, 8 * T, 4, 2);
    drawDecals(D.now);
  };

  function drawDecals(now) {
    for (const d of D.decals) {
      const left = d.until - now;
      g.globalAlpha = Math.max(0, Math.min(1, left / 6));
      const x = Math.round(d.x), y = Math.round(d.y);
      if (d.type === 'spit') { rect('#cfe8c0', x - 2, y, 4, 2); rect('#eefae6', x - 1, y, 2, 1); rect('#cfe8c0', x + 2, y + 1, 1, 1); }
      else if (d.type === 'beer') { rect('rgba(200,140,30,.75)', x - 5, y, 10, 3); rect('rgba(230,180,70,.8)', x - 3, y, 5, 1); rect('rgba(200,140,30,.75)', x - 3, y + 3, 6, 1); }
      else if (d.type === 'shards') { for (let i = 0; i < 7; i++) rect(i % 2 ? '#bcd9ea' : '#7a4417', x - 6 + ((i * 5) % 12), y + (i * 3) % 4, 1 + (i % 2), 1); }
      else if (d.type === 'paper') { rect('#d9d7e3', x - 1, y, 3, 3); rect('#fff', x, y, 1, 1); }
      else if (d.type === 'bottle') { const b = BOTTLE[d.vice] || BOTTLE.beer; rect(b.body, x - 2, y, 4, 2); rect(b.label, x - 1, y, 2, 1); rect(b.cap, x + 2, y, 1, 1); }
      g.globalAlpha = 1;
    }
  }

  // ---------- props ----------
  D.props = function (ctx, t, list) {
    g = ctx;
    list.push({ z: 3.6 * T, f: () => {
      rect('#6a3f8f', 15.8 * T, 2.4 * T, 5 * T, 12); rect('#7d4fa6', 15.8 * T, 2.4 * T + 12, 5 * T, 8);
      for (let i = 0; i < 4; i++) rect('#9467bd', 16 * T + i * 19, 2.4 * T + 13, 16, 5);
    } });
    // fridge, stocked with the good stuff
    list.push({ z: 3.4 * T, f: () => {
      rect('#d7dae6', 21.1 * T, 2.0 * T, 14, 26); rect('#aeb2c4', 21.1 * T, 2.0 * T + 11, 14, 1);
      rect('#8a8fa6', 21.1 * T + 11, 2.0 * T + 3, 1, 5); rect('#8a8fa6', 21.1 * T + 11, 2.0 * T + 14, 1, 7);
      rect('#e05d5d', 21.1 * T + 2, 2.0 * T + 14, 4, 3); rect('#ffd98a', 21.1 * T + 3, 2.0 * T + 19, 5, 4);
    } });
    // coffee table with the ashtray of shame
    list.push({ z: 6.9 * T, f: () => {
      rect('#8b5a2b', 17 * T, 6.9 * T, 3.6 * T, 1.6 * T); rect('#6e4520', 17 * T, 8.5 * T, 3.6 * T, 3);
      rect('#e9e7f2', 17.4 * T, 7.2 * T, 10, 7); rect('#e9e7f2', 19.4 * T, 7.4 * T, 8, 6);
    } });
    // the bar
    const bar = D.bar;
    list.push({ z: bar.y + 20, f: () => {
      rect('#8b5a2b', bar.x, bar.y, bar.w, 6); rect('#a8713a', bar.x, bar.y, bar.w, 2);
      rect('#6e4520', bar.x, bar.y + 6, bar.w, 14); rect('#5a3a1a', bar.x + 3, bar.y + 9, bar.w - 6, 8);
      const vs = ['beer', 'whisky', 'wine', 'vodka', 'beer', 'whisky', 'vodka'];
      vs.forEach((v, i) => bottleStanding(v, bar.x + 6 + i * 9, bar.y + 3));
    } });
    const H = D.CH / T;
    for (const [px, py] of [[14.9, 2.3], [21.3, H - 1.4], [0.2, H - 0.9]]) list.push({ z: (py + 1) * T, f: () => {
      rect('#8b5a2b', px * T + 3, py * T + 10, 8, 6);
      rect('#3f9d55', px * T + 1, py * T, 12, 11); rect('#57b86b', px * T + 3, py * T - 3, 8, 6);
    } });
  };

  // ---------- desks ----------
  D.drawDesk = function (ctx, d, s, t) {
    g = ctx;
    const x = d.x, y = d.y;
    const on = s && s.typing;
    const err = s && s.status === 'error' && s.seated;
    const wait = s && s.status === 'waiting' && s.seated;
    const hop = s && s.pose && s.pose.name === 'slam' && s.pose.until > D.now ? (Math.floor(t * 20) % 2 ? 1 : 0) : 0;
    rect('#8b5a2b', x, y + 8, 34, 10); rect('#6e4520', x, y + 18, 34, 3);
    rect('#6e4520', x + 1, y + 21, 2, 6); rect('#6e4520', x + 31, y + 21, 2, 6);
    rect('#22252f', x + 3, y - 2 - hop, 14, 10);
    rect(err ? (Math.floor(t * 2) % 2 ? '#ff6b6b' : '#a33') : wait ? (Math.floor(t) % 2 ? '#e0a33b' : '#b07d20') : on ? '#5cc8f0' : '#3a4050', x + 4, y - 1 - hop, 12, 7);
    if (on) for (let i = 0; i < 3; i++) rect('rgba(255,255,255,.75)', x + 5, y + i * 2 - hop, (Math.floor(t * 9 + i * 4) % 9) + 1, 1);
    rect('#22252f', x + 9, y + 8, 2, 1);
    rect('#c9cbd6', x + 17, y + 10 - hop, 11, 2);
    if (on) rect('#ffffff', x + 17 + (Math.floor(t * 12) % 10), y + 10, 1, 1);
    rect('#f3f3f3', x + 29, y + 9, 3, 4); rect('#f3f3f3', x + 32, y + 10, 1, 2);
    if (s) for (let i = 0; i < Math.min(3, s.empties || 0); i++) bottleStanding(s.vice, x + 6 + i * 4, y + 17);
  };

  // ---------- people ----------
  const ANGRY = new Set(['slam', 'fist', 'point', 'shove', 'spit', 'finger', 'rage']);
  D.poseOf = (s) => (s.pose && s.pose.until > D.now ? s.pose.name : null);

  D.drawChar = function (ctx, s, t, photo) {
    g = ctx;
    const pose = D.poseOf(s);
    const lk = s.look || {};
    const dr = s.drunk || 0;
    const sleeping = pose === 'sleep' || pose === 'desknap';
    const sitting = s.seated || pose === 'sleep';
    let x = Math.round(s.x + (s.kx || 0)), y = Math.round(s.y);
    const bob = s.walking ? Math.floor(t * 8 + s.seed) % 2 : 0;
    if (pose === 'slam' || pose === 'fist' || pose === 'rage') x += Math.floor(t * 30) % 2 ? 1 : -1;
    const d = s.dir || 0, fd = d || 1;
    const sway = dr > 0.25 && !sleeping ? Math.round(Math.sin(t * 2.2 + s.seed) * Math.min(2, dr * 2.4)) : 0;
    const slump = (s.status === 'error' && s.seated) || sleeping ? 1 : 0;
    const dip = pose === 'sleep' ? 3 : 0;

    rect('rgba(0,0,0,.25)', x - 4, y - 1, 8, 2);
    if (!sitting) {
      const ph = s.walking ? Math.floor(t * 8 + s.seed) % 2 : 0;
      const leg = lk.bottom === 'skirt' ? s.skin : '#2b2f45';
      rect(leg, x - 3 + sway, y - 5, 2, ph ? 4 : 5);
      rect(leg, x + 1 + sway, y - 5, 2, ph ? 5 : 4);
      if (lk.shoes === 'heels') { rect('#1a1a1a', x - 3 + sway, y - 1, 2, 1); rect('#1a1a1a', x + 1 + sway, y - 1, 2, 1); }
    }
    const ty = y - 11 - bob + dip;
    rect(s.shirt, x - 4 + (sway >> 1), ty, 8, 6);
    if (lk.bottom === 'skirt' && !sitting) rect('#2b2f45', x - 4, y - 6 - bob, 8, 2);

    // --- arms ---
    const hy = ty + 1;                                       // shoulder line
    const w = Math.floor(t * 3 + s.seed) % 2;
    const arm = (ax, ay, aw, ah) => rect(s.skin, ax, ay, aw, ah);
    let holding = null;                                       // {vice, tip}
    if (pose === 'drink' || pose === 'sip') { arm(x + 3 * fd - (fd < 0 ? 1 : 0), hy - 3, 2, 4); holding = { x: x + 3 * fd + (fd < 0 ? -2 : 1), y: hy - 5, tip: 1 }; arm(x - 4 * fd - (fd > 0 ? 1 : 0), hy + 2, 1, 4); }
    else if (pose === 'cheers') { arm(x + 4 * fd - (fd < 0 ? 1 : 0), hy - 7, 1, 8); holding = { x: x + 4 * fd + (fd < 0 ? -2 : 1), y: hy - 9, tip: 0 }; arm(x - 5, hy + 1, 1, 4); }
    else if (pose === 'slam' || pose === 'rage') { const up = Math.floor(t * 8) % 2; arm(x - 5, hy - (up ? 9 : 1), 2, 3); arm(x + 3, hy - (up ? 9 : 1), 2, 3); }
    else if (pose === 'fist') { const j = Math.floor(t * 14) % 2; arm(x - 6, hy - 2 - j, 2, 3); arm(x + 4, hy - 2 + j, 2, 3); }
    else if (pose === 'point') { arm(x + 3 * fd - (fd < 0 ? 4 : 0), hy + 1, 5, 1); arm(x + 8 * fd - (fd < 0 ? 4 : 0) - (fd < 0 ? 1 : 0), hy, 2, 2); arm(x - 5 * fd - (fd > 0 ? 1 : 0), hy + 1, 1, 4); }
    else if (pose === 'shove') { const j = Math.floor(t * 12) % 2; arm(x + 3 * fd - (fd < 0 ? 4 : 0) + fd * j, hy + 2, 5, 2); arm(x - 4 * fd - (fd > 0 ? 3 : 0) + fd * (1 - j), hy + 1, 4, 2); }
    else if (pose === 'finger') { arm(x + 4 * fd - (fd < 0 ? 1 : 0), hy - 7, 1, 8); arm(x + 4 * fd - (fd < 0 ? 1 : 0) - (fd < 0 ? 0 : 0), hy - 9, 1, 3); rect('#fff', x + 4 * fd - (fd < 0 ? 1 : 0), hy - 9, 1, 1); arm(x - 5 * fd - (fd > 0 ? 1 : 0), hy + 1, 1, 4); }
    else if (pose === 'spit') { arm(x - 5, hy + 1, 1, 4); arm(x + 4, hy + 1, 1, 4); }
    else if (pose === 'wipe') { arm(x - 5, hy + 1, 1, 4); const k = Math.floor(t * 10) % 2; arm(x + 2 + k, hy - 5, 2, 4); }
    else if (pose === 'stretch') { arm(x - 5, hy - 10, 2, 8); arm(x + 3, hy - 10, 2, 8); }
    else if (pose === 'laugh' || pose === 'rub') { arm(x - 5, hy + 1, 1, 4); arm(x + 4, hy + 1, 1, 4); }
    else if (s.typing) { const a = Math.floor(t * (dr > 0.5 ? 5 : 10) + s.seed) % 2; arm(x - 5, y - 8 - bob - a, 2, 2); arm(x + 3, y - 8 - bob - (1 - a), 2, 2); }
    else if (s.status === 'waiting' && s.seated) { arm(x - 5, y - 10 - bob, 1, 4); arm(x + 4 + w, y - 19 - bob, 2, 8); }
    else if (s.holding) { arm(x - 5, ty + 1, 1, 4); arm(x + 4 * fd - (fd < 0 ? 1 : 0), ty + 1, 1, 4); holding = { x: x + 4 * fd + (fd < 0 ? -2 : 1), y: ty + 4, tip: 0 }; }
    else { arm(x - 5, ty + 1, 1, 4); arm(x + 4, ty + 1, 1, 4); }

    // --- head ---
    let hx = x + sway, hyy = y - 17 - bob + slump + dip;
    if (pose === 'spit') { hx += fd; hyy += 1; }
    if (pose === 'laugh') hyy += Math.floor(t * 12) % 2;
    if (pose === 'desknap') { hyy += 2; hx += 1; }
    const photoDrawn = photo && photo(g, s, hx, hyy + 3, 4.6);
    if (!photoDrawn) {
      if (lk.hair === 'long') { rect(s.hair, hx - 4, hyy, 1, 6); rect(s.hair, hx + 3, hyy, 1, 6); }
      rect(s.skin, hx - 3, hyy, 6, 6);
      if (lk.hair !== 'bald') {
        rect(s.hair, hx - 3, hyy - 1, 6, 2); rect(s.hair, hx - 3, hyy, 1, 2); rect(s.hair, hx + 2, hyy, 1, 2);
        if (lk.hair === 'bun') rect(s.hair, hx - 1, hyy - 3, 2, 2);
        if (lk.hair === 'curly') { rect(s.hair, hx - 4, hyy - 1, 1, 2); rect(s.hair, hx + 3, hyy - 1, 1, 2); rect(s.hair, hx - 2, hyy - 2, 4, 1); }
        if (lk.hair === 'pony') rect(s.hair, hx + 3, hyy + 1, 1, 4);
        if (lk.hair === 'mohawk') { rect(s.hair, hx - 1, hyy - 3, 2, 3); }
      }
      if (lk.beard) rect(s.hair, hx - 3, hyy + 4, 6, 2);
      // eyes
      const angry = ANGRY.has(pose) || ((s.stress || 0) > 0.7 && s.status !== 'idle');
      const blink = ((t + s.seed) % 4) < 0.14;
      const ox = d;
      if (sleeping) { rect('#1a1a1a', hx - 2, hyy + 3, 2, 1); rect('#1a1a1a', hx + 1, hyy + 3, 2, 1); }
      else if (dr > 0.7) { rect('#1a1a1a', hx - 2 + ox, hyy + 3, 2, 1); rect('#1a1a1a', hx + 1 + ox, hyy + 3, 2, 1); rect('#b33', hx - 2 + ox, hyy + 4, 2, 1); rect('#b33', hx + 1 + ox, hyy + 4, 2, 1); }
      else if (!blink) {
        rect('#1a1a1a', hx - 2 + ox, hyy + 3, 1, 1); rect('#1a1a1a', hx + 1 + ox, hyy + 3, 1, 1);
        if (dr > 0.3) { rect('#e8625f', hx - 3, hyy + 4, 1, 1); rect('#e8625f', hx + 2, hyy + 4, 1, 1); }
      }
      if (angry && !sleeping) {                                  // brows pulled down towards the nose
        rect('#1a1a1a', hx - 3 + ox, hyy + 2, 2, 1); rect('#1a1a1a', hx + 1 + ox, hyy + 2, 2, 1);
        rect('#1a1a1a', hx - 1 + ox, hyy + 3, 1, 1); rect('#1a1a1a', hx + ox, hyy + 3, 1, 1);
      }
      if (lk.glasses) { rect('rgba(150,210,255,.55)', hx - 3, hyy + 2, 3, 3); rect('rgba(150,210,255,.55)', hx, hyy + 2, 3, 3); rect('#2a2a2a', hx - 3, hyy + 2, 6, 1); rect('#2a2a2a', hx - 3, hyy + 4, 1, 1); rect('#2a2a2a', hx + 2, hyy + 4, 1, 1); }
      // mouth: opens while shouting, spitting or drinking
      const talking = s.talk && s.talk.until > D.now;
      if (pose === 'spit') rect('#3a1a1a', hx - 1 + fd, hyy + 5, 2, 1);
      else if (talking && Math.floor(t * 9 + s.seed) % 2 && !sleeping) rect('#4a1c1c', hx - 1, hyy + 5, 2, 1);
      else if (pose === 'laugh') rect('#4a1c1c', hx - 1, hyy + 4, 3, 2);
      if ((s.splat || 0) > D.now) { rect('#e8f5df', hx - 2, hyy + 1, 3, 2); rect('#e8f5df', hx - 1, hyy + 3, 1, 2 + (Math.floor(t * 2) % 2)); }
    }
    if (holding) bottleHeld(s.vice, holding.x, holding.y, fd, holding.tip);
    if (sleeping) { const k = (t * 1.5 + s.seed) % 3; for (let i = 0; i < 2; i++) glyph('Z', hx + 4 + i * 3, hyy - 4 - ((k + i) % 3) * 2.5, '#e9e7f2'); }
    if (s.status === 'paused' && s.seated) glyph('Z', hx + 4, hyy - 3, '#f3dc92');
    if (s.drunk > 0.45 && s.walking === false && !sleeping && Math.floor(t * 0.7 + s.seed) % 4 === 0) glyph('!', hx + 5, hyy - 2, '#ff8fa3');
  };

  // ---------- particles ----------
  D.drawFx = function (ctx, t) {
    g = ctx;
    const now = D.now;
    D.fx = D.fx.filter((f) => now - f.t0 < f.dur);
    for (const f of D.fx) {
      const u = (now - f.t0) / f.dur;
      if (f.type === 'spit') {
        const arc = (uu) => [lerp(f.x0, f.x1, uu), lerp(f.y0, f.y1, uu) - Math.sin(Math.PI * uu) * 9];
        for (let k = 3; k >= 1; k--) { const p = arc(Math.max(0, u - k * 0.06)); rect('rgba(220,240,210,' + (0.5 - k * 0.12) + ')', p[0], p[1], 1, 1); }
        const [px, py] = arc(u); rect('#e9f7e0', px - 1, py - 1, 2, 2); rect('#fff', px - 1, py - 1, 1, 1);
      } else if (f.type === 'paper') {
        const px = lerp(f.x0, f.x1, u), py = lerp(f.y0, f.y1, u) - Math.sin(Math.PI * u) * 14;
        rect('#d9d7e3', px - 1, py - 1, 3, 3); rect('#fff', px - 1 + (Math.floor(t * 12) % 2), py - 1, 1, 1);
      } else if (f.type === 'steam') {
        const px = f.x + f.vx * u * 8, py = f.y - u * 12;
        g.globalAlpha = 1 - u; rect(f.color || '#ffd0d0', px, py, 2, 2); g.globalAlpha = 1;
      } else if (f.type === 'star') {
        const r = 2 + u * 6; g.globalAlpha = 1 - u;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) rect('#ffe28a', f.x + dx * r, f.y + dy * r, 2, 2);
        g.globalAlpha = 1;
      } else if (f.type === 'drip') {
        g.globalAlpha = 1 - u; rect('#e9f7e0', f.x + f.vx * u * 10, f.y + u * u * 14, 1, 1); g.globalAlpha = 1;
      } else if (f.type === 'sym') {                          // cartoon swear cloud over a head
        g.globalAlpha = Math.min(1, (1 - u) * 2);
        const bx = f.x, by = f.y - u * 3;
        rect('#fff', bx - 5, by, 11, 6); rect('#fff', bx - 3, by - 2, 7, 2);
        glyph('!', bx - 3, by, '#c0171d'); glyph('?', bx - 1 + 1, by, '#c0171d'); glyph('!', bx + 4, by, '#c0171d');
        g.globalAlpha = 1;
      }
    }
  };

  // selection ring
  D.drawRing = function (ctx, s) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,226,138,.9)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 7, 2.4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  };
})();
