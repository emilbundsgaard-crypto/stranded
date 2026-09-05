/* ------------------------------------------------------------------
   Øens form: kysten, byens plateau, vejnettet og biom-opslag.

   Alt andet (terræn, hav, veje, huse, biler, folk) spørger herind i
   stedet for at gætte, så byen ligger fladt, vejene ligger i vejbanen
   og stranden møder vandet, hvor den skal.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;
  const C = O.config.city;

  const PLATEAU = C.plateau;

  /* ---------- Kystlinjen ----------
     En cirkel ser kunstig ud. Radius varierer med retningen, så øen får
     næs, bugter og en bred strand mod syd. */
  function coastR(x, z) {
    const a = Math.atan2(z, x);
    return 246
      + Math.sin(a * 2.0 + 0.6) * 30
      + Math.sin(a * 3.0 - 1.2) * 17
      + Math.sin(a * 5.0 + 2.4) * 9
      + M.fbm(x * 0.0055, z * 0.0055, 3) * 22;
  }

  /* ---------- Byens plateau ----------
     Fladt inden for rektanglet, glidende ud over en bræmme. Uden den
     bræmme ville byen stå på en klods midt i landskabet. */
  const CITY = { x0: -112, x1: 112, z0: -116, z1: 108 };
  const FADE = 34;

  function cityMask(x, z) {
    const dx = Math.min(x - CITY.x0, CITY.x1 - x);
    const dz = Math.min(z - CITY.z0, CITY.z1 - z);
    return M.smootherstep(-FADE, 4, Math.min(dx, dz));
  }

  /* ---------- Vejnettet ----------
     Afstanden til nærmeste vejmidte. Bruges til vejbelægning i terrænet,
     til fortovskanter og til at holde huse og træer ude af kørebanen. */
  function roadDist(x, z) {
    let best = Infinity;
    for (let i = 0; i < C.avenues.length; i++) {
      const d = Math.abs(x - C.avenues[i]);
      if (d < best) best = d;
    }
    for (let i = 0; i < C.streets.length; i++) {
      const d = Math.abs(z - C.streets[i]);
      if (d < best) best = d;
    }
    return best;
  }

  // Vejnettet stopper ved byens kant — ellers ville asfalten løbe ud i havet.
  function roadMask(x, z) {
    const inside = M.smoothstep(-6, 10, Math.min(
      Math.min(x - CITY.x0, CITY.x1 - x),
      Math.min(z - CITY.z0, CITY.z1 - z)));
    return inside;
  }

  function onRoad(x, z) {
    return roadMask(x, z) > 0.5 && roadDist(x, z) < C.roadHalf;
  }

  // Fortovet: bræmmen lige uden for kørebanen.
  function onSidewalk(x, z) {
    if (roadMask(x, z) < 0.5) return false;
    const d = roadDist(x, z);
    return d >= C.roadHalf && d < C.roadHalf + C.walk;
  }

  /* ---------- Højden ---------- */
  function height(x, z) {
    const cm = cityMask(x, z);

    // Byens plan: fladt, men med en kantsten langs fortovet.
    let city = PLATEAU;

    if (cm < 0.999) {
      const r = Math.hypot(x, z * 1.04);
      const cr = coastR(x, z);

      // Fra havbund op til plateauhøjde.
      let h = M.smootherstep(cr + 40, cr - 86, r) * 9.4 - 2.4;

      // Dybere vand længere ude, så horisonten ikke er en flad plade.
      h -= M.smoothstep(cr + 14, cr + 150, r) * 13.0;

      // Bakkerne i nord. De lukker udsigten, så byen ikke ligger på en tallerken.
      const hill = M.smootherstep(-116, -224, z)
                 * M.smootherstep(230, 96, Math.abs(x));
      h += hill * (30 + M.fbm(x * 0.009 + 4, z * 0.009 - 2, 4) * 20);

      // Et klippenæs mod vest.
      const cape = M.smootherstep(-150, -212, x) * M.smootherstep(150, 40, Math.abs(z + 20));
      h += cape * (16 + M.ridged(x * 0.016, z * 0.016, 3) * 22);

      // Kuperet terræn uden for byen.
      h += M.fbm(x * 0.011, z * 0.011, 4) * 4.6;
      h += M.fbm(x * 0.048, z * 0.048, 3) * 0.8;
      h += M.fbm(x * 0.19, z * 0.19, 2) * 0.14;

      if (cm <= 0.001) return h;
      return M.lerp(h, city, cm);
    }

    return city;
  }

  // Karreernes fortove ligger en kantsten højere end kørebanen. Alt der
  // går på jorden spørger om surface() i stedet for height(), så man
  // træder op på fortovet i stedet for at gå igennem det.
  let blockRects = [];
  function surface(x, z) {
    const h = height(x, z);
    for (let i = 0; i < blockRects.length; i++) {
      const b = blockRects[i];
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return h + C.kerb;
    }
    return h;
  }

  function waterDepth(x, z) {
    return Math.max(0, O.config.waterLevel - height(x, z));
  }

  /* ---------- Biomer ----------
     Hvad ligger på jorden her: sand, græs, klippe eller asfalt.
     Terrænet farvelægger efter det, og fodspor og lyd spørger om det samme. */
  function beachness(x, z, h) {
    if (h === undefined) h = height(x, z);
    // Stranden er et bredt bånd langs kysten — bredest mod syd, hvor
    // landet falder fladt ud i vandet, og smallere mod nord, hvor
    // bakkerne går helt ned til klippekysten.
    const south = 0.35 + 0.65 * M.smootherstep(-60, 140, z);
    const low = 1 - M.smoothstep(1.2, 3.0 + south * 6.0, h);
    const wobble = 0.72 + 0.28 * M.fbm(x * 0.022, z * 0.022, 3);
    return M.clamp(low * south * wobble * 1.35 + M.smoothstep(0.6, -1.5, h) * 0.8, 0, 1);
  }

  function rockiness(x, z, h) {
    if (h === undefined) h = height(x, z);
    // Klippe på de stejle bakkesider og på næsset.
    const e = 2.5;
    const hx = height(x + e, z) - height(x - e, z);
    const hz = height(x, z + e) - height(x, z - e);
    const slope = Math.hypot(hx, hz) / (2 * e);
    return M.clamp(M.smoothstep(0.30, 0.75, slope) + M.smoothstep(24, 40, h) * 0.5, 0, 1);
  }

  function lushness(x, z, h) {
    if (h === undefined) h = height(x, z);
    if (h < 0.8) return 0;
    const dry = beachness(x, z, h);
    const rock = rockiness(x, z, h);
    const patchy = 0.6 + 0.4 * M.smoothstep(-0.3, 0.35, M.fbm(x * 0.035 + 11, z * 0.035 - 6, 3));
    return M.clamp((1 - dry) * (1 - rock * 0.85) * patchy, 0, 1);
  }

  /* ---------- Forhindringer ----------
     Byen melder sine huse ind som kasser, klipper og master som cirkler.
     Spilleren, folkene og bilerne bruger den samme liste. */
  const boxes = [];
  const circles = [];

  function blocked(x, z) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
    }
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < c.r * c.r) return c;
    }
    return null;
  }

  // Skubber et punkt ud af den forhindring, det står i. Uden det kan man
  // ende inde i en mur, hvis man bliver skubbet af en bil eller lander skævt.
  function pushOut(p) {
    const b = blocked(p.x, p.z);
    if (!b) return false;
    if (b.r !== undefined) {
      const dx = p.x - b.x, dz = p.z - b.z;
      const d = Math.hypot(dx, dz) || 0.0001;
      p.x = b.x + (dx / d) * (b.r + 0.1);
      p.z = b.z + (dz / d) * (b.r + 0.1);
      return true;
    }
    const dx0 = p.x - b.x0, dx1 = b.x1 - p.x;
    const dz0 = p.z - b.z0, dz1 = b.z1 - p.z;
    const m = Math.min(dx0, dx1, dz0, dz1);
    if (m === dx0) p.x = b.x0 - 0.1;
    else if (m === dx1) p.x = b.x1 + 0.1;
    else if (m === dz0) p.z = b.z0 - 0.1;
    else p.z = b.z1 + 0.1;
    return true;
  }

  O.world = {
    PLATEAU: PLATEAU,
    CITY: CITY,
    coastR: coastR,
    cityMask: cityMask,
    roadDist: roadDist,
    roadMask: roadMask,
    onRoad: onRoad,
    onSidewalk: onSidewalk,
    height: height,
    surface: surface,
    setBlocks: function (b) { blockRects = b; },
    waterDepth: waterDepth,
    beachness: beachness,
    rockiness: rockiness,
    lushness: lushness,

    boxes: boxes,
    circles: circles,
    // top er højden på forhindringen. Skud og synslinjer bruger den; går
    // den ikke med, regnes forhindringen som uendelig høj.
    addBox: function (x0, z0, x1, z1, top) {
      boxes.push({ x0: x0, z0: z0, x1: x1, z1: z1, top: top === undefined ? 1e4 : top });
    },
    addCircle: function (x, z, r, top) {
      circles.push({ x: x, z: z, r: r, top: top === undefined ? 1e4 : top });
    },
    blocked: blocked,
    pushOut: pushOut,

    // Bagudkompatibelt navn: nogle moduler spurgte om colliders som cirkler.
    colliders: circles
  };
})();
