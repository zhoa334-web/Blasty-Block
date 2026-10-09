(() => {
  // ---------- Config ----------
  const N = 8, CELL = 46, W = 400, H = 590;
  const BX = 16, BY = 8;                 // board origin (top-left, canvas px)
  const TY = 400, TCELL = 22;            // tray top, tray cell size
  const LIFT = 78;                       // piece floats above the finger
  const GRACE = 2;                       // non-clearing moves before combo breaks
  const COLORS = ["#ff6b6b", "#ffb347", "#8ce99a", "#4dd0e1", "#b388ff", "#ff8ad8", "#5c8dff"];
  const LINE_PTS = [0, 10, 30, 60, 100, 150, 210, 280, 360, 450];
  const PRAISE = ["", "Good", "Great!", "Excellent!", "Amazing!", "Unreal!"];

  // ---------- Shapes (no rotation: every orientation is its own entry) ----------
  const ART = [
    ["#"], ["##"], ["###"], ["####"], ["#####"],
    ["#", "#"], ["#", "#", "#"], ["#", "#", "#", "#"], ["#", "#", "#", "#", "#"],
    ["##", "##"], ["###", "###", "###"], ["###", "###"], ["##", "##", "##"],
    ["#.", "##"], [".#", "##"], ["##", "#."], ["##", ".#"],
    ["#.", "#.", "##"], [".#", ".#", "##"], ["##", "#.", "#."], ["##", ".#", ".#"],
    ["#..", "#..", "###"], ["..#", "..#", "###"], ["###", "#..", "#.."], ["###", "..#", "..#"],
    ["###", ".#."], [".#.", "###"], ["#.", "##", "#."], [".#", "##", ".#"],
    [".##", "##."], ["##", ".##"], ["#.", "##", ".#"], [".#", "##", "#."]
  ];
  const SHAPES = ART.map((rows, i) => {
    const cells = [];
    rows.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && cells.push([x, y])));
    return { cells, w: rows[0].length, h: rows.length, color: i % COLORS.length,
             weight: cells.length <= 2 ? 0.7 : cells.length >= 9 ? 0.6 : 1 };
  });

  // ---------- State ----------
  const $ = id => document.getElementById(id);
  const cv = $("c"), ctx = cv.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);

  const store = {
    get: () => { try { return +localStorage.getItem("bb_best") || 0; } catch { return 0; } },
    set: v => { try { localStorage.setItem("bb_best", v); } catch {} }
  };
  let grid, tray, score, shown, best = store.get(), startBest, combo, since, over, drag, fx = [];

  function newGame() {
    grid = Array.from({ length: N }, () => Array(N).fill(-1));
    score = shown = combo = since = 0; over = false; drag = null; fx = [];
    startBest = best;
    refill();
    $("over").hidden = true;
    $("best").textContent = best;
  }

  // ---------- Rules ----------
  const canPlace = (s, ax, ay) => s.cells.every(([x, y]) => {
    const gx = ax + x, gy = ay + y;
    return gx >= 0 && gy >= 0 && gx < N && gy < N && grid[gy][gx] < 0;
  });

  const fits = s => {
    for (let y = 0; y <= N - s.h; y++) for (let x = 0; x <= N - s.w; x++) if (canPlace(s, x, y)) return true;
    return false;
  };

  // Rows/columns that WOULD be full if shape s were placed at (ax, ay). Non-mutating.
  function lines(s, ax, ay) {
    const add = new Set(s.cells.map(([x, y]) => (ay + y) * N + ax + x));
    const full = (x, y) => grid[y][x] >= 0 || add.has(y * N + x);
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      let r = true, c = true;
      for (let j = 0; j < N; j++) { if (!full(j, i)) r = false; if (!full(i, j)) c = false; }
      if (r) rows.push(i);
      if (c) cols.push(i);
    }
    return { rows, cols };
  }

  function refill() {
    const total = SHAPES.reduce((a, s) => a + s.weight, 0);
    const pick = () => { let t = Math.random() * total; for (const s of SHAPES) if ((t -= s.weight) <= 0) return s; return SHAPES[0]; };
    for (let a = 0; a < 40; a++) {            // fairness: at least one piece must fit
      tray = [pick(), pick(), pick()];
      if (tray.some(s => fits(s))) return;
    }
    tray = [SHAPES[0], SHAPES[1], SHAPES[0]];
  }

  function place(i, ax, ay) {
    const s = tray[i];
    s.cells.forEach(([x, y]) => (grid[ay + y][ax + x] = s.color));
    const { rows, cols } = lines(s, ax, ay);
    const n = rows.length + cols.length;
    let gain = s.cells.length;

    if (n) {
      const clr = new Set();                  // collect first, clear after: crossing lines clear together
      rows.forEach(r => { for (let x = 0; x < N; x++) clr.add(r * N + x); });
      cols.forEach(c => { for (let y = 0; y < N; y++) clr.add(y * N + c); });
      const now = performance.now();
      clr.forEach(k => { const x = k % N, y = (k / N) | 0; fx.push({ x, y, c: grid[y][x], t: now }); grid[y][x] = -1; });
      combo++; since = 0;
      gain += Math.round(LINE_PTS[Math.min(n, 9)] * Math.min(1 + 0.5 * (combo - 1), 5));
      const perfect = grid.every(r => r.every(v => v < 0));
      if (perfect) gain += 200;
      say(perfect ? "Perfect clear!" : PRAISE[Math.min(n, 5)], combo > 1 ? `Combo ×${combo}` : "", `+${gain}`);
    } else if (++since > GRACE) combo = 0;

    score += gain;
    if (score > best) { best = score; store.set(best); }
    tray[i] = null;
    if (tray.every(t => !t)) refill();        // refill BEFORE the game-over check
    if (!tray.some(t => t && fits(t))) end();
  }

  function end() {
    over = true;
    $("final").textContent = score;
    $("newbest").hidden = !(score > startBest);
    setTimeout(() => ($("over").hidden = false), 550);
  }

  function say(big, ...small) {
    const m = $("msg");
    m.innerHTML = big + small.filter(Boolean).map(t => `<small>${t}</small>`).join("");
    m.classList.remove("pop"); void m.offsetWidth; m.classList.add("pop");
  }

  // ---------- Input ----------
  const pos = e => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  };

  function target() {                          // snapped drop cell for the dragged piece
    if (!drag) return null;
    const s = tray[drag.i];
    const ax = Math.round((drag.px - s.w * CELL / 2 - BX) / CELL);
    const ay = Math.round((drag.py - LIFT - s.h * CELL / 2 - BY) / CELL);
    return canPlace(s, ax, ay) ? { s, ax, ay } : null;
  }

  cv.addEventListener("pointerdown", e => {
    if (over) return;
    const [px, py] = pos(e);
    if (py < TY - 10) return;
    const i = Math.min(2, Math.max(0, Math.floor(px / (W / 3))));
    if (!tray[i]) return;
    drag = { i, px, py };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", e => { if (drag) [drag.px, drag.py] = pos(e); });
  cv.addEventListener("pointerup", () => {
    if (!drag) return;
    const t = target(), i = drag.i;
    drag = null;
    if (t && !over) place(i, t.ax, t.ay);
  });
  cv.addEventListener("pointercancel", () => (drag = null));
  $("restart").onclick = $("again").onclick = newGame;

  // ---------- Rendering ----------
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };

  function block(px, py, sz, ci, a = 1) {
    const p = 2, s = sz - p * 2;
    ctx.globalAlpha = a;
    ctx.fillStyle = COLORS[ci]; rr(px + p, py + p, s, s, sz * 0.2);
    ctx.fillStyle = "rgba(255,255,255,.28)"; rr(px + p + sz * 0.08, py + p + sz * 0.08, s - sz * 0.16, s * 0.32, sz * 0.12);
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#241c3f"; rr(BX - 6, BY - 6, N * CELL + 12, N * CELL + 12, 16);

    const t = target(), hl = new Set();
    if (t) {
      const L = lines(t.s, t.ax, t.ay);
      L.rows.forEach(r => { for (let x = 0; x < N; x++) hl.add(r * N + x); });
      L.cols.forEach(c => { for (let y = 0; y < N; y++) hl.add(y * N + c); });
    }

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = BX + x * CELL, py = BY + y * CELL;
      ctx.fillStyle = "#31285a"; rr(px + 2, py + 2, CELL - 4, CELL - 4, 8);
      if (grid[y][x] >= 0) block(px, py, CELL, grid[y][x]);
      if (hl.has(y * N + x)) { ctx.fillStyle = "rgba(255,255,255,.4)"; rr(px + 2, py + 2, CELL - 4, CELL - 4, 8); }
    }

    if (t) t.s.cells.forEach(([x, y]) => block(BX + (t.ax + x) * CELL, BY + (t.ay + y) * CELL, CELL, t.s.color, hl.size ? 0.85 : 0.5));

    fx = fx.filter(f => now - f.t < 350);      // clear animation: shrink + fade
    fx.forEach(f => {
      const p = (now - f.t) / 350, sz = CELL * (1 - p);
      block(BX + f.x * CELL + (CELL - sz) / 2, BY + f.y * CELL + (CELL - sz) / 2, sz, f.c, 1 - p);
    });

    tray.forEach((s, i) => {                   // tray (greyed out when the piece has no valid spot)
      if (!s || (drag && drag.i === i)) return;
      const left = (i + 0.5) * W / 3 - s.w * TCELL / 2, top = TY + 95 - s.h * TCELL / 2, a = fits(s) ? 1 : 0.3;
      s.cells.forEach(([x, y]) => block(left + x * TCELL, top + y * TCELL, TCELL, s.color, a));
    });

    if (drag) {                                // dragged piece at full board size
      const s = tray[drag.i], left = drag.px - s.w * CELL / 2, top = drag.py - LIFT - s.h * CELL / 2;
      s.cells.forEach(([x, y]) => block(left + x * CELL, top + y * CELL, CELL, s.color));
    }

    shown += (score - shown) * 0.15;
    if (Math.abs(score - shown) < 0.5) shown = score;
    $("score").textContent = Math.round(shown);
    $("best").textContent = best;
    requestAnimationFrame(frame);
  }

  newGame();
  requestAnimationFrame(frame);
})();