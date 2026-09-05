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

    // Vandlinje: alt under overfladen bliver mørkt og begroet, lige over
    // sidder en våd, mørk stribe, og over den igen en lys salt- og kalkrand.
    // Det er dét, der får en ting til at ligge I vandet frem for PÅ det.
    waterline: function (mat, waterLevel) {
      const uniforms = { uWaterLine: { value: waterLevel } };
      chain(mat, function (shader) {
        shader.uniforms.uWaterLine = uniforms.uWaterLine;
        shader.fragmentShader =
          'uniform float uWaterLine;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             {
               float wd = uWaterLine - vFogWorld.y;
               float algae = smoothstep( -0.02, 0.38, wd );
               diffuseColor.rgb = mix( diffuseColor.rgb,
                                       diffuseColor.rgb * vec3( 0.62, 0.72, 0.52 ), algae * 0.85 );
               float tide = exp( -abs( wd + 0.05 ) * 22.0 );
               diffuseColor.rgb *= 1.0 - tide * 0.35;
               float salt = exp( -abs( wd + 0.17 ) * 38.0 );
               diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.70, 0.68, 0.62 ), salt * 0.28 );
             }`
          );
      }, 'waterline');
      return mat;
    },

    // Kaustik: sollys brudt gennem bølgerne, som det tegner sig på bunden.
    // To lag af det samme mønster, der glider hver sin vej — minimum af de
    // to giver de skarpe, vandrende lysnet, man ser på lavt vand.
    caustics: function (mat, timeUniform, waterLevel, map) {
      const uniforms = {
        uCausticTime: timeUniform,
        uWaterLevel: { value: waterLevel },
        uCausticMap: { value: map || null }
      };
      chain(mat, function (shader) {
        shader.uniforms.uCausticTime = uniforms.uCausticTime;
        shader.uniforms.uWaterLevel = uniforms.uWaterLevel;
        shader.uniforms.uCausticMap = uniforms.uCausticMap;
        shader.fragmentShader =
          'uniform float uCausticTime;\nuniform float uWaterLevel;\nuniform sampler2D uCausticMap;\n' +
          shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
             {
               float wdepth = uWaterLevel - vFogWorld.y;
               if ( wdepth > 0.0 ) {
                 vec2 cp = vFogWorld.xz * 0.16;
                 float t = uCausticTime * 0.03;
                 float c1 = texture2D( uCausticMap, cp + vec2( t, t * 0.7 ) ).r;
                 float c2 = texture2D( uCausticMap, cp * 1.37 - vec2( t * 0.8, t * 1.1 ) ).r;
                 float c = min( c1, c2 );
                 c = pow( c, 1.8 );
                 float atten = exp( -wdepth * 0.9 ) * ( 1.0 - smoothstep( 0.0, 2.2, wdepth ) );
                 totalEmissiveRadiance += vec3( 1.0, 0.94, 0.76 ) * c * atten * 1.15;
               }
             }`
          );
      }, 'caustics');
      return mat;
    },

    // Kornoverflade: et fotografisk stenbillede ganget oven på materialets
    // egen farve. Det normaliseres på sin egen middelværdi, så det tilføjer
    // struktur uden at flytte lysheden — ellers ville klippens lagdeling
    // drukne i en grå plade.
    grain: function (mat, texture, scale, strength, mean) {
      // Laget kan lægges på flere gange med hver sin skala (grov plamage
      // plus fint korn), så hvert lag får sine egne uniform-navne.
      const i = (mat.userData.grainCount = (mat.userData.grainCount || 0) + 1);
      const tN = 'tGrain' + i, sN = 'uGrainScale' + i;
      const stN = 'uGrainStrength' + i, mN = 'uGrainMean' + i;
      const uniforms = {};
      uniforms[tN] = { value: texture };
      uniforms[sN] = { value: scale };
      uniforms[stN] = { value: strength };
      uniforms[mN] = { value: new THREE.Vector3(mean[0], mean[1], mean[2]) };
      mat.userData['grain' + i] = uniforms;
      chain(mat, function (shader) {
        shader.uniforms[tN] = uniforms[tN];
        shader.uniforms[sN] = uniforms[sN];
        shader.uniforms[stN] = uniforms[stN];
        shader.uniforms[mN] = uniforms[mN];
        shader.fragmentShader =
          'uniform sampler2D ' + tN + ';\nuniform float ' + sN + ';\n' +
          'uniform float ' + stN + ';\nuniform vec3 ' + mN + ';\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             {
               // Billedet er sRGB-kodet; her læses det råt, så det skal
               // lineariseres, før det kan ganges på en lineær farve.
               vec3 grainS = texture2D( ${tN}, vUv * ${sN} ).rgb;
               vec3 grainC = pow( grainS, vec3( 2.2 ) ) / ${mN};
               diffuseColor.rgb *= mix( vec3(1.0), grainC, ${stN} );
             }`
          );
      }, 'grain' + i);
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
