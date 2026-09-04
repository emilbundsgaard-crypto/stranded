/* ------------------------------------------------------------------
   Himmel, lys og miljørefleksion.

   Himlen tegnes med en analytisk model (Rayleigh-agtig gradient, mie-glød
   om solen, solskive og to lag skyer) og bruges bagefter til at bage et
   miljøkort. Dermed får alle materialer i scenen lys fra hele himmelkuplen
   og ikke bare fra én lyskilde — det er dét, der giver klipperne dybde.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const SKY_FRAG = `
    varying vec3 vDir;
    uniform vec3 uSun;
    uniform float uTime;
    uniform float uCloudy;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p, int oct){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 6; i++) {
        if (i >= oct) break;
        v += a * noise(p); p = p * 2.03 + vec2(1.7, -3.1); a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 dir = normalize(vDir);
      vec3 sun = normalize(uSun);
      float h = dir.y;
      float mu = dot(dir, sun);

      // Grundgradient: dyb blå i zenit, lys dis ved horisonten. Eksponenten
      // gør overgangen tættere på en rigtig atmosfære end en lineær rampe.
      float t = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 1.0);
      vec3 zenith  = vec3(0.085, 0.230, 0.560);
      vec3 middle  = vec3(0.330, 0.545, 0.850);
      vec3 horizon = vec3(0.760, 0.815, 0.880);
      float k = clamp(h, 0.0, 1.0);
      vec3 col = mix(horizon, middle, smoothstep(0.0, 0.22, pow(k, 0.62)));
      col = mix(col, zenith, smoothstep(0.16, 0.92, pow(k, 0.55)));

      // Mie-spredning: den varme glød i en bred kegle omkring solen.
      float mie = pow(max(mu, 0.0), 6.0);
      col += vec3(0.95, 0.68, 0.42) * mie * 0.22;
      col += vec3(1.00, 0.80, 0.58) * pow(max(mu, 0.0), 60.0) * 0.55;

      // Solskiven. Kanten er blød, så bloom kan tage over.
      float disc = smoothstep(0.99955, 0.99985, mu);
      col += vec3(1.0, 0.94, 0.82) * disc * 9.0;

      // Skyer i to lag: høje cirrus-striber og et tyndere slør nedenunder,
      // begge projiceret på en flad "himmelplade" så de flader ud mod horisonten.
      vec2 uv = dir.xz / max(0.06, h + 0.14);
      vec2 cir = uv * vec2(0.30, 0.95) + vec2(uTime * 0.0028, uTime * 0.0009);
      float warp = fbm(cir * 0.55, 4);
      float streak = fbm(cir * vec2(0.9, 3.1) + warp * 1.7, 5);
      float cirrus = smoothstep(0.50, 0.86, streak);
      float fine = smoothstep(0.42, 0.95, fbm(cir * vec2(2.2, 6.4) + warp * 1.2, 4));

      vec2 vel = uv * 0.16 + vec2(uTime * 0.0012, uTime * 0.0006);
      float veil = smoothstep(0.55, 0.95, fbm(vel, 5)) * 0.5;

      float mask = smoothstep(0.015, 0.30, h) * uCloudy;
      float clouds = (cirrus * 0.62 + fine * 0.30 + veil * 0.35) * mask;

      // Skyerne er lysest på den side der vender mod solen.
      vec3 cloudCol = mix(vec3(0.93, 0.94, 0.96), vec3(1.0, 0.97, 0.92), max(mu, 0.0));
      col = mix(col, cloudCol, clamp(clouds, 0.0, 0.92));

      // Dis og støv langs horisonten.
      col = mix(col, vec3(0.86, 0.83, 0.78), smoothstep(0.10, -0.06, h));
      col = mix(col, vec3(0.80, 0.74, 0.66), smoothstep(-0.02, -0.30, h));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  O.buildSky = function (scene, renderer, camera) {
    const s = O.config.sunDirection;
    const sun = new THREE.Vector3(s.x, s.y, s.z).normalize();

    const uniforms = {
      uSun: { value: sun },
      uTime: { value: 0 },
      uCloudy: { value: 1.0 }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 40), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    scene.add(mesh);

    /* ---- Miljøkort bagt fra himlen (IBL) ---- */
    // Uden det bliver alt i skyggen ensfarvet gråt. Med det får sand og
    // klipper himlens farve ovenfra og sandets varme tone nedefra.
    let envMap = null;
    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const envScene = new THREE.Scene();
      const envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 20), mat);
      envSky.geometry.scale(-1, 1, 1);   // vi ser den indefra
      envScene.add(envSky);
      // En stor, sandfarvet "jordflade" så bouncet nedefra er varmt.
      const ground = new THREE.Mesh(
        new THREE.SphereGeometry(9.5, 16, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
        new THREE.MeshBasicMaterial({ color: O.srgb(0xb08a5e), side: THREE.BackSide })
      );
      envScene.add(ground);
      const target = pmrem.fromScene(envScene, 0.02);
      envMap = target.texture;
      scene.environment = envMap;
      envSky.geometry.dispose();
      ground.geometry.dispose();
      pmrem.dispose();
    }

    /* ---- Luften mellem os og klipperne ---- */
    O.atmosphere.install({
      sunDirection: sun,
      sunColor: 0xffe0ae,
      groundColor: 0xd8b88c
    });

    /* ---- Sollys med kaskade-skygger ---- */
    // Ét skyggekort skal dække både grusset ved fødderne og klippen 150 m
    // væk; det kan ikke lade sig gøre skarpt. Kaskader deler synsfeltet op,
    // så det nære får sin egen høje opløsning.
    const Q = O.quality.settings;

    // I sikker tilstand bruges ét almindeligt lys med et enkelt skyggekort.
    // Objektet efterligner CSM's grænseflade, så resten af koden er ens.
    let csm;
    if (O.safeMode) {
      const l = new THREE.DirectionalLight(O.srgb(0xfff2dc), 2.70);
      l.position.copy(sun).multiplyScalar(140);
      l.castShadow = true;
      l.shadow.mapSize.set(1024, 1024);
      const d = 90;
      l.shadow.camera.left = -d; l.shadow.camera.right = d;
      l.shadow.camera.top = d; l.shadow.camera.bottom = -d;
      l.shadow.camera.near = 1; l.shadow.camera.far = 400;
      l.shadow.normalBias = 0.3;
      scene.add(l, l.target);
      csm = {
        lights: [l],
        update: function () {},
        updateFrustums: function () {},
        setupMaterial: function () {}
      };
    } else {
      csm = new THREE.CSM({
        maxFar: Q.shadowCascades >= 3 ? 240 : 150,
        cascades: Q.shadowCascades,
        mode: 'practical',
        parent: scene,
        shadowMapSize: Q.shadowSize,
        lightDirection: sun.clone().negate(),
        lightIntensity: 2.70,
        lightMargin: 220,
        shadowBias: -0.00008,
        camera: camera
      });
      csm.fade = true;
      const normalBias = [0.02, 0.08, 0.30];
      csm.lights.forEach(function (l, i) {
        l.color.copy(O.srgb(0xfff2dc));
        l.shadow.normalBias = normalBias[i] || 0.3;
        l.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
        // VSM sløres i skyggekortet selv; en kant uden halvskygge er dét,
        // der får skygger til at se klippede ud. På de lave niveauer bruges
        // almindelig PCF, som er billigere.
        l.shadow.radius = Q.shadowSoft ? ([2.5, 4.0, 6.0][i] || 4.0) : 1.0;
        l.shadow.bias = Q.shadowSoft ? 0.0 : -0.0004;
      });
    }

    // Skyggefyld. En skygge i ørkenen er ikke sort — den er belyst af den
    // blå himmelkuppel og af varmt lys kastet tilbage fra sandet.
    const hemi = new THREE.HemisphereLight(O.srgb(0xd3e1f4), O.srgb(0xe3b184), 0.85);
    scene.add(hemi);

    // (Intet ekstra retningsbestemt bouncelys: kaskade-skyggerne kræver, at
    // scenens retningsbestemte lys ER kaskaderne. Det varme tilbagekast fra
    // sandet leveres af himmellysets jordfarve og af miljøkortet.)

    const ambient = new THREE.AmbientLight(O.srgb(0xc09a6e), 0.40);
    scene.add(ambient);

    scene.fog = new THREE.FogExp2(O.srgb(0xd3cec4), 0.0042);

    return {
      mesh: mesh, uniforms: uniforms, sun: sun, csm: csm,
      hemi: hemi, ambient: ambient, envMap: envMap
    };
  };
})();
