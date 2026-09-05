/* ------------------------------------------------------------------
   Terrænet: sandbred, flodleje og kløftbund.

   Farven ligger i vertexfarver (tør sand, grus, våd bræmme, alger i
   flodlejet), mens en ekstra attribut fortæller materialet hvor vådt
   sandet er — våd sand er både mørkere og blank, og det er dét, der
   får vandkanten til at se rigtig ud.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  function colorAt(x, z, h, out) {
    const wl = O.config.waterLevel;
    const lush = O.world.lushness(x, z, h);
    const grit = M.fbm(x * 0.11, z * 0.11, 3);
    const patch = M.fbm(x * 0.03 + 12, z * 0.03 - 7, 3);

    // Tør sand med langsom variation i lyshed og varme.
    let r = 1.00 + grit * 0.09 + patch * 0.10;
    let g = 0.94 + grit * 0.07 + patch * 0.07;
    let b = 0.83 + grit * 0.05 + patch * 0.04;

    // Grus og hærdet ler på den tørre kløftbund.
    const gravel = M.smoothstep(0.34, 0.78, M.fbm(x * 0.045 + 40, z * 0.045 - 20, 3)) * M.smoothstep(0.7, 2.4, h);
    r = M.lerp(r, 0.80, gravel); g = M.lerp(g, 0.67, gravel); b = M.lerp(b, 0.54, gravel);

    // Fugtigt sand er en bræmme LANGS kanten. Under vandet må sandet ikke
    // gøres mørkt her — det klarer vandets egen absorption, og gør man det
    // to gange, ender det lave vand med at se ud som mudder.
    const wet = (1 - M.smoothstep(-0.02, 0.36, h - wl)) * M.smoothstep(-0.5, -0.02, h - wl);
    r = M.lerp(r, 0.55, wet); g = M.lerp(g, 0.45, wet); b = M.lerp(b, 0.33, wet);

    // Sand under vand er vådt sand: mørkere og mere mættet, allerede få
    // centimeter nede. Ellers lyser bunden hvidt igennem det lave vand.
    const submerged = M.smoothstep(0.0, 0.35, wl - h);
    r = M.lerp(r, 0.50, submerged); g = M.lerp(g, 0.42, submerged); b = M.lerp(b, 0.31, submerged);

    // Først på dybere vand kommer alger og slam til.
    const bed = M.smoothstep(0.55, 2.4, wl - h);
    r = M.lerp(r, 0.40, bed); g = M.lerp(g, 0.41, bed); b = M.lerp(b, 0.30, bed);

    // Det grønne bånd langs vandet.
    const green = lush * 0.5;
    r = M.lerp(r, 0.40, green); g = M.lerp(g, 0.47, green); b = M.lerp(b, 0.24, green);

    out.r = r; out.g = g; out.b = b;
    // Vådt sand er en bræmme LANGS vandkanten. Under vandet skal det ikke
    // være blankt — der ligger jo en vandoverflade ovenpå, og et spejlblankt
    // bundsand er præcis dét, der giver den mælkede dis på det lave vand.
    out.wet = M.clamp((1 - M.smoothstep(-0.02, 0.34, h - wl))
                      * M.smoothstep(-0.32, -0.02, h - wl) * 0.95, 0, 1);
  }

  O.buildTerrain = function (scene, tex, timeUniform) {
    const size = O.config.worldSize;
    const seg = O.quality.get('terrainSeg');
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const wet = new Float32Array(pos.count);
    const c = { r: 0, g: 0, b: 0, wet: 0 };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let h = O.world.height(x, z);
      // Lidt ekstra finkornet variation nu hvor gitteret er tættere.
      h += M.fbm(x * 0.55, z * 0.55, 2) * 0.035;
      pos.setY(i, h);
      colorAt(x, z, h, c);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      wet[i] = c.wet;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
    geo.computeVertexNormals();

    const A = O.config.albedo.sand;
    const mat = new THREE.MeshStandardMaterial({
      // Farven her er ikke pynt: den trækker fotoet af sand ned til en
      // rigtig albedo (se O.config.albedo).
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
    if (O.quality.get('pom')) O.shaderlib.parallax(mat, tex.sandNormal, 0.010, 16.0);
    O.shaderlib.detailNormal(mat, tex.detailNormal, 6.0, 0.30);
    O.shaderlib.macroVariation(mat, tex.macro, 0.030, 0.35);
    O.shaderlib.wetness(mat, 0.45);
    if (tex.caustics) O.shaderlib.caustics(mat, timeUniform, O.config.waterLevel, tex.caustics);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
    return mesh;
  };
})();
