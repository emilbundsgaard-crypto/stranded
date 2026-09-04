/* ------------------------------------------------------------------
   Render-pipeline og efterbehandling.

   Scenen tegnes til en HDR-buffer med dybdetekstur. Dybden bruges til
   ambient occlusion — det bløde mørke i sprækker, under sten og hvor
   græsset møder jorden. Det er den enkeltdetalje, øjet bruger til at
   afgøre, om ting rent faktisk står på jorden.

   Derefter: bloom på de lyseste steder, filmisk farvegradering og SMAA
   til kanterne.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  /* ---------- Ambient occlusion ud fra dybdebufferen ---------- */
  const SSAO_FRAG = `
    uniform sampler2D tDepth;
    uniform mat4 uProjInv;
    uniform mat4 uProj;
    uniform vec2 uResolution;
    uniform float uRadius;
    uniform float uIntensity;
    uniform float uBias;
    uniform vec3 uKernel[ 16 ];
    varying vec2 vUv;

    float getDepth( vec2 uv ) { return texture2D( tDepth, uv ).x; }

    vec3 getViewPos( vec2 uv ) {
      float d = getDepth( uv );
      vec4 clip = vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
      vec4 v = uProjInv * clip;
      return v.xyz / v.w;
    }

    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }

    void main() {
      float d = getDepth( vUv );
      if ( d >= 0.99999 ) { gl_FragColor = vec4( 1.0 ); return; }   // himlen

      vec3 p = getViewPos( vUv );
      vec3 n = normalize( cross( dFdx( p ), dFdy( p ) ) );

      // Tilfældig drejning pr. pixel spreder de 16 prøver ud, så mønsteret
      // bliver til støj (som sløres væk) i stedet for til ringe.
      float ang = hash( vUv * uResolution ) * 6.2831853;
      vec3 rvec = vec3( cos( ang ), sin( ang ), 0.0 );
      vec3 t = normalize( rvec - n * dot( rvec, n ) );
      vec3 b = cross( n, t );
      mat3 tbn = mat3( t, b, n );

      float occ = 0.0;
      for ( int i = 0; i < 16; i ++ ) {
        vec3 sp = p + tbn * uKernel[ i ] * uRadius;
        vec4 off = uProj * vec4( sp, 1.0 );
        vec2 suv = ( off.xy / off.w ) * 0.5 + 0.5;
        if ( suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0 ) continue;
        float sz = getViewPos( suv ).z;
        float rangeCheck = smoothstep( 0.0, 1.0, uRadius / max( 0.0001, abs( p.z - sz ) ) );
        occ += ( sz >= sp.z + uBias ? 1.0 : 0.0 ) * rangeCheck;
      }

      float ao = 1.0 - ( occ / 16.0 ) * uIntensity;
      gl_FragColor = vec4( vec3( clamp( ao, 0.0, 1.0 ) ), 1.0 );
    }
  `;

  // Dybde-bevidst sløring: AO må ikke smøre hen over kanter.
  const BLUR_FRAG = `
    uniform sampler2D tAO;
    uniform sampler2D tDepth;
    uniform vec2 uDirection;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float centerDepth = texture2D( tDepth, vUv ).x;
      float sum = 0.0, wsum = 0.0;
      for ( int i = -3; i <= 3; i ++ ) {
        vec2 off = uDirection * uTexel * float( i );
        float d = texture2D( tDepth, vUv + off ).x;
        float w = exp( -abs( d - centerDepth ) * 900.0 ) * exp( -float( i * i ) * 0.14 );
        sum += texture2D( tAO, vUv + off ).r * w;
        wsum += w;
      }
      gl_FragColor = vec4( vec3( sum / max( wsum, 0.0001 ) ), 1.0 );
    }
  `;

  const COMPOSITE_FRAG = `
    uniform sampler2D tScene;
    uniform sampler2D tAO;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tScene, vUv );
      float ao = texture2D( tAO, vUv ).r;
      ao = pow( clamp( ao, 0.0, 1.0 ), uStrength );
      c.rgb *= ao;
      gl_FragColor = c;
    }
  `;

  // Solstråler: kun himmelpixels bidrager, og de smøres radialt ud fra
  // solens position på skærmen. Det er den samme effekt, man ser når lyset
  // står mellem to klippevægge og støvet i luften gør strålerne synlige.
  const GODRAY_FRAG = `
    uniform sampler2D tScene;
    uniform sampler2D tDepth;
    uniform vec2 uSunUv;
    uniform float uDensity;
    uniform float uDecay;
    uniform float uWeight;
    varying vec2 vUv;

    void main() {
      vec2 delta = ( vUv - uSunUv ) * uDensity / 24.0;
      vec2 uv = vUv;
      float illum = 1.0;
      vec3 acc = vec3( 0.0 );
      for ( int i = 0; i < 24; i ++ ) {
        uv -= delta;
        float d = texture2D( tDepth, uv ).x;
        vec3 c = ( d >= 0.99999 ) ? texture2D( tScene, uv ).rgb : vec3( 0.0 );
        // Kun det virkelig lyse på himlen tæller som en stråle.
        float lum = max( max( c.r, c.g ), c.b );
        // Kun selve solskiven må danne stråler. Sætter man tærsklen for
        // lavt, smører hele himlens lys sig ud som en hvid dis over billedet.
        acc += c * smoothstep( 2.0, 4.5, lum ) * illum;
        illum *= uDecay;
      }
      gl_FragColor = vec4( acc * uWeight, 1.0 );
    }
  `;

  const GRADE_FRAG = `
    uniform sampler2D tDiffuse;
    uniform float uExposure, uContrast, uSaturation, uVignette, uGrain, uTime, uShadowLift;
    uniform vec3 uShadowTint, uHighlightTint;
    varying vec2 vUv;

    float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

    vec3 toSRGB( vec3 c ) {
      return mix( c * 12.92, 1.055 * pow( max( c, 0.0 ), vec3( 1.0 / 2.4 ) ) - 0.055,
                  step( 0.0031308, c ) );
    }

    void main() {
      vec3 c = texture2D( tDiffuse, vUv ).rgb * uExposure;

      float l = luma( c );
      c *= mix( uShadowTint, uHighlightTint, smoothstep( 0.05, 0.65, l ) );

      c = clamp( ( c - 0.5 ) * uContrast + 0.5, 0.0, 1.0 );
      c = c * c * ( 3.0 - 2.0 * c ) * 0.22 + c * 0.78;

      // Åben tå: skyggerne løftes en anelse, så de bliver læselige og varme
      // i stedet for at klumpe sammen i sort. Højlysene røres ikke.
      float shade = 1.0 - smoothstep( 0.0, 0.38, luma( c ) );
      c += uShadowLift * shade * vec3( 1.0, 0.94, 0.86 );

      c = mix( vec3( luma( c ) ), c, uSaturation );

      vec2 q = vUv - 0.5;
      c *= 1.0 - uVignette * dot( q, q ) * 1.9;

      c = toSRGB( max( c, 0.0 ) );

      float g = fract( sin( dot( vUv * 1024.0 + uTime, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      c += ( g - 0.5 ) * uGrain;

      gl_FragColor = vec4( c, 1.0 );
    }
  `;

  const QUAD_VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `;

  function quadMaterial(frag, uniforms, derivatives) {
    return new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: frag,
      uniforms: uniforms,
      depthTest: false,
      depthWrite: false,
      extensions: { derivatives: !!derivatives }
    });
  }

  O.buildPost = function (renderer, scene, camera) {
    const quad = new THREE.FullScreenQuad(null);
    const size = new THREE.Vector2();
    renderer.getSize(size);
    let pr = renderer.getPixelRatio();
    let W = Math.max(2, Math.floor(size.x * pr));
    let H = Math.max(2, Math.floor(size.y * pr));

    const hdr = renderer.capabilities.isWebGL2;

    // Scenebufferen: HDR farve + dybde. Dybden er gratis her — den bliver
    // alligevel skrevet, mens scenen tegnes.
    const depthTexture = new THREE.DepthTexture(W, H);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;

    const sceneRT = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, encoding: THREE.LinearEncoding,
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthTexture: depthTexture, depthBuffer: true
    });

    function makeRT(scale, type) {
      return new THREE.WebGLRenderTarget(
        Math.max(2, Math.floor(W * scale)), Math.max(2, Math.floor(H * scale)),
        { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat, encoding: THREE.LinearEncoding,
          type: type || THREE.UnsignedByteType, depthBuffer: false }
      );
    }

    const AO_SCALE = 0.5;
    const aoRT = makeRT(AO_SCALE);
    const aoTmpRT = makeRT(AO_SCALE);
    const hdrRT = makeRT(1.0, hdr ? THREE.HalfFloatType : THREE.UnsignedByteType);
    const ldrRT = makeRT(1.0);

    // Prøvepunkter i en halvkugle, tættest på centrum.
    const kernel = [];
    for (let i = 0; i < 16; i++) {
      const v = new THREE.Vector3(
        Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random()
      ).normalize();
      const s = 0.25 + 0.75 * Math.pow(i / 16, 2);
      kernel.push(v.multiplyScalar(s));
    }

    const ssaoMat = quadMaterial(SSAO_FRAG, {
      tDepth: { value: depthTexture },
      uProjInv: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uResolution: { value: new THREE.Vector2(W * AO_SCALE, H * AO_SCALE) },
      uRadius: { value: 0.85 },
      uIntensity: { value: 1.35 },
      uBias: { value: 0.022 },
      uKernel: { value: kernel }
    }, true);

    const blurMat = quadMaterial(BLUR_FRAG, {
      tAO: { value: null },
      tDepth: { value: depthTexture },
      uDirection: { value: new THREE.Vector2(1, 0) },
      uTexel: { value: new THREE.Vector2(1 / (W * AO_SCALE), 1 / (H * AO_SCALE)) }
    });

    const compositeMat = quadMaterial(COMPOSITE_FRAG, {
      tScene: { value: sceneRT.texture },
      tAO: { value: aoRT.texture },
      uStrength: { value: 1.0 }
    });

    const gradeMat = quadMaterial(GRADE_FRAG, {
      tDiffuse: { value: hdrRT.texture },
      uExposure: { value: 1.0 },
      uContrast: { value: 1.04 },
      uSaturation: { value: 1.08 },
      uVignette: { value: 0.34 },
      uShadowTint: { value: new THREE.Vector3(1.04, 0.99, 0.93) },
      uHighlightTint: { value: new THREE.Vector3(1.05, 1.00, 0.94) },
      uGrain: { value: 0.016 },
      uShadowLift: { value: 0.085 },
      uTime: { value: 0 }
    });

    const godrayMat = quadMaterial(GODRAY_FRAG, {
      tScene: { value: sceneRT.texture },
      tDepth: { value: depthTexture },
      uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
      uDensity: { value: 0.75 },
      uDecay: { value: 0.94 },
      uWeight: { value: 0.075 }
    });
    const godrayRT = makeRT(0.5, hdr ? THREE.HalfFloatType : THREE.UnsignedByteType);
    const addMat = quadMaterial(`
      uniform sampler2D tBase;
      uniform sampler2D tAdd;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4( texture2D( tBase, vUv ).rgb + texture2D( tAdd, vUv ).rgb, 1.0 );
      }
    `, { tBase: { value: null }, tAdd: { value: godrayRT.texture } });
    const addRT = makeRT(1.0, hdr ? THREE.HalfFloatType : THREE.UnsignedByteType);
    const sunWorld = new THREE.Vector3();
    const sunProj = new THREE.Vector3();
    let godraysEnabled = true;

    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(W, H), 0.22, 0.7, 0.93);
    const smaa = new THREE.SMAAPass(W, H);
    smaa.renderToScreen = true;

    let ssaoEnabled = true;

    function draw(material, target) {
      quad.material = material;
      renderer.setRenderTarget(target);
      renderer.clear();
      quad.render(renderer);
    }

    function render(dt, t) {
      // 1) Scenen til HDR-buffer (dybden følger med).
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      renderer.render(scene, camera);

      // 2) Ambient occlusion ud fra dybden, sløret dybde-bevidst.
      if (ssaoEnabled) {
        ssaoMat.uniforms.uProj.value.copy(camera.projectionMatrix);
        ssaoMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
        draw(ssaoMat, aoRT);
        blurMat.uniforms.tAO.value = aoRT.texture;
        blurMat.uniforms.uDirection.value.set(1, 0);
        draw(blurMat, aoTmpRT);
        blurMat.uniforms.tAO.value = aoTmpRT.texture;
        blurMat.uniforms.uDirection.value.set(0, 1);
        draw(blurMat, aoRT);
      }

      // 3) Sammensætning: scene ganget med AO.
      compositeMat.uniforms.uStrength.value = ssaoEnabled ? 1.0 : 0.0;
      draw(compositeMat, hdrRT);

      // 3b) Solstråler — kun når solen faktisk er i billedet.
      let raysTarget = hdrRT;
      if (godraysEnabled && O.debug && O.debug.sky) {
        sunWorld.copy(O.debug.sky.sun).multiplyScalar(800).add(camera.position);
        sunProj.copy(sunWorld).project(camera);
        // Kun når solen faktisk er i billedet — ellers ville strålerne pege
        // mod et punkt uden for skærmen og lægge sig som slør over alting.
        const onScreen = sunProj.z < 1 &&
          sunProj.x > -1.0 && sunProj.x < 1.0 && sunProj.y > -1.0 && sunProj.y < 1.0;
        if (onScreen) {
          godrayMat.uniforms.uSunUv.value.set(sunProj.x * 0.5 + 0.5, sunProj.y * 0.5 + 0.5);
          draw(godrayMat, godrayRT);
          addMat.uniforms.tBase.value = hdrRT.texture;
          draw(addMat, addRT);
          raysTarget = addRT;
        }
      }

      // 4) Bloom lægges oveni (passet skriver tilbage i samme buffer).
      bloom.render(renderer, null, raysTarget, dt, false);

      // 5) Farvegradering til LDR, derefter SMAA ud på skærmen.
      gradeMat.uniforms.tDiffuse.value = raysTarget.texture;
      gradeMat.uniforms.uTime.value = t;
      draw(gradeMat, ldrRT);
      renderer.setRenderTarget(null);
      smaa.render(renderer, null, ldrRT, dt, false);
    }

    function resize() {
      renderer.getSize(size);
      pr = renderer.getPixelRatio();
      W = Math.max(2, Math.floor(size.x * pr));
      H = Math.max(2, Math.floor(size.y * pr));
      sceneRT.setSize(W, H);
      depthTexture.image.width = W;
      depthTexture.image.height = H;
      depthTexture.needsUpdate = true;
      aoRT.setSize(W * AO_SCALE, H * AO_SCALE);
      aoTmpRT.setSize(W * AO_SCALE, H * AO_SCALE);
      hdrRT.setSize(W, H);
      addRT.setSize(W, H);
      godrayRT.setSize(W * 0.5, H * 0.5);
      ldrRT.setSize(W, H);
      ssaoMat.uniforms.uResolution.value.set(W * AO_SCALE, H * AO_SCALE);
      blurMat.uniforms.uTexel.value.set(1 / (W * AO_SCALE), 1 / (H * AO_SCALE));
      bloom.setSize(W, H);
      smaa.setSize(W, H);
    }

    return {
      render: render,
      resize: resize,
      bloom: bloom,
      grade: { material: gradeMat, get enabled() { return true; } },
      ssao: { material: ssaoMat, composite: compositeMat,
              set enabled(v) { ssaoEnabled = v; }, get enabled() { return ssaoEnabled; } },
      godrays: { set enabled(v) { godraysEnabled = v; }, get enabled() { return godraysEnabled; },
                 material: godrayMat },
      setQuality: function (high) {
        ssaoEnabled = high;
        godraysEnabled = high;
        bloom.strength = high ? 0.22 : 0.14;
      }
    };
  };
})();
