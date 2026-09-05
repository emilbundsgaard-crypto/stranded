/* ------------------------------------------------------------------
   Fodspor.

   Hvert skridt sætter et aftryk i sandet, der bliver stående og falmer
   langsomt væk. Aftrykkene tegnes som en pulje af små flader oven på
   terrænet med multiplikativ blanding: teksturen er hvid udenom (som
   ikke ændrer noget) og mørk indeni, så sandet bliver trykket sammen og
   fugtigt netop dér, hvor støvlen har været.

   Puljen genbruges — det ældste spor overskrives, når puljen er fuld,
   så hukommelsen er den samme efter ti skridt som efter ti tusind.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  const MAX = 220;          // hvor mange spor der ligger ad gangen
  const LIFE = 90;          // sekunder før et spor er helt væk

  // Støvlesål set oppefra: hæl, trædepude og et mønster imellem.
  function bootTexture() {
    const W = 128, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    function sole(y0, y1, w0, w1, r) {
      ctx.beginPath();
      ctx.moveTo(W / 2 - w0 / 2, y0);
      ctx.quadraticCurveTo(W / 2, y0 - r, W / 2 + w0 / 2, y0);
      ctx.lineTo(W / 2 + w1 / 2, y1);
      ctx.quadraticCurveTo(W / 2, y1 + r, W / 2 - w1 / 2, y1);
      ctx.closePath();
      ctx.fill();
    }

    // Selve aftrykket: mørkt, fugtigt sand, presset sammen af sålen.
    ctx.fillStyle = 'rgba(104,88,68,0.88)';
    sole(26, 148, 70, 58, 22);          // forfod, rundet i tåen
    sole(176, 236, 52, 42, 16);         // hæl, smallere

    // Sålens mønster: kun antydninger, ellers ligner aftrykket en stige.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < 5; i++) {
      const y = 52 + i * 20;
      const w = 44 - Math.abs(i - 2) * 5;
      ctx.beginPath();
      ctx.ellipse(W / 2, y, w / 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(W / 2, 202, 17, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Sandet er trykket dybest i hæl og trædepude.
    ctx.fillStyle = 'rgba(78,64,48,0.42)';
    ctx.beginPath(); ctx.ellipse(W / 2, 120, 26, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W / 2, 206, 20, 16, 0, 0, Math.PI * 2); ctx.fill();

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    return t;
  }

  const VERT = `
    attribute float aAge;
    varying float vAge;
    varying vec2 vUv;
    void main() {
      vAge = aAge;
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
    }
  `;

  const FRAG = `
    uniform sampler2D map;
    varying float vAge;
    varying vec2 vUv;
    void main() {
      if ( vAge >= 1.0 ) discard;
      vec4 t = texture2D( map, vUv );
      // Multiplikativ blanding: hvid lader sandet i fred, mørkt trykker det ned.
      float strength = t.a * ( 1.0 - vAge ) * ( 1.0 - vAge );
      gl_FragColor = vec4( mix( vec3( 1.0 ), t.rgb, strength ), 1.0 );
    }
  `;

  O.buildTracks = function (scene) {
    const geo = new THREE.PlaneGeometry(0.145, 0.33);   // en støvlesål, ikke en dør
    geo.rotateX(-Math.PI / 2);

    const ages = new Float32Array(MAX).fill(2);   // 2 = tomt felt
    geo.setAttribute('aAge', new THREE.InstancedBufferAttribute(ages, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { map: { value: bootTexture() } },
      blending: THREE.MultiplyBlending,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });

    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;          // efter terrænet, før vandet
    mesh.count = MAX;
    scene.add(mesh);

    const dummy = new THREE.Object3D();
    // Alle felter starter usynligt langt væk.
    dummy.position.set(0, -9999, 0);
    dummy.updateMatrix();
    for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;

    let next = 0;
    let leftFoot = false;

    return {
      mesh: mesh,

      // Sæt et aftryk. Kun på sand — ikke på dybt vand og ikke oppe i klippen.
      step: function (pos, yaw, depth) {
        if (depth > 0.35) return;
        const ground = O.world.height(pos.x, pos.z);
        if (ground < -0.6) return;

        leftFoot = !leftFoot;
        const side = leftFoot ? -0.10 : 0.10;
        const cx = Math.cos(yaw), sx = Math.sin(yaw);
        // Sidevektoren for retningen man går i.
        const x = pos.x + cx * side;
        const z = pos.z - sx * side;

        dummy.position.set(x, O.world.height(x, z) + 0.012, z);
        dummy.rotation.set(0, yaw + (Math.random() - 0.5) * 0.16, 0);
        const s = 0.92 + Math.random() * 0.16;
        dummy.scale.set(s, 1, s);
        dummy.updateMatrix();

        mesh.setMatrixAt(next, dummy.matrix);
        ages[next] = 0;
        mesh.instanceMatrix.needsUpdate = true;
        geo.attributes.aAge.needsUpdate = true;
        next = (next + 1) % MAX;
      },

      update: function (dt) {
        let dirty = false;
        for (let i = 0; i < MAX; i++) {
          if (ages[i] < 1) {
            ages[i] += dt / LIFE;
            dirty = true;
          }
        }
        if (dirty) geo.attributes.aAge.needsUpdate = true;
      }
    };
  };
})();
