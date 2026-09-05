/* ------------------------------------------------------------------
   Oasis — kerne: matematik, støj og deterministisk tilfældighed.
   Alt i spillet bygges ud fra de her funktioner, så verdenen ser
   ens ud hver gang den åbnes (samme seed = samme kløft).
   ------------------------------------------------------------------ */
(function () {
  const O = (window.OASIS = window.OASIS || {});

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const smootherstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };

  // Lille, hurtig pseudo-tilfældig generator (deterministisk pr. seed).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Hash-baseret gradient/value-støj. Ingen tabeller, ingen afhængigheder.
  function hash2(x, y) {
    let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return h - Math.floor(h);
  }

  function valueNoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1; // [-1, 1]
  }

  function fbm(x, y, octaves, lacunarity, gain) {
    octaves = octaves || 4;
    lacunarity = lacunarity || 2.0;
    gain = gain || 0.5;
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * valueNoise(x * freq + i * 17.13, y * freq - i * 9.71);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  // Ridged støj giver de skarpe kanter i klippeformationerne.
  function ridged(x, y, octaves) {
    octaves = octaves || 3;
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(valueNoise(x * freq + i * 31.7, y * freq + i * 5.3));
      sum += amp * n * n;
      norm += amp;
      amp *= 0.55;
      freq *= 2.1;
    }
    return sum / norm;
  }

  O.math = { clamp, lerp, smoothstep, smootherstep, mulberry32, hash2, valueNoise, fbm, ridged };

  // Farver skrevet som hex er sRGB. Renderen arbejder lineært og
  // gamma-koder til sidst, så de skal konverteres — ellers bliver alt
  // udvasket og lyst.
  O.srgb = function (hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  };

  // Global konfiguration som alle moduler læser fra.
  O.config = {
    seed: 20260903,
    waterLevel: 0.0,
    worldSize: 340,      // terrænets kant-til-kant størrelse
    playRadius: 108,     // hvor langt spilleren kan gå ud
    fogColor: 0xcfd8e4,
    // Solen står højt og lidt bag højre skulder set fra startstedet, så
    // sandbredden er solbeskinnet og klippernes skygger falder væk fra
    // betragteren. Lav sol så kløften kastede skygge over hele bredden.
    sunDirection: { x: 0.36, y: 0.80, z: -0.48 },

    // Albedo-rettelse for de fotografiske teksturer.
    //
    // Et foto af sand er ikke sandets albedo — solen sad allerede i
    // billedet, da det blev taget. Bruger man det råt som diffus farve,
    // bliver sandet dobbelt så lyst som virkeligheden og alt for mættet:
    // sandets blå kanal er lav i et foto, så det brænder ud i et neongult
    // felt, så snart fladen vender mod solen. Tallene her ganges på
    // teksturen og trækker den ned mod en rigtig albedo — omtrent 0,36 for
    // tørt sand og 0,30 for sten — og løfter samtidig den blå kanal, så
    // farven bliver sand og ikke karry.
    albedo: {
      sand: { r: 0.72, g: 0.97, b: 1.80 },
      rock: { r: 0.45, g: 0.57, b: 1.15 }
    }
  };
})();
