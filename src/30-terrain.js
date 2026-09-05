/* ------------------------------------------------------------------
   Øens terræn.

   Ét net over hele verden, men med vertexerne fordelt radiært: tæt
   omkring byen, hvor man går, og groft ude ved horisonten, hvor ingen
   alligevel kan se forskel. Uden den fordeling koster en verden på
   900 meter enten en million trekanter eller en strand af klodser.

   Overfladen er tre fotografiske materialer blandet efter en
   vertex-attribut — sand, græs og klippe — plus vådt sand langs
   vandkanten og kaustik under overfladen.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  // Radiær omfordeling: u i [-1,1] ind, u ud, men med vægten trukket
  // ind mod midten. 0.30 er andelen, der bliver ved med at være lineær —
  // uden den bliver de inderste kvadrater så små, at de flimrer.
  function warp(u) {
    const a = Math.abs(u);
    return (u < 0 ? -1 : 1) * (0.46 * a + 0.54 * Math.pow(a, 2.0));
  }

  function colorAt(x, z, h, out) {
    const wl = O.config.waterLevel;
    const beach = O.world.beachness(x, z, h);
    const rock = O.world.rockiness(x, z, h);
    const lush = O.world.lushness(x, z, h);

    // Grundtone: lys, varm sandfarve. Splat-laget lægger græs og klippe
    // ovenpå, så den her farve er mest til stranden og det nøgne.
    //
    // Variationen i to skalaer er ikke pynt: uden den bliver en strand på
    // hundrede meter én eneste flad khakifarve, fordi teksturen alligevel
    // er mipmappet væk på afstand.
    const patch = M.fbm(x * 0.013, z * 0.013, 3);
    const fine = M.fbm(x * 0.075, z * 0.075, 3);
    const v = 1.0 + patch * 0.22 + fine * 0.09;
    let r = 1.00 * v, g = (0.97 + patch * 0.03) * v, b = (0.90 + patch * 0.06) * v;

    // Vådt sand langs vandkanten er mørkere.
    const wet = (1 - M.smoothstep(-0.05, 0.75, h - wl)) * M.smoothstep(-0.9, -0.05, h - wl);
    r = M.lerp(r, 0.62, wet); g = M.lerp(g, 0.58, wet); b = M.lerp(b, 0.52, wet);

    // Under vandet: mørkere bund, og alger på det dybere.
    const sub = M.smoothstep(0.0, 0.6, wl - h);
    r = M.lerp(r, 0.55, sub); g = M.lerp(g, 0.54, sub); b = M.lerp(b, 0.47, sub);
    const bed = M.smoothstep(1.0, 5.0, wl - h);
    r = M.lerp(r, 0.42, bed); g = M.lerp(g, 0.48, bed); b = M.lerp(b, 0.44, bed);

    // Inde på byens plateau er der ikke græsmark mellem husene. Jorden dér
    // er slidt grus og støv — ellers ser vejen ud til at stoppe brat midt
    // i en plæne, når man når byens kant.
    const cm = O.world.cityMask(x, z);
    if (cm > 0.01) {
      const dust = cm * 0.85;
      r = M.lerp(r, 0.74, dust); g = M.lerp(g, 0.73, dust); b = M.lerp(b, 0.70, dust);
    }

    out.r = r; out.g = g; out.b = b;
    out.grass = M.clamp(lush * (1 - sub) * (1 - cm * 0.92), 0, 1);
    out.rock = M.clamp(rock * (1 - beach * 0.6) * (1 - sub * 0.7) * (1 - cm), 0, 1);
    out.wet = M.clamp(wet * 0.95 + sub * 0.5, 0, 1);
  }

  O.buildTerrain = function (scene, tex, timeUniform) {
    const size = O.config.worldSize;
    const half = size * 0.5;
    const seg = O.quality.get('terrainSeg');
    const n = seg + 1;

    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const colors = new Float32Array(n * n * 3);
    const splat = new Float32Array(n * n * 2);
    const wet = new Float32Array(n * n);
    const c = { r: 0, g: 0, b: 0, grass: 0, rock: 0, wet: 0 };

    const TILE = 5.5;   // meter pr. teksturflise

    for (let j = 0; j < n; j++) {
      const v = (j / seg) * 2 - 1;
      const z = warp(v) * half;
      for (let i = 0; i < n; i++) {
        const u = (i / seg) * 2 - 1;
        const x = warp(u) * half;
        const k = j * n + i;
        const h = O.world.height(x, z);
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        uv[k * 2] = x / TILE; uv[k * 2 + 1] = z / TILE;
        colorAt(x, z, h, c);
        colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
        splat[k * 2] = c.grass; splat[k * 2 + 1] = c.rock;
        wet[k] = c.wet;
      }
    }

    const idx = new (n * n > 65535 ? Uint32Array : Uint16Array)(seg * seg * 6);
    let p = 0;
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
        idx[p++] = a; idx[p++] = d; idx[p++] = b;
        idx[p++] = b; idx[p++] = d; idx[p++] = e;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 2));
    geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const A = O.config.albedo.sand;
    const mat = new THREE.MeshStandardMaterial({
      // Farven trækker fotoet af sand ned til en rigtig albedo
      // (se O.config.albedo).
      color: new THREE.Color(A.r, A.g, A.b),
      map: tex.sand,
      normalMap: tex.sandNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: tex.sandRough,
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.7
    });

    if (tex.grass && tex.rockGrain) {
      // Samme regnestykke som for sandet: fotoernes egen lyshed trækkes ned
      // til noget, der kan bruges som albedo, og den blå kanal løftes, fordi
      // fotografier af græs og sten er meget blå-fattige. Målt på
      // billedernes middelværdi i lineært rum.
      O.shaderlib.splat(mat, tex.grass, tex.rockGrain, {
        scaleA: 0.55, scaleB: 1.7,
        tintA: [1.20, 0.86, 2.80],
        tintB: [0.63, 0.66, 0.68]
      });
    }
    O.shaderlib.detailNormal(mat, tex.detailNormal, 6.0, 0.30);
    O.shaderlib.macroVariation(mat, tex.macro, 0.016, 0.42);
    O.shaderlib.wetness(mat, 0.45);
    if (tex.caustics) O.shaderlib.caustics(mat, timeUniform, O.config.waterLevel, tex.caustics);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
    return mesh;
  };
})();
