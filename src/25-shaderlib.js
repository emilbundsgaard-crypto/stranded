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
