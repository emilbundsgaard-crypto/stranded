/* ------------------------------------------------------------------
   Verdens form: floden/oasen, terrænhøjder og biom-opslag.
   Alle andre moduler (terræn, vand, planter, sten) spørger herind
   i stedet for at gætte, så alting flugter perfekt.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  const RIVER_DEPTH = 2.45;   // dybeste punkt i midten af løbet
  const BANK_HEIGHT = 1.55;   // hvor højt bredden hæver sig
  const BANK_WIDTH = 20.0;    // hvor langt der er fra vandkant til kløftbund

  // Flodens rygrad — en blød S-kurve gennem kløften.
  const CONTROL = [
    [-46, 190], [-30, 140], [-12, 92], [4, 44], [2, 2],
    [-8, -44], [4, -92], [26, -140], [44, -196]
  ];

  // Halvbredde langs løbet: bredest i midten, hvor oasen ligger.
  const WIDTH_POINTS = [10, 13, 18, 26, 30, 24, 16, 12, 9];

  // Catmull-Rom udglatning af rygraden til en tæt punktliste.
  function buildSpine() {
    const pts = [];
    const P = CONTROL;
    const W = WIDTH_POINTS;
    const steps = 14;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const w1 = W[i], w2 = W[i + 1];
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        pts.push({ x: x, z: z, w: M.lerp(w1, w2, t) });
      }
    }
    pts.push({ x: P[P.length - 1][0], z: P[P.length - 1][1], w: W[W.length - 1] });
    return pts;
  }

  const SPINE = buildSpine();

  // Afstand til flodens midterlinje + den lokale bredde på det sted.
  // Den eksakte udgave løber hele rygraden igennem og er for dyr til at
  // kalde hundredtusindvis af gange, så resultatet lægges i et gitter og
  // slås op med bilineær interpolation bagefter.
  function riverExact(x, z, out) {
    let best = Infinity, bw = 12;
    for (let i = 0; i < SPINE.length - 1; i++) {
      const a = SPINE[i], b = SPINE[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const wx = x - a.x, wz = z - a.z;
      const len2 = vx * vx + vz * vz;
      let t = len2 > 0 ? (wx * vx + wz * vz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (a.x + vx * t), dz = z - (a.z + vz * t);
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bw = M.lerp(a.w, b.w, t); }
    }
    out.d = Math.sqrt(best);
    out.w = bw;
    return out;
  }

  const GRID_N = 320;
  const GRID_EXTENT = 420;          // gitteret dækker mere end verden er stor
  const gridD = new Float32Array(GRID_N * GRID_N);
  const gridW = new Float32Array(GRID_N * GRID_N);
  (function buildGrid() {
    const tmp = { d: 0, w: 0 };
    const step = (GRID_EXTENT * 2) / (GRID_N - 1);
    for (let j = 0; j < GRID_N; j++) {
      const z = -GRID_EXTENT + j * step;
      for (let i = 0; i < GRID_N; i++) {
        const x = -GRID_EXTENT + i * step;
        riverExact(x, z, tmp);
        gridD[j * GRID_N + i] = tmp.d;
        gridW[j * GRID_N + i] = tmp.w;
      }
    }
  })();

  const _res = { d: 0, w: 0 };
  function river(x, z) {
    const step = (GRID_EXTENT * 2) / (GRID_N - 1);
    let fx = (x + GRID_EXTENT) / step;
    let fz = (z + GRID_EXTENT) / step;
    if (fx < 0 || fz < 0 || fx > GRID_N - 1.001 || fz > GRID_N - 1.001) {
      return riverExact(x, z, _res);
    }
    const i0 = fx | 0, j0 = fz | 0;
    const tx = fx - i0, tz = fz - j0;
    const k00 = j0 * GRID_N + i0, k10 = k00 + 1, k01 = k00 + GRID_N, k11 = k01 + 1;
    const d0 = gridD[k00] + (gridD[k10] - gridD[k00]) * tx;
    const d1 = gridD[k01] + (gridD[k11] - gridD[k01]) * tx;
    const w0 = gridW[k00] + (gridW[k10] - gridW[k00]) * tx;
    const w1 = gridW[k01] + (gridW[k11] - gridW[k01]) * tx;
    _res.d = d0 + (d1 - d0) * tz;
    _res.w = w0 + (w1 - w0) * tz;
    return _res;
  }

  // Bredden bugter sig, så vandkanten ikke bliver en kedelig kurve.
  function edgeWobble(x, z) {
    return M.fbm(x * 0.028, z * 0.028, 3) * 3.4 + M.fbm(x * 0.09, z * 0.09, 2) * 1.1;
  }

  function height(x, z) {
    const r = river(x, z);
    const w = r.w + edgeWobble(x, z);
    const rel = r.d / Math.max(1, w);

    let h;
    if (rel < 1) {
      // Flodleje: blødt skålformet, fladt i bunden.
      h = -RIVER_DEPTH * Math.cos(rel * Math.PI * 0.5) * (1 - 0.25 * rel * rel);
    } else {
      h = 0;
    }

    // Bred, sandet bred der stiger op mod kløftbunden.
    const t = (r.d - w) / BANK_WIDTH;
    h += BANK_HEIGHT * M.smootherstep(0, 1, t);

    // Klitter og bølget kløftbund — dæmpet nede ved vandet.
    const away = M.smoothstep(-2, 26, r.d - w);
    h += M.fbm(x * 0.014, z * 0.014, 4) * 3.0 * away;
    h += M.fbm(x * 0.055, z * 0.055, 3) * 0.55 * away;
    h += M.fbm(x * 0.21, z * 0.21, 2) * 0.12 * (0.35 + 0.65 * away);

    // Kløften lukker sig langt ude, så horisonten er klippe og ikke tomhed.
    h += M.smoothstep(52, 150, r.d) * 16.0;

    return h;
  }

  function waterDepth(x, z) {
    return Math.max(0, O.config.waterLevel - height(x, z));
  }

  // Hvor frodigt der er: græs vokser i det fugtige bånd langs vandet.
  function lushness(x, z, h) {
    if (h === undefined) h = height(x, z);
    const band = M.smoothstep(-0.35, 0.05, h) * (1 - M.smoothstep(0.55, 2.3, h));
    // Pletvis vækst: åbne sandflader mellem totterne.
    const patchy = M.smoothstep(-0.12, 0.34, M.fbm(x * 0.042, z * 0.042, 3))
                 * (0.55 + 0.45 * M.smoothstep(-0.3, 0.3, M.fbm(x * 0.16 + 9, z * 0.16 - 4, 2)));
    return M.clamp(band * patchy, 0, 1);
  }

  O.world = {
    RIVER_DEPTH: RIVER_DEPTH,
    spine: SPINE,
    river: river,
    height: height,
    waterDepth: waterDepth,
    lushness: lushness,
    colliders: []   // udfyldes af klippe-modulet
  };
})();
