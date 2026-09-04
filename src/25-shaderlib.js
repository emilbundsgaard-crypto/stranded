/* ------------------------------------------------------------------
   Små indgreb i three.js' standardmateriale.

   To detaljer flytter mest: et ekstra normalkort i høj tæthed oven på
   det store (så overflader har både grov og fin struktur), og våd
   overflade, hvor sandet tæt på vandet bliver blankt.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  const patches = [];

  function chain(mat, fn, key) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (shader, renderer) {
      if (prev) prev(shader, renderer);
      fn(shader);
    };
    mat.userData.shaderKey = (mat.userData.shaderKey || '') + '|' + key;
    mat.customProgramCacheKey = function () { return mat.userData.shaderKey; };
  }

  O.shaderlib = {
    // Fin detalje-struktur oven på det almindelige normalkort.
    detailNormal: function (mat, texture, scale, strength) {
      const uniforms = {
        tDetailNormal: { value: texture },
        uDetailScale: { value: scale },
        uDetailStrength: { value: strength }
      };
      mat.userData.detail = uniforms;
      chain(mat, function (shader) {
        shader.uniforms.tDetailNormal = uniforms.tDetailNormal;
        shader.uniforms.uDetailScale = uniforms.uDetailScale;
        shader.uniforms.uDetailStrength = uniforms.uDetailStrength;
        shader.fragmentShader =
          'uniform sampler2D tDetailNormal;\nuniform float uDetailScale;\nuniform float uDetailStrength;\n' +
          shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;
             vec3 detN = texture2D( tDetailNormal, vUv * uDetailScale ).xyz * 2.0 - 1.0;
             mapN.xy = mapN.xy * normalScale + detN.xy * uDetailStrength;
             normal = perturbNormal2Arb( -vViewPosition, normal, mapN, faceDirection );`
          );
      }, 'detail');
      return mat;
    },

    // Vådhed: en vertex-attribut styrer hvor blank og mørk overfladen er.
    // Det er dét, der giver den våde bræmme langs vandkanten.
    wetness: function (mat, maxGloss) {
      chain(mat, function (shader) {
        shader.vertexShader =
          'attribute float aWet;\nvarying float vWet;\n' +
          shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\n  vWet = aWet;');
        shader.fragmentShader =
          'varying float vWet;\n' +
          shader.fragmentShader
            .replace('#include <roughnessmap_fragment>',
              `#include <roughnessmap_fragment>
               roughnessFactor = mix( roughnessFactor, ${(maxGloss || 0.5).toFixed(3)}, vWet );`)
            .replace('#include <metalnessmap_fragment>',
              `#include <metalnessmap_fragment>
               diffuseColor.rgb *= mix( 1.0, 0.80, vWet );`);
      }, 'wet');
      return mat;
    },

    // Parallax occlusion mapping: overfladen får ægte dybde. Blikket
    // marcherer ned i højdekortet (gemt i normalkortets alfakanal), så
    // sandribber og stenlag skygger for hinanden i stedet for at være en
    // flad tegning. Effekten tones ud med afstanden, hvor den ikke ses.
    parallax: function (mat, heightTexture, scale, fadeFar) {
      const uniforms = {
        uPomMap: { value: heightTexture },
        uPomScale: { value: scale },
        uPomFade: { value: fadeFar || 24.0 }
      };
      mat.userData.pom = uniforms;
      chain(mat, function (shader) {
        shader.uniforms.uPomMap = uniforms.uPomMap;
        shader.uniforms.uPomScale = uniforms.uPomScale;
        shader.uniforms.uPomFade = uniforms.uPomFade;
        shader.fragmentShader =
          'uniform sampler2D uPomMap;\nuniform float uPomScale;\nuniform float uPomFade;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `vec2 vUvPom = vUv;
             {
               vec3 eye = - vViewPosition;
               vec3 q0 = vec3( dFdx( eye.x ), dFdx( eye.y ), dFdx( eye.z ) );
               vec3 q1 = vec3( dFdy( eye.x ), dFdy( eye.y ), dFdy( eye.z ) );
               vec2 st0 = dFdx( vUv );
               vec2 st1 = dFdy( vUv );
               vec3 Np = normalize( vNormal );
               vec3 T = normalize( q0 * st1.t - q1 * st0.t );
               vec3 B = normalize( cross( Np, T ) );
               vec3 V = normalize( vViewPosition );
               vec3 vt = normalize( vec3( dot( V, T ), dot( V, B ), dot( V, Np ) ) );
               float fade = 1.0 - smoothstep( uPomFade * 0.35, uPomFade, length( vViewPosition ) );
               if ( fade > 0.02 ) {
                 const float layers = 10.0;
                 vec2 delta = ( vt.xy / max( abs( vt.z ), 0.35 ) ) * uPomScale * fade / layers;
                 float layerDepth = 1.0 / layers;
                 float curDepth = 0.0;
                 vec2 uvp = vUv;
                 float h = 1.0 - texture2D( uPomMap, uvp ).a;
                 for ( int i = 0; i < 10; i ++ ) {
                   if ( curDepth >= h ) break;
                   uvp -= delta;
                   h = 1.0 - texture2D( uPomMap, uvp ).a;
                   curDepth += layerDepth;
                 }
                 vUvPom = uvp;
               }
             }
             #define vUv vUvPom
             #include <map_fragment>`
          );
      }, 'pom');
      mat.extensions = mat.extensions || {};
      mat.extensions.derivatives = true;
      return mat;
    },

    // Kaustik: sollys brudt gennem bølgerne, som det tegner sig på bunden.
    caustics: function (mat, timeUniform, waterLevel) {
      const uniforms = {
        uCausticTime: timeUniform,
        uWaterLevel: { value: waterLevel }
      };
      chain(mat, function (shader) {
        shader.uniforms.uCausticTime = uniforms.uCausticTime;
        shader.uniforms.uWaterLevel = uniforms.uWaterLevel;
        shader.fragmentShader =
          'uniform float uCausticTime;\nuniform float uWaterLevel;\n' +
          shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
             {
               float wdepth = uWaterLevel - vFogWorld.y;
               if ( wdepth > 0.0 ) {
                 vec2 cp = vFogWorld.xz;
                 float t = uCausticTime;
                 float c = sin( cp.x * 1.7 + sin( cp.y * 1.1 + t * 0.7 ) * 2.0 + t * 0.9 )
                         + sin( cp.y * 1.9 - sin( cp.x * 1.3 - t * 0.5 ) * 2.0 + t * 1.1 );
                 c = pow( clamp( c * 0.25 + 0.5, 0.0, 1.0 ), 6.0 );
                 float atten = exp( -wdepth * 0.9 ) * ( 1.0 - smoothstep( 0.0, 2.2, wdepth ) );
                 totalEmissiveRadiance += vec3( 1.0, 0.92, 0.72 ) * c * atten * 0.55;
               }
             }`
          );
      }, 'caustics');
      return mat;
    },

    // Storskala-variation: en langsom støjtekstur der bryder gentagelsen
    // i den lille tekstur, så sandet ikke ser ud som tapet.
    macroVariation: function (mat, texture, scale, strength) {
      const uniforms = {
        tMacro: { value: texture },
        uMacroScale: { value: scale },
        uMacroStrength: { value: strength }
      };
      mat.userData.macro = uniforms;
      chain(mat, function (shader) {
        shader.uniforms.tMacro = uniforms.tMacro;
        shader.uniforms.uMacroScale = uniforms.uMacroScale;
        shader.uniforms.uMacroStrength = uniforms.uMacroStrength;
        shader.fragmentShader =
          'uniform sampler2D tMacro;\nuniform float uMacroScale;\nuniform float uMacroStrength;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             vec3 macro = texture2D( tMacro, vUv * uMacroScale ).rgb;
             diffuseColor.rgb *= mix( vec3(1.0), macro * 1.9, uMacroStrength );`
          );
      }, 'macro');
      return mat;
    }
  };
})();
