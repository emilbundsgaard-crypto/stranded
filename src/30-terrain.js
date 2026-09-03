/* ------------------------------------------------------------------
   Terrænet: sandbred, flodleje og kløftbund som ét stort mesh med
   vertexfarver (våd sand, tør sand, grus, grønt bånd langs vandet).
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  function colorAt(x, z, h, out) {
    const wl = O.config.waterLevel;
    const lush = O.world.lushness(x, z, h);
    const grit = M.fbm(x * 0.11, z * 0.11, 3);

    // Tør sand som udgangspunkt, med lidt variation i lyshed.
    let r = 1.06 + grit * 0.10;
    let g = 1.00 + grit * 0.08;
    let b = 0.90 + grit * 0.06;

    // Grus- og lerplamager på den tørre kløftbund.
    const gravel = M.smoothstep(0.35, 0.75, M.fbm(x * 0.045 + 40, z * 0.045 - 20, 3)) * M.smoothstep(0.8, 2.6, h);
    r = M.lerp(r, 0.88, gravel); g = M.lerp(g, 0.74, gravel); b = M.lerp(b, 0.60, gravel);

    // Fugtigt sand tættest på vandet — mørkere og mere mættet.
    const wet = 1 - M.smoothstep(-0.05, 0.62, h - wl);
    r = M.lerp(r, 0.52, wet); g = M.lerp(g, 0.44, wet); b = M.lerp(b, 0.36, wet);

    // Alger og mudder på bunden af floden.
    const bed = M.smoothstep(0.15, 1.6, wl - h);
    r = M.lerp(r, 0.40, bed); g = M.lerp(g, 0.40, bed); b = M.lerp(b, 0.31, bed);

    // Det grønne bånd hvor græsset gror.
    const green = lush * 0.55;
    r = M.lerp(r, 0.44, green); g = M.lerp(g, 0.52, green); b = M.lerp(b, 0.26, green);

    out.r = r; out.g = g; out.b = b;
  }

  O.buildTerrain = function (scene, tex) {
    const size = O.config.worldSize;
    const seg = 220;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = { r: 0, g: 0, b: 0 };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = O.world.height(x, z);
      pos.setY(i, h);
      colorAt(x, z, h, c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: tex.sand,
      normalMap: tex.sandNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
    return mesh;
  };
})();
