/* ------------------------------------------------------------------
   Vandet. Ægte plan-spejling (scenen renderes en ekstra gang fra et
   spejlvendt kamera), krusninger, dybdefarve og solglimt.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  // Bag et dybdekort ud fra terrænet, så vandet ved hvor lavt der er.
  function bakeDepthTexture(res) {
    const size = O.config.worldSize;
    const data = new Uint8Array(res * res * 4);
    for (let j = 0; j < res; j++) {
      const z = (j / (res - 1) - 0.5) * size;
      for (let i = 0; i < res; i++) {
        const x = (i / (res - 1) - 0.5) * size;
        const h = O.world.height(x, z);
        const depth = O.config.waterLevel - h;
        const k = (j * res + i) * 4;
        data[k] = M.clamp(depth / 3.0, 0, 1) * 255;        // dybde
        data[k + 1] = M.clamp((depth + 0.25) / 0.5, 0, 1) * 255; // blød vandkant
        data[k + 2] = 255;
        data[k + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  const VERT = `
    #include <common>
    #include <fog_pars_vertex>
    uniform mat4 uTextureMatrix;
    varying vec4 vReflectCoord;
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vReflectCoord = uTextureMatrix * world;
      vec4 mvPosition = viewMatrix * world;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;

  const FRAG = `
    #include <common>
    #include <fog_pars_fragment>
    uniform sampler2D uReflect;
    uniform sampler2D uDepthMap;
    uniform float uTime;
    uniform float uWorldSize;
    uniform vec3 uSun;
    uniform vec3 uSunColor;
    uniform vec3 uCamPos;
    varying vec4 vReflectCoord;
    varying vec3 vWorld;

    float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    // Sum af krusninger — billigt, men giver den rigtige uro på fladen.
    float waveHeight(vec2 p, float detail) {
      float h = 0.0;
      h += sin(p.x * 0.42 + p.y * 0.28 + uTime * 0.9) * 0.55;
      h += sin(p.x * -0.31 + p.y * 0.63 + uTime * 1.15) * 0.42;
      h += sin(p.x * 0.93 - p.y * 0.71 + uTime * 1.9) * 0.20 * detail;
      h += sin(p.x * 1.71 + p.y * 1.42 + uTime * 2.6) * 0.11 * detail;
      h += sin(p.x * 3.10 - p.y * 2.60 + uTime * 3.4) * 0.05 * detail;
      return h;
    }

    vec3 waveNormal(vec2 p, float detail, float scale) {
      float e = 0.35;
      float hx = waveHeight(p + vec2(e, 0.0), detail) - waveHeight(p - vec2(e, 0.0), detail);
      float hz = waveHeight(p + vec2(0.0, e), detail) - waveHeight(p - vec2(0.0, e), detail);
      return normalize(vec3(-hx * scale, 1.0, -hz * scale));
    }

    void main() {
      vec2 duv = vWorld.xz / uWorldSize + 0.5;
      vec4 dsample = texture2D(uDepthMap, duv);
      float depth = dsample.r * 3.0;
      if (depth <= 0.004) discard;

      float dist = length(uCamPos - vWorld);
      float detail = 1.0 - smoothstep(18.0, 90.0, dist);   // dæmp fine bølger langt væk
      vec3 n = waveNormal(vWorld.xz, detail, 0.16 + 0.10 * detail);

      vec3 viewDir = normalize(uCamPos - vWorld);
      float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 4.0);
      fres = mix(0.03, 1.0, fres);

      // Spejlingen forskydes af krusningerne — mindre på det lave vand.
      float distort = mix(0.008, 0.055, smoothstep(0.0, 1.2, depth));
      vec2 ruv = vReflectCoord.xy / max(vReflectCoord.w, 0.0001);
      ruv += n.xz * distort;
      vec3 reflection = texture2D(uReflect, clamp(ruv, 0.001, 0.999)).rgb;

      // Bunden set gennem vandet. Den bliver "spist" af dybden, så det
      // lave vand er sandfarvet og det dybe grønblåt.
      vec2 bedUv = vWorld.xz + n.xz * 1.6;          // svag brydning
      float bedGrain = vnoise(bedUv * 1.7) * 0.35 + vnoise(bedUv * 0.35) * 0.3;
      vec3 bedColor = vec3(0.60, 0.50, 0.36) * (0.72 + bedGrain);

      // Kaustik: lysnet fra bølgerne der samler sig på bunden.
      float caus = waveHeight(vWorld.xz * 1.15 + n.xz * 2.0, detail);
      caus = pow(clamp(caus * 0.5 + 0.6, 0.0, 1.0), 4.0);
      bedColor += vec3(1.0, 0.92, 0.72) * caus * 0.34 * (1.0 - smoothstep(0.2, 2.0, depth));

      float extinction = exp(-depth * 1.05);
      vec3 tint = mix(vec3(0.30, 0.44, 0.38), vec3(0.05, 0.15, 0.20), smoothstep(0.5, 2.4, depth));
      vec3 body = mix(tint, bedColor, extinction);

      vec3 col = mix(body, reflection, fres);

      // Solglimt.
      vec3 hvec = normalize(normalize(uSun) + viewDir);
      float spec = pow(max(dot(n, hvec), 0.0), 220.0);
      col += uSunColor * spec * 1.6;
      col += uSunColor * pow(max(dot(n, hvec), 0.0), 22.0) * 0.06;

      // Blød vandkant, så bredden ikke skæres over af en hård linje.
      float edge = smoothstep(0.0, 0.12, depth);
      float alpha = mix(0.35, 0.97, edge);

      gl_FragColor = vec4(col, alpha);
      #include <fog_fragment>
    }
  `;

  O.buildWater = function (scene, renderer, camera, sky) {
    const size = O.config.worldSize;
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    const rtW = Math.floor(window.innerWidth * pixelRatio * 0.5);
    const rtH = Math.floor(window.innerHeight * pixelRatio * 0.5);
    const renderTarget = new THREE.WebGLRenderTarget(rtW, rtH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      encoding: THREE.sRGBEncoding
    });

    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uReflect: { value: null },
        uDepthMap: { value: null },
        uTextureMatrix: { value: new THREE.Matrix4() },
        uTime: { value: 0 },
        uWorldSize: { value: size },
        uSun: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
        uCamPos: { value: new THREE.Vector3() }
      }
    ]);
    uniforms.uReflect.value = renderTarget.texture;
    uniforms.uDepthMap.value = bakeDepthTexture(512);
    uniforms.uSun.value = sky.sun.clone();

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: uniforms,
      transparent: true,
      fog: true,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = O.config.waterLevel;
    mesh.renderOrder = 10;
    mesh.name = 'water';
    scene.add(mesh);

    // --- Spejlkamera (samme princip som THREE.Reflector) ---
    const reflectCam = new THREE.PerspectiveCamera();
    const normal = new THREE.Vector3(0, 1, 0);
    const mirrorPos = new THREE.Vector3(0, O.config.waterLevel, 0);
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    const rotation = new THREE.Matrix4();
    const texMatrix = new THREE.Matrix4();

    function updateReflection(scene, hideList) {
      view.subVectors(mirrorPos, camera.position);
      view.reflect(normal).negate().add(mirrorPos);

      rotation.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rotation).add(camera.position);
      target.subVectors(mirrorPos, lookAt);
      target.reflect(normal).negate().add(mirrorPos);

      reflectCam.position.copy(view);
      reflectCam.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      reflectCam.lookAt(target);
      reflectCam.far = camera.far;
      reflectCam.fov = camera.fov;
      reflectCam.aspect = camera.aspect;
      reflectCam.near = camera.near;
      reflectCam.updateMatrixWorld();
      reflectCam.updateProjectionMatrix();

      texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      texMatrix.multiply(reflectCam.projectionMatrix);
      texMatrix.multiply(reflectCam.matrixWorldInverse);
      uniforms.uTextureMatrix.value.copy(texMatrix);

      const restore = [];
      mesh.visible = false;
      for (const obj of hideList) { restore.push([obj, obj.visible]); obj.visible = false; }

      const currentXR = renderer.xr.enabled;
      renderer.xr.enabled = false;
      renderer.setRenderTarget(renderTarget);
      renderer.clear();
      renderer.render(scene, reflectCam);
      renderer.setRenderTarget(null);
      renderer.xr.enabled = currentXR;

      mesh.visible = true;
      for (const [obj, v] of restore) obj.visible = v;
    }

    function resize() {
      const pr = Math.min(window.devicePixelRatio, 2);
      renderTarget.setSize(
        Math.max(2, Math.floor(window.innerWidth * pr * 0.5)),
        Math.max(2, Math.floor(window.innerHeight * pr * 0.5))
      );
    }

    return {
      mesh: mesh,
      uniforms: uniforms,
      update: updateReflection,
      resize: resize
    };
  };
})();
