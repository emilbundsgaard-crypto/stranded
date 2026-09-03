/* ------------------------------------------------------------------
   Himmel og lys: gradient-kuppel med tynde cirrusskyer, varm morgensol
   med skygger, og et blødt fyldlys fra sandet.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const SKY_FRAG = `
    varying vec3 vDir;
    uniform vec3 uSun;
    uniform float uTime;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
      return v;
    }

    void main() {
      vec3 dir = normalize(vDir);
      float h = clamp(dir.y, -1.0, 1.0);

      vec3 zenith  = vec3(0.20, 0.42, 0.80);
      vec3 mid     = vec3(0.47, 0.66, 0.90);
      vec3 horizon = vec3(0.86, 0.87, 0.86);

      float t = pow(clamp(h, 0.0, 1.0), 0.55);
      vec3 col = mix(horizon, mid, smoothstep(0.0, 0.34, t));
      col = mix(col, zenith, smoothstep(0.30, 1.0, t));

      // Cirrusskyer: strakte striber der driver langsomt.
      vec2 uv = dir.xz / max(0.12, abs(dir.y) + 0.28);
      uv *= vec2(0.55, 1.7);
      uv += vec2(uTime * 0.0035, uTime * 0.0012);
      float warp = fbm(uv * 0.5);
      float streak = fbm(uv * vec2(1.2, 3.4) + warp * 1.4);
      float clouds = smoothstep(0.52, 0.82, streak) * smoothstep(0.02, 0.28, h);
      float wispy = smoothstep(0.44, 0.95, fbm(uv * vec2(2.6, 7.0) + warp)) * clouds;
      col = mix(col, vec3(1.0, 0.99, 0.98), clouds * 0.55 + wispy * 0.35);

      // Solskive og halo.
      float sd = max(dot(dir, normalize(uSun)), 0.0);
      col += vec3(1.0, 0.85, 0.62) * pow(sd, 220.0) * 4.0;
      col += vec3(1.0, 0.78, 0.52) * pow(sd, 8.0) * 0.28;

      // Dis nede ved horisonten.
      col = mix(col, vec3(0.90, 0.88, 0.84), smoothstep(0.09, -0.10, h));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  O.buildSky = function (scene) {
    const s = O.config.sunDirection;
    const sun = new THREE.Vector3(s.x, s.y, s.z).normalize();

    const uniforms = {
      uSun: { value: sun },
      uTime: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    scene.add(mesh);

    // --- Lys ---
    const sunLight = new THREE.DirectionalLight(O.srgb(0xfff1d8), 2.35);
    sunLight.position.copy(sun).multiplyScalar(120);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const d = 96;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 320;
    sunLight.shadow.bias = -0.0009;
    sunLight.shadow.normalBias = 0.35;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Himmel- og sandbounce, så skyggerne ikke bliver sorte huller.
    const hemi = new THREE.HemisphereLight(O.srgb(0x9ec1f5), O.srgb(0xd8a978), 0.85);
    scene.add(hemi);

    // Varmt modlys fra sandet, så skyggerne ikke bliver kolde og blå.
    const bounce = new THREE.DirectionalLight(O.srgb(0xffcf9a), 0.55);
    bounce.position.set(-sun.x * 60, 22, -sun.z * 60);
    scene.add(bounce);

    const ambient = new THREE.AmbientLight(O.srgb(0x9a7f5e), 0.35);
    scene.add(ambient);

    scene.fog = new THREE.FogExp2(O.srgb(0xcfc7b6), 0.0034);

    return { mesh: mesh, uniforms: uniforms, sun: sun, light: sunLight, hemi: hemi };
  };
})();
