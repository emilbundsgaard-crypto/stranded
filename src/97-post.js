/* ------------------------------------------------------------------
   Efterbehandling: bloom på de lyseste steder, filmisk farvegradering
   med varme højlys og kølige skygger, vignet og kantudjævning.
   Det er det sidste lag der binder billedet sammen.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      uExposure: { value: 1.0 },
      uContrast: { value: 1.04 },
      uSaturation: { value: 1.08 },
      uVignette: { value: 0.34 },
      uShadowTint: { value: new THREE.Vector3(0.94, 0.98, 1.10) },
      uHighlightTint: { value: new THREE.Vector3(1.05, 1.00, 0.94) },
      uGrain: { value: 0.018 },
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uExposure, uContrast, uSaturation, uVignette, uGrain, uTime;
      uniform vec3 uShadowTint, uHighlightTint;
      varying vec2 vUv;

      float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

      // Lineær -> sRGB. Composerens buffere er lineære, så konverteringen
      // skal ske her til sidst i stedet for i rendereren.
      vec3 toSRGB(vec3 c){
        return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055,
                   step(0.0031308, c));
      }

      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;

        // Delt toning: skygger trækkes mod himlens blå, højlys mod solens varme.
        float l = luma(c);
        c *= mix(uShadowTint, uHighlightTint, smoothstep(0.05, 0.65, l));

        // Blød S-kurve omkring middeltonen.
        c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
        c = c * c * (3.0 - 2.0 * c) * 0.22 + c * 0.78;

        // Mætning.
        c = mix(vec3(luma(c)), c, uSaturation);

        // Vignet — svag, kun for at samle blikket.
        vec2 q = vUv - 0.5;
        float v = 1.0 - uVignette * dot(q, q) * 1.9;
        c *= v;

        c = toSRGB(max(c, 0.0));

        // En anelse korn, så de store flader ikke banding'er.
        float g = fract(sin(dot(vUv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        c += (g - 0.5) * uGrain;

        gl_FragColor = vec4(c, 1.0);
      }
    `
  };

  O.buildPost = function (renderer, scene, camera) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    const w = Math.floor(size.x * pr), h = Math.floor(size.y * pr);

    // Multisamplet mål på WebGL2 giver ægte kantudjævning selv med
    // efterbehandling; ellers falder vi tilbage på FXAA.
    let target = null;
    const msaa = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget;
    if (msaa) {
      target = new THREE.WebGLMultisampleRenderTarget(w, h, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, encoding: THREE.LinearEncoding
      });
      target.samples = 4;
    }

    const composer = new THREE.EffectComposer(renderer, target || undefined);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);

    composer.addPass(new THREE.RenderPass(scene, camera));

    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.7, 0.93);
    composer.addPass(bloom);

    const grade = new THREE.ShaderPass(GradeShader);
    composer.addPass(grade);

    let fxaa = null;
    if (!msaa) {
      fxaa = new THREE.ShaderPass(THREE.FXAAShader);
      fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
      composer.addPass(fxaa);
    }
    composer.passes[composer.passes.length - 1].renderToScreen = true;

    return {
      composer: composer,
      bloom: bloom,
      grade: grade,
      render: function (dt, t) {
        grade.material.uniforms.uTime.value = t;
        composer.render(dt);
      },
      resize: function () {
        renderer.getSize(size);
        const p = renderer.getPixelRatio();
        const nw = Math.floor(size.x * p), nh = Math.floor(size.y * p);
        composer.setPixelRatio(p);
        composer.setSize(size.x, size.y);
        bloom.setSize(nw, nh);
        if (fxaa) fxaa.material.uniforms.resolution.value.set(1 / nw, 1 / nh);
      },
      setQuality: function (high) {
        bloom.enabled = true;
        bloom.strength = high ? 0.22 : 0.14;
      }
    };
  };
})();
