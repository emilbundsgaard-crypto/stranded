/* ------------------------------------------------------------------
   Atmosfære.

   three.js' egen tåge er én farve ganget på med afstanden. Det ser fladt
   ud i et landskab, hvor luften mellem betragteren og klipperne rent
   faktisk lyser — kraftigst i retning mod solen. Her erstattes tågen af
   en model med retningsbestemt indspredning (aerial perspective), en
   højdeprofil (disen ligger tættest nede ved floden) og et jordnært
   varmt skær. Det er den enkeltting, der giver dybde i store landskaber.

   Chunk-erne udskiftes globalt, så ALLE materialer i scenen får den
   samme luft — ellers ville vand og terræn tone forskelligt. Et egetbygget
   ShaderMaterial med tåge skal derfor definere 'transformed' (som three's
   egne shadere gør), før det inkluderer fog_vertex.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  O.atmosphere = {
    install: function (opts) {
      const sun = opts.sunDirection.clone().normalize();

      // --- Vertex: gem både afstand og verdensposition ---
      THREE.ShaderChunk.fog_pars_vertex = `
        #ifdef USE_FOG
          varying float vFogDepth;
          varying vec3 vFogWorld;
        #endif
      `;
      THREE.ShaderChunk.fog_vertex = `
        #ifdef USE_FOG
          vFogDepth = - mvPosition.z;
          vFogWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        #endif
      `;

      // --- Fragment: retningsbestemt indspredning + højdeprofil ---
      THREE.ShaderChunk.fog_pars_fragment = `
        #ifdef USE_FOG
          uniform vec3 fogColor;
          varying float vFogDepth;
          varying vec3 vFogWorld;
          #ifdef FOG_EXP2
            uniform float fogDensity;
          #else
            uniform float fogNear;
            uniform float fogFar;
          #endif
          uniform vec3 atmoSunDirection;
          uniform vec3 atmoSunColor;
          uniform vec3 atmoGroundColor;
          uniform float atmoHeightFalloff;
          uniform float atmoInscatter;
        #endif
      `;
      THREE.ShaderChunk.fog_fragment = `
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogAmount = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogAmount = smoothstep( fogNear, fogFar, vFogDepth );
          #endif

          // Disen er tættest nede ved vandet og tynder ud opad.
          float heightMix = exp( - max( vFogWorld.y, -2.0 ) * atmoHeightFalloff );
          fogAmount *= clamp( 0.35 + 0.65 * heightMix, 0.0, 1.4 );

          vec3 viewDirW = normalize( vFogWorld - cameraPosition );
          float sunAmount = max( dot( viewDirW, atmoSunDirection ), 0.0 );

          // Luften lyser kraftigere jo tættere man kigger mod solen.
          vec3 airColor = mix( fogColor, atmoSunColor, pow( sunAmount, 5.0 ) * atmoInscatter );
          // Og får et varmt skær nede ved jorden, hvor støvet ligger.
          airColor = mix( airColor, atmoGroundColor, clamp( heightMix - 0.55, 0.0, 1.0 ) * 0.5 );

          gl_FragColor.rgb = mix( gl_FragColor.rgb, airColor, clamp( fogAmount, 0.0, 1.0 ) );
        #endif
      `;

      // Uniformerne skal ligge i alle materialer, der bruger tåge.
      const extra = {
        atmoSunDirection: { value: sun },
        atmoSunColor: { value: O.srgb(opts.sunColor || 0xffd9a0) },
        atmoGroundColor: { value: O.srgb(opts.groundColor || 0xd9b98c) },
        atmoHeightFalloff: { value: opts.heightFalloff !== undefined ? opts.heightFalloff : 0.028 },
        atmoInscatter: { value: opts.inscatter !== undefined ? opts.inscatter : 0.85 }
      };
      for (const k in extra) THREE.UniformsLib.fog[k] = extra[k];
      for (const name in THREE.ShaderLib) {
        const u = THREE.ShaderLib[name].uniforms;
        if (u && u.fogColor) for (const k in extra) u[k] = extra[k];
      }

      return extra;
    }
  };
})();
