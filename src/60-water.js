/* ------------------------------------------------------------------
   Vandet.

   Tre ting bygger billedet op: en spejling (scenen renderes igen fra et
   kamera spejlet i overfladen), en brydning (scenen uden vand, forskudt
   af bølgerne, så man ser sten og grus nede i det lave vand), og et bagt
   dybdekort, der styrer hvor meget lys der bliver slugt undervejs.
   Oveni ligger skum langs kanten og solglimt på krusningerne.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  function bakeDepthTexture(res) {
    const size = O.config.worldSize;
    const data = new Uint8Array(res * res * 4);
    for (let j = 0; j < res; j++) {
      const z = (j / (res - 1) - 0.5) * size;
      for (let i = 0; i < res; i++) {
        const x = (i / (res - 1) - 0.5) * size;
        const depth = O.config.waterLevel - O.world.height(x, z);
        const k = (j * res + i) * 4;
        data[k] = M.clamp(depth / 3.0, 0, 1) * 255;
        data[k + 1] = M.clamp((depth + 0.4) / 0.8, 0, 1) * 255;
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
    varying vec4 vScreen;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vReflectCoord = uTextureMatrix * world;
      vec4 mvPosition = viewMatrix * world;
      gl_Position = projectionMatrix * mvPosition;
      vScreen = gl_Position;
      // Atmosfære-chunken læser 'transformed' (som i three's egne shadere).
      vec3 transformed = position;
      #include <fog_vertex>
    }
  `;

  const FRAG = `
    #include <common>
    #include <fog_pars_fragment>

    uniform sampler2D uReflect;
    uniform sampler2D uRefract;
    uniform sampler2D uDepthMap;
    uniform sampler2D uNormalMap;
    uniform sampler2D uFoam;
    uniform float uTime;
    uniform float uWorldSize;
    uniform vec3 uSun;
    uniform vec3 uSunColor;
    uniform vec3 uCamPos;
    uniform float uDebug;
    uniform vec3 uHorizonColor;
    uniform vec3 uZenithColor;
    uniform float uFoamAmount;
    varying vec4 vReflectCoord;
    varying vec4 vScreen;
    varying vec3 vWorld;

    // Store dønninger som få sinusser — de bærer den langsomme bevægelse.
    float swell(vec2 p) {
      return sin(p.x * 0.30 + p.y * 0.21 + uTime * 0.75) * 0.55
           + sin(p.x * -0.23 + p.y * 0.47 + uTime * 0.95) * 0.40;
    }

    vec3 sampleNormal(vec2 p, float scale, vec2 drift) {
      vec3 n = texture2D(uNormalMap, p * scale + drift * uTime).xyz * 2.0 - 1.0;
      return n;
    }

    void main() {
      vec2 duv = vWorld.xz / uWorldSize + 0.5;
      vec4 dsample = texture2D(uDepthMap, duv);
      float depth = dsample.r * 3.0;
      if (depth <= 0.004) discard;

      float dist = length(uCamPos - vWorld);
      float detail = 1.0 - smoothstep(22.0, 120.0, dist);

      // Krusninger i tre lag der driver hver sin vej — det er dét, der
      // gør fladen levende i stedet for regelmæssig.
      vec3 n1 = sampleNormal(vWorld.xz, 0.055, vec2(0.004, 0.0026));
      vec3 n2 = sampleNormal(vWorld.xz, 0.145, vec2(-0.0032, 0.0045));
      vec3 n3 = sampleNormal(vWorld.xz, 0.420, vec2(0.0075, -0.0060));
      vec2 ripple = n1.xy * 0.75 + n2.xy * 0.5 * detail + n3.xy * 0.28 * detail;

      float e = 0.6;
      vec2 sw = vec2(swell(vWorld.xz + vec2(e, 0.0)) - swell(vWorld.xz - vec2(e, 0.0)),
                     swell(vWorld.xz + vec2(0.0, e)) - swell(vWorld.xz - vec2(0.0, e)));

      // Krusningerne dæmpes inde på det lave vand. Hældningerne skal holdes
      // små — stille vand er nærmest et spejl, og selv få graders ekstra
      // hældning ødelægger både spejlingen og fresnel-effekten.
      float shallowDamp = smoothstep(0.02, 0.45, depth);
      vec3 n = normalize(vec3(-(ripple.x * 0.10 + sw.x * 0.045) * shallowDamp,
                              1.0,
                              -(ripple.y * 0.10 + sw.y * 0.045) * shallowDamp));

      vec3 viewDir = normalize(uCamPos - vWorld);
      float ndv = clamp(dot(viewDir, n), 0.0, 1.0);
      float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

      // --- Brydning: bunden set gennem vandet ---
      vec2 screenUv = (vScreen.xy / vScreen.w) * 0.5 + 0.5;
      float refrAmt = mix(0.004, 0.030, smoothstep(0.0, 1.4, depth)) * (0.4 + 0.6 * detail);
      vec3 bottom = texture2D(uRefract, clamp(screenUv + n.xz * refrAmt, 0.002, 0.998)).rgb;

      // Lyset slukkes med dybden, og vandet får sin egen farve.
      // Rødt lys forsvinder først, men langsomt — vandet er klart, og man
      // skal kunne se sandet ligge lige under overfladen.
      vec3 absorb = vec3(0.36, 0.10, 0.05);
      vec3 trans = exp(-absorb * depth * 1.1);
      vec3 scatter = mix(vec3(0.06, 0.15, 0.15), vec3(0.02, 0.08, 0.13), smoothstep(0.5, 2.6, depth));
      vec3 body = bottom * trans + scatter * (1.0 - trans);

      // (Ingen kaustik her: den hører til på bunden, og terrænmaterialet
      //  tegner den allerede dér. Lagde man den oveni på selve overfladen,
      //  blev hele det lave vand dækket af et bredt lyst slør.)

      // --- Spejling ---
      // Spejlbilledet er kun kendt dér, hvor det faktisk blev renderet. Når
      // koordinatet falder uden for kanten, må der ikke bare smøres kantpixel
      // ud over vandet (det er dét, der ligner tåge) — der tones over i
      // himlens farve i stedet.
      float distort = mix(0.006, 0.045, smoothstep(0.0, 1.2, depth));
      vec2 ruv = vReflectCoord.xy / max(vReflectCoord.w, 0.0001);
      ruv += n.xz * distort;
      float edgeDist = min(min(ruv.x, 1.0 - ruv.x), min(ruv.y, 1.0 - ruv.y));
      float inside = smoothstep(0.0, 0.045, edgeDist);
      vec3 skyApprox = mix(uHorizonColor, uZenithColor, clamp(0.35 + n.y * 0.4, 0.0, 1.0));
      vec3 reflection = mix(skyApprox, texture2D(uReflect, clamp(ruv, 0.002, 0.998)).rgb, inside);

      vec3 col = mix(body, reflection, fres);

      // --- Solglimt ---
      vec3 hvec = normalize(normalize(uSun) + viewDir);
      float ndh = max(dot(n, hvec), 0.0);
      col += uSunColor * pow(ndh, 700.0) * 3.0;
      col += uSunColor * pow(ndh, 90.0) * 0.05;

      // --- Skum langs vandkanten ---
      float edge = 1.0 - smoothstep(0.0, 0.035, depth);
      float band = sin(depth * 90.0 - uTime * 1.4 + swell(vWorld.xz * 2.0) * 2.0) * 0.5 + 0.5;
      float foamTex = texture2D(uFoam, vWorld.xz * 0.7 + n.xz * 0.05 + uTime * vec2(0.004, 0.003)).r;
      float foam = clamp(edge * (0.35 + 0.65 * band) * smoothstep(0.35, 0.8, foamTex), 0.0, 1.0) * uFoamAmount;
      col = mix(col, vec3(0.86, 0.85, 0.81), foam * 0.28);

      // Med et rigtigt brydningsbillede er der ingen grund til at blande
      // vandet halvgennemsigtigt oven på terrænet — det er netop dét, der
      // gør det lave vand mælket. Kun de yderste centimeter fades.
      float alpha = smoothstep(0.0, 0.03, depth);

      if (uDebug > 1.5) { gl_FragColor = vec4(reflection, 1.0); }
      else if (uDebug > 0.5) { gl_FragColor = vec4(bottom, 1.0); }
      else { gl_FragColor = vec4(col, alpha); }
      #include <tonemapping_fragment>
      #include <fog_fragment>
    }
  `;

  O.buildWater = function (scene, renderer, camera, sky) {
    const size = O.config.worldSize;
    const geo = new THREE.PlaneGeometry(size, size, 128, 128);
    geo.rotateX(-Math.PI / 2);

    const tex = O.textures.build();
    const pr = Math.min(window.devicePixelRatio, 2);
    // Hjælpebillederne gemmes uden tonekurve, så de skal kunne rumme værdier
    // over 1 — i en almindelig 8-bit buffer ville himmel og solbelyst klippe
    // blive klippet til hvidt, og vandet ville se ud som mælk.
    const hdr = renderer.capabilities.isWebGL2;
    function makeTarget(scale) {
      const rt = new THREE.WebGLRenderTarget(
        Math.max(2, Math.floor(window.innerWidth * pr * scale)),
        Math.max(2, Math.floor(window.innerHeight * pr * scale)),
        { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat, encoding: THREE.LinearEncoding,
          type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType }
      );
      rt.userData = { scale: scale };
      return rt;
    }
    const Q = O.quality.settings;
    const reflectRT = makeTarget(Q.reflect);   // uskarp spejling ligner tåge
    const refractRT = makeTarget(Q.refract);

    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uReflect: { value: null }, uRefract: { value: null },
        uDepthMap: { value: null }, uNormalMap: { value: null }, uFoam: { value: null },
        uTextureMatrix: { value: new THREE.Matrix4() },
        uTime: { value: 0 },
        uWorldSize: { value: size },
        uSun: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color(1.0, 0.93, 0.80) },
        uCamPos: { value: new THREE.Vector3() },
        uDebug: { value: 0 },
        uHorizonColor: { value: new THREE.Color(0.62, 0.66, 0.72) },
        uZenithColor: { value: new THREE.Color(0.26, 0.42, 0.72) },
        uFoamAmount: { value: 0.45 }
      }
    ]);
    uniforms.uReflect.value = reflectRT.texture;
    uniforms.uRefract.value = refractRT.texture;
    uniforms.uDepthMap.value = bakeDepthTexture(512);
    uniforms.uNormalMap.value = tex.waterNormal;
    uniforms.uFoam.value = tex.foam;
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

    function update(scene, hideList, doRefract) {
      // Begge hjælpebilleder skal være scene-refererede: tonekurven må først
      // lægges på til allersidst, når vandets egen farve er blandet i.
      const oldTone = renderer.toneMapping;
      if (hdr) renderer.toneMapping = THREE.NoToneMapping;

      const restore = [];
      mesh.visible = false;
      for (const obj of hideList) { restore.push([obj, obj.visible]); obj.visible = false; }

      // 1) Brydning: scenen som den ser ud gennem overfladen. Står man
      //    langt fra vandet, ser man alligevel kun spejlingen — så springes
      //    hele det ekstra pas over.
      if (doRefract !== false) {
        renderer.setRenderTarget(refractRT);
        renderer.clear();
        renderer.render(scene, camera);
      }

      // 2) Spejling.
      view.subVectors(mirrorPos, camera.position);
      view.reflect(normal).negate().add(mirrorPos);
      rotation.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rotation).add(camera.position);
      target.subVectors(mirrorPos, lookAt);
      target.reflect(normal).negate().add(mirrorPos);

      reflectCam.position.copy(view);
      reflectCam.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      reflectCam.lookAt(target);
      reflectCam.near = camera.near;
      reflectCam.far = camera.far;
      reflectCam.fov = camera.fov;
      reflectCam.aspect = camera.aspect;
      reflectCam.updateMatrixWorld();
      reflectCam.updateProjectionMatrix();

      texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      texMatrix.multiply(reflectCam.projectionMatrix);
      texMatrix.multiply(reflectCam.matrixWorldInverse);
      uniforms.uTextureMatrix.value.copy(texMatrix);

      renderer.setRenderTarget(reflectRT);
      renderer.clear();
      renderer.render(scene, reflectCam);

      renderer.setRenderTarget(null);
      renderer.toneMapping = oldTone;
      mesh.visible = true;
      for (const [obj, v] of restore) obj.visible = v;
    }

    function resize() {
      const p = Math.min(window.devicePixelRatio, 2);
      /* eslint-disable-next-line no-use-before-define */
      for (const rt of [reflectRT, refractRT]) {
        rt.setSize(
          Math.max(2, Math.floor(window.innerWidth * p * rt.userData.scale * quality)),
          Math.max(2, Math.floor(window.innerHeight * p * rt.userData.scale * quality))
        );
      }
    }

    // Ydelsestrappe: på en presset maskine koster de to hjælpebilleder mest,
    // så de skrumper først.
    let quality = 1.0;
    function setQuality(high) {
      quality = high ? 1.0 : 0.55;
      resize();
    }

    return { mesh: mesh, uniforms: uniforms, update: update, resize: resize,
             setQuality: setQuality, get quality() { return quality; } };
  };
})();
