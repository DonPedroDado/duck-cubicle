// The part that makes it funny: moods, a director that notices trouble, and scripted scenes
// (rage, arguments, spitting, shoving, drinking, gossip) written as generators.
// A scene `yield`s a number of seconds to wait, or a function to wait until it returns true.
(function () {
  const D = window.Duck, T = D.T;
  const { rnd, pick, chance } = D;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  // ---------- small helpers for scenes ----------
  function say(s, raw, kind, logKind) {
    const text = D.fill(raw, '');
    const dur = D.dur(text);
    const k = kind === 'yell' ? 'yell' : s.drunk > 0.45 && kind !== 'whisper' ? 'drunk' : (kind || 'talk');
    s.talk = { text: D.censor(raw), until: D.now + dur, kind: k };
    if (logKind) D.log(`${s.name}: “${raw}”`, logKind);
    return dur;
  }
  const pose = (s, name, dur) => { s.pose = { name, until: D.now + dur }; return dur; };
  const act = (s, name, raw, kind, logKind) => { const d = say(s, raw, kind, logKind); pose(s, name, d + 0.2); return d + 0.2; };
  const face = (a, b) => { a.dir = b.x >= a.x ? 1 : -1; };
  const head = (s) => ({ x: s.x + (s.dir || 0) * 2, y: s.y - 14 });
  const steam = (s, color) => D.fx.push({ type: 'steam', x: s.x + rnd(-3, 3), y: s.y - 19, vx: rnd(-1, 1), t0: D.now, dur: 0.8, color });
  const star = (x, y) => D.fx.push({ type: 'star', x, y, t0: D.now, dur: 0.4 });
  const decal = (type, x, y, secs, extra) => D.decals.push({ type, x, y, until: D.now + secs, ...extra });
  const others = (s) => [...D.sprites.values()].filter((o) => o !== s && !o.scene && !o.gone);
  function near(s, list) {                              // weighted towards who is close, and who it already hates
    if (!list.length) return null;
    const w = list.map((o) => 1 / (30 + Math.hypot(o.x - s.x, o.y - s.y)) * (1 + 3 * ((s.grudge && s.grudge[o.id]) || 0)));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[0];
  }
  const GAIN = { beer: 0.11, whisky: 0.2, wine: 0.15, vodka: 0.22 };
  const addDrunk = (s, v) => { s.drunk = clamp(s.drunk + v); s.thirst = clamp(s.thirst - 0.25); s.stress = clamp(s.stress - 0.12); };

  // ---------- scene runner ----------
  D.runScene = function (gen, actors, label) {
    const sc = { gen, actors, wait: 0, cond: null, condSince: 0, t0: D.now, label };
    actors.forEach((a) => { a.scene = sc; a.path = []; });
    D.scenes.add(sc);
    advance(sc);
    return sc;
  };
  function endScene(sc) {
    D.scenes.delete(sc);
    for (const a of sc.actors) {
      if (a.scene !== sc) continue;
      a.scene = null; a.pose = null; a.holding = false;
      D.bar.taken = D.bar.taken.map((o) => (o === a ? null : o));
      a.cdUntil = D.now + rnd(8, 18) / Math.max(0.4, D.K());
    }
  }
  function advance(sc) {
    let r;
    try { r = sc.gen.next(); } catch (e) { console.error('scene failed', e); r = { done: true }; }
    if (r.done) return endScene(sc);
    if (typeof r.value === 'function') { sc.cond = r.value; sc.condSince = D.now; sc.wait = 0; }
    else { sc.cond = null; sc.wait = Number(r.value) || 0; }
  }
  function tickScenes(dt) {
    for (const sc of [...D.scenes]) {
      if (sc.actors.some((a) => a.gone) || D.now - sc.t0 > 120) { endScene(sc); try { sc.gen.return(); } catch (_) {} continue; }
      if (sc.cond) {
        let ok = false; try { ok = sc.cond(); } catch (_) { ok = true; }
        if (!ok && D.now - sc.condSince < 20) continue;
        advance(sc);
      } else if ((sc.wait -= dt) <= 0) advance(sc);
    }
  }
  const both = (a, b) => () => D.arrived(a) && D.arrived(b);
  const there = (s) => () => D.arrived(s);

  // ---------- scenes ----------
  function* rage(s) {
    s.stress = clamp(s.stress + 0.15);
    const raw = D.line('swear_self');
    D.sfx('slam'); D.shake = 0.35;
    pose(s, 'slam', 1.5);
    say(s, raw, 'yell', 'fight');
    if (D.settings.lang === 'cartoon') D.fx.push({ type: 'sym', x: s.x, y: s.y - 24, t0: D.now, dur: 1.4 });
    for (let i = 0; i < 6; i++) { steam(s); yield 0.25; }
    if (chance(0.35 * Math.min(2, D.K()))) {                       // crumple and throw something
      const tx = s.x + rnd(-40, 40), ty = s.y + rnd(14, 34);
      pose(s, 'shove', 0.7);
      D.fx.push({ type: 'paper', x0: s.x, y0: s.y - 12, x1: tx, y1: ty, t0: D.now, dur: 0.6, land: () => decal('paper', tx, ty, 80) });
      D.log(`${s.name} threw a crumpled printout across the room.`, 'fight');
      yield 0.9;
    }
    const list = others(s);
    if (list.length && chance(0.5 * Math.min(1.5, D.K()))) D.startArgue(s, near(s, list), pick(D.L.cause_blame));
  }

  function* spitAt(a, v, depth) {
    yield act(a, 'spit', D.line('spit'), 'yell', 'fight');
    const m = head(a), f = head(v), hit = chance(0.78);
    const tx = f.x + (hit ? 0 : rnd(-14, 14)), ty = hit ? f.y : v.y + rnd(0, 6);
    D.sfx('spit');
    D.fx.push({ type: 'spit', x0: m.x, y0: m.y, x1: tx, y1: ty, t0: D.now, dur: 0.5, land: () => {
      if (hit) { v.splat = D.now + 9; star(f.x, f.y); D.fx.push({ type: 'drip', x: f.x, y: f.y, vx: 0.2, t0: D.now, dur: 1 }); }
      else decal('spit', tx, ty, 70);
    } });
    yield 0.6;
    if (hit) {
      D.log(`${a.name} spat right in ${v.name}'s face.`, 'gross');
      face(v, a); pose(v, 'wipe', 2);
      yield say(v, D.line('spit_react'), 'yell', 'fight');
      if (depth < 1 && chance(0.55)) yield* spitAt(v, a, depth + 1);
    } else {
      D.log(`${a.name} spat at ${v.name} and missed.`, 'gross');
      yield say(v, 'Ha! You missed!', 'yell');
    }
  }

  function* shoveAt(a, v, depth) {
    face(a, v);
    yield act(a, 'shove', D.line('shove'), 'yell', 'fight');
    D.sfx('pow');
    v.kx = (a.x < v.x ? 1 : -1) * 9;
    star(v.x, v.y - 10);
    D.log(`${a.name} shoved ${v.name}.`, 'fight');
    face(v, a); pose(v, 'fist', 1.6);
    yield say(v, D.line('shove_react'), 'yell', 'fight');
    if (depth < 1 && chance(0.5)) yield* shoveAt(v, a, depth + 1);
  }

  function* argue(A, B, cause) {
    const c = cause || pick(D.L.causes);
    const aName = A.name, bName = B.name;
    D.log(`${aName} and ${bName} are about to have words.`, 'fight');
    let bx, by;
    if (B.seated) { [bx, by] = D.standPoint(B.desk); D.walkTo(B, bx, by, B.desk.ay); }
    else { bx = B.x; by = B.y; }
    const side = A.x < bx ? -1 : 1;
    D.walkTo(A, bx + side * 13, by, D.aisleNear(by));
    yield both(A, B);
    face(A, B); face(B, A);
    yield act(A, 'point', D.fill(c.a, bName), 'yell', 'fight');
    yield act(B, 'point', D.fill(c.b, aName), 'yell', 'fight');
    const heat = A.stress + B.stress + A.drunk + B.drunk + D.K() * 0.25;
    const rounds = 1 + (chance(0.5) ? 1 : 0) + (heat > 1.3 ? 1 : 0);
    for (let r = 0; r < rounds; r++) {
      yield act(A, pick(['fist', 'point']), D.line('insult', bName), 'yell', 'fight');
      yield act(B, pick(['fist', 'point']), D.line('comeback', aName), 'yell', 'fight');
    }
    const spitter = A.spitter ? A : B.spitter ? B : chance(0.5) ? A : B;
    const target = spitter === A ? B : A;
    const W = [
      ['spit', (A.spitter || B.spitter ? 1.5 : 0.4 + (A.drunk + B.drunk)) * Math.min(1.5, D.K() + 0.3)],
      ['shove', 0.5 + heat * 0.7],
      ['hr', 0.7],
      ['makeup', 1.4 / (1 + heat) + (D.K() < 0.3 ? 2 : 0)],
      ['huff', 1],
    ];
    let r = Math.random() * W.reduce((s, w) => s + w[1], 0), outcome = 'huff';
    for (const [k, w] of W) { r -= w; if (r <= 0) { outcome = k; break; } }

    if (outcome === 'spit') yield* spitAt(spitter, target, 0);
    else if (outcome === 'shove') { const sh = chance(0.5) ? A : B; yield* shoveAt(sh, sh === A ? B : A, 0); }
    else if (outcome === 'hr') {
      yield act(A, 'point', D.line('hr'), 'yell', 'fight');
      yield act(B, 'finger', D.line('hr_reply'), 'yell', 'fight');
    } else if (outcome === 'makeup') {
      yield act(A, 'rub', D.line('makeup'), 'talk', 'drink');
      yield act(B, 'rub', D.line('makeup_reply'), 'talk', 'drink');
      D.log(`${aName} and ${bName} made up. Beers all round.`, 'drink');
      yield* drink(A, B);
      return;
    }
    yield 0.4;
    // somebody storms off for a cooldown, the other goes back to work
    const loser = chance(0.5) ? A : B;
    yield act(loser, 'finger', D.line('huff'), 'yell', 'fight');
    const spot = pick(D.lounge);
    D.walkTo(loser, spot[0], spot[1]);
    yield there(loser);
    face(loser, loser === A ? B : A); loser.dir = 0;
    yield 2.5;
    for (const p of [A, B]) {
      p.stress = clamp(p.stress - 0.3);
      const o = p === A ? B : A;
      p.grudge = p.grudge || {}; p.grudge[o.id] = clamp((p.grudge[o.id] || 0) + 0.4);
    }
  }

  function freeBar() {
    const i = D.bar.taken.findIndex((o) => !o);
    return i;
  }
  function* drink(A, B) {
    const ia = freeBar();
    if (ia < 0) return;
    D.bar.taken[ia] = A;
    let ib = -1;
    if (B) { ib = freeBar(); if (ib < 0) B = null; else D.bar.taken[ib] = B; }
    const sa = D.bar.spots[ia];
    D.walkTo(A, sa[0], sa[1]);
    if (B) D.walkTo(B, D.bar.spots[ib][0], D.bar.spots[ib][1]);
    yield B ? both(A, B) : there(A);
    A.dir = 0; if (B) { B.dir = 0; }
    A.holding = true; if (B) B.holding = true;
    yield 0.7;
    if (B) {
      face(A, B); face(B, A);
      pose(A, 'cheers', 1.2); pose(B, 'cheers', 1.2); D.sfx('cheers');
      say(A, D.line('toast'), 'talk', 'drink');
      yield 1.3;
    } else D.log(`${A.name} grabbed a ${A.vice} from the bar.`, 'drink');
    const sips = 1 + (chance(0.6) ? 1 : 0) + (A.drunk < 0.3 && chance(0.3) ? 1 : 0);
    for (let k = 0; k < sips; k++) {
      pose(A, 'drink', 1.5); if (B) pose(B, 'drink', 1.5);
      D.sfx('glug');
      addDrunk(A, GAIN[A.vice] || 0.12); if (B) addDrunk(B, GAIN[B.vice] || 0.12);
      yield 1.6;
      const who = B && chance(0.5) ? B : A;
      if (chance(0.3)) { say(who, D.line('burp'), 'talk', 'drink'); D.sfx('burp'); yield 1; }
      else if (chance(0.4)) { say(who, D.line('drink_solo'), 'talk'); yield 1.2; }
    }
    for (const p of B ? [A, B] : [A]) {
      p.empties = Math.min(9, (p.empties || 0) + 1);
      decal('bottle', p.x + rnd(-6, 6), p.y + rnd(0, 3), 90, { vice: p.vice });
      p.holding = false;
      if (chance(0.12 + p.drunk * 0.3)) {
        decal('shards', p.x, p.y + 2, 90); decal('beer', p.x, p.y + 3, 60);
        D.sfx('smash'); pose(p, 'wipe', 1.4);
        D.log(`${p.name} dropped a bottle. Glass everywhere.`, 'gross');
        yield say(p, D.line('drop'), 'talk');
        yield 0.8;
      }
    }
    if (A.drunk > 0.8) yield* sleep(A);
    else if (A.drunk > 0.4 && chance(0.5)) { say(A, D.line('drunk'), 'drunk', 'drink'); yield 2; }
  }

  function* sleep(A) {
    const x = pick([16.8, 18.6, 20.2]) * T, y = 4.15 * T;
    D.walkTo(A, x, y);
    yield there(A);
    D.log(`${A.name} passed out on the sofa.`, 'drink');
    A.dir = 0;
    pose(A, 'sleep', 1000);
    yield rnd(14, 26);
    A.drunk = clamp(A.drunk - 0.3);
    A.pose = null;
    yield say(A, D.line('wake'), 'talk');
  }

  function* sneaky(s) {
    s.dir = -1; yield 0.6; s.dir = 1; yield 0.6; s.dir = 0;
    D.log(`${s.name} took a sneaky swig at their desk.`, 'drink');
    pose(s, 'sip', 1.6); D.sfx('glug'); addDrunk(s, (GAIN[s.vice] || 0.1) * 0.6);
    yield say(s, D.line('sneaky'), 'whisper');
    s.empties = Math.min(9, (s.empties || 0) + 1);
    yield 1;
  }

  function* complain(s) {
    if (D.now - s.waitSince > 70) { pose(s, 'finger', 2.4); yield say(s, D.line('waiting_finger'), 'yell', 'fight'); }
    else yield say(s, D.line('waiting'), 'yell');
  }

  function* gossip(A, B, C) {
    D.walkTo(A, B.x + (A.x < B.x ? -12 : 12), B.y + 1);
    yield there(A);
    face(A, B); face(B, A);
    const cn = C ? C.name : 'somebody';
    D.log(`${A.name} is gossiping with ${B.name} about ${cn}.`, 'gossip');
    yield say(A, D.line('gossip', cn), 'whisper');
    pose(B, 'laugh', 1.4);
    yield say(B, D.line('gossip_reply', cn), 'whisper');
    if (C && !C.scene && chance(0.35 * Math.min(1.3, D.K()))) { D.startArgue(C, A, pick(D.L.cause_gossip)); }
  }

  function* stretch(s) { pose(s, 'stretch', 1.4); yield say(s, D.line('stretch'), 'talk'); }
  function* spitFloor(s) {
    pose(s, 'spit', 0.8); D.sfx('spit');
    const x = s.x + (s.dir || 1) * 8, y = s.y + 2;
    decal('spit', x, y, 70);
    D.log(`${s.name} spat on the floor. Classy.`, 'gross');
    yield say(s, D.line('spit_floor'), 'talk');
    const w = others(s).find((o) => Math.hypot(o.x - s.x, o.y - s.y) < 70);
    if (w) yield say(w, D.line('floor_gross'), 'yell');
  }

  // ---------- public starters ----------
  D.startArgue = (A, B, cause) => { if (A && B && A !== B && !A.scene && !B.scene) return D.runScene(argue(A, B, cause), [A, B], 'argue'); };
  D.startDrink = (A, B) => { if (A && !A.scene && !(B && B.scene) && freeBar() >= 0) return D.runScene(drink(A, B), B ? [A, B] : [A], 'drink'); };
  D.fightNow = function () {
    const free = [...D.sprites.values()].filter((s) => !s.scene && !s.gone);
    if (free.length < 2) return;
    const A = pick(free); const B = near(A, free.filter((o) => o !== A));
    A.stress = clamp(A.stress + 0.5);
    D.startArgue(A, B);
  };
  D.happyHour = function () {
    const free = [...D.sprites.values()].filter((s) => !s.scene && !s.gone).sort(() => Math.random() - 0.5);
    D.log('Happy hour! Everyone to the bar.', 'drink');
    while (free.length) {
      const A = free.pop(), B = free.pop();
      if (!D.startDrink(A, B)) break;
    }
  };

  // ---------- moods ----------
  function mood(s, dt) {
    if (s.status === 'error') s.stress += 0.1 * dt;
    else if (s.status === 'waiting') { if (D.now - s.waitSince > 20) s.stress += 0.012 * dt; }
    else if (s.status === 'running' && D.now - s.runSince > 90) s.stress += 0.003 * dt;
    else if (!s.scene) s.stress -= 0.012 * dt;
    s.stress = clamp(s.stress);
    s.drunk = clamp(s.drunk - 0.006 * dt * (s.scene ? 0.5 : 1));
    s.thirst = clamp(s.thirst + dt * 0.003 * (0.6 + s.stress));
  }

  // ---------- director ----------
  let acc = 0;
  D.tickChaos = function (dt) {
    for (const f of D.fx) if (!f.done && D.now - f.t0 >= f.dur) { f.done = true; if (f.land) f.land(); }
    D.decals = D.decals.filter((d) => d.until > D.now);
    tickScenes(dt);
    const all = [...D.sprites.values()];
    for (const s of all) mood(s, dt);
    acc += dt;
    if (acc < 0.5) return;
    const h = acc; acc = 0;
    const K = D.K();
    const maxScenes = Math.max(1, Math.ceil(all.length / 3) + (D.settings.chaos >= 3 ? 1 : 0));
    const free = all.filter((s) => !s.scene && !s.gone);
    for (const s of free.sort(() => Math.random() - 0.5)) {
      if (s.scene || D.scenes.size >= maxScenes) continue;
      const seated = s.seated, lounge = s.x > 232 && !s.walking;
      // trouble the real agent just had
      if (s.status === 'error') {
        if (!s.errHandled) { s.errHandled = true; if (D.now - (s.lastRage || 0) > 18 / Math.max(0.3, K)) { s.lastRage = D.now; D.runScene(rage(s), [s], 'rage'); continue; } }
      } else s.errHandled = false;
      if (D.now < (s.cdUntil || 0)) continue;
      if (s.status === 'waiting' && D.now - s.waitSince > 25 && chance(0.1 * Math.min(1.5, K + 0.3))) { D.runScene(complain(s), [s], 'complain'); continue; }
      if (s.status === 'running' && seated && chance(0.01 * K * (0.2 + s.thirst) * h * 2)) { D.runScene(sneaky(s), [s], 'sneaky'); continue; }
      if (s.drunk > 0.35 && !s.walking && chance(0.012 * h * 2 * s.drunk)) { if (chance(0.4)) { D.runScene(spitFloor(s), [s], 'spit'); } else say(s, D.line('drunk'), 'drunk'); continue; }
      if (s.drunk > 0.75 && seated && s.status === 'running' && chance(0.02 * h)) { pose(s, 'desknap', 6); say(s, '*snore*', 'talk'); D.log(`${s.name} fell asleep on the keyboard.`, 'drink'); continue; }
      const idle = s.status === 'idle' || s.status === 'paused';
      if (idle && lounge) {
        const mates = others(s).filter((o) => (o.status === 'idle' || o.status === 'paused') && o.x > 232);
        if (s.drunk < 0.9 && chance((0.02 + 0.03 * s.thirst) * K * (0.6 + s.stress) * h * 2)) { D.startDrink(s, mates.length && chance(0.5) ? near(s, mates) : null); continue; }
        if (s.stress > 0.45 && chance(0.05 * K * h * 2)) { const v = near(s, others(s)); if (v) { D.startArgue(s, v); continue; } }
        if (mates.length && chance(0.012 * K * h * 2)) { const B = near(s, mates); const C = pick(all.filter((o) => o !== s && o !== B).concat([null])); D.runScene(gossip(s, B, C), [s, B], 'gossip'); continue; }
        if (chance(0.01 * h * 2)) { D.runScene(stretch(s), [s], 'stretch'); continue; }
      }
      // plain bad blood between neighbours, worse when drunk
      if (chance(0.004 * K * (s.temper + 0.3) * (1 + s.drunk * 2) * h * 2)) { const v = near(s, others(s)); if (v) D.startArgue(s, v); }
    }
  };
})();
