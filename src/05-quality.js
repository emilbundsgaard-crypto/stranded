/* ------------------------------------------------------------------
   Grafikindstillinger.

   Den tidligere udgave lagde et halvt dusin fuldopløsnings-buffere på
   grafikkortet (scene, spejling, brydning, bloom, kantudjævning …). På en
   skærm med dobbelt pixeltæthed løb hukommelsen tør, og browseren tog
   WebGL-konteksten fra os — det var den grå skærm.

   Derfor: faste niveauer med et hukommelsesbudget, et loft over
   pixeltætheden, og automatisk nedtrapning hvis billedraten falder.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  const PRESETS = {
    // Kun til skrivebordsprogrammet: her er der ingen browserfane at tage
    // hensyn til, og hele grafikkortet er til rådighed.
    kino: {
      label: 'Kino', pixelRatio: 2.0,
      shadowCascades: 4, shadowSize: 3072, shadowSoft: true,
      reflect: 1.0, refract: 0.85, ssao: 0.75, bloom: true, godrays: true, smaa: true,
      pom: true, plants: 2400, gravel: 2600, terrainSeg: 420, cliffCols: 96,
      grassShadows: true, drawDistance: 1100
    },
    ultra: {
      label: 'Ultra', pixelRatio: 2.0,
      shadowCascades: 3, shadowSize: 2048, shadowSoft: true,
      reflect: 1.0, refract: 0.7, ssao: 0.5, bloom: true, godrays: true, smaa: true,
      pom: true, plants: 1500, gravel: 1500, terrainSeg: 300, cliffCols: 64,
      grassShadows: true, drawDistance: 900
    },
    high: {
      label: 'Høj', pixelRatio: 1.5,
      shadowCascades: 3, shadowSize: 1536, shadowSoft: true,
      reflect: 0.7, refract: 0.5, ssao: 0.5, bloom: true, godrays: true, smaa: true,
      pom: true, plants: 1200, gravel: 1200, terrainSeg: 260, cliffCols: 52,
      grassShadows: true, drawDistance: 900
    },
    medium: {
      label: 'Middel', pixelRatio: 1.25,
      shadowCascades: 2, shadowSize: 1024, shadowSoft: false,
      reflect: 0.5, refract: 0.4, ssao: 0, bloom: true, godrays: false, smaa: false,
      pom: false, plants: 900, gravel: 700, terrainSeg: 220, cliffCols: 40,
      grassShadows: false, drawDistance: 800
    },
    low: {
      label: 'Lav', pixelRatio: 1.0,
      shadowCascades: 2, shadowSize: 1024, shadowSoft: false,
      reflect: 0.35, refract: 0.3, ssao: 0, bloom: false, godrays: false, smaa: false,
      pom: false, plants: 550, gravel: 400, terrainSeg: 180, cliffCols: 30,
      grassShadows: false, drawDistance: 700
    }
  };

  const ORDER = ['low', 'medium', 'high', 'ultra', 'kino'];

  // Sikker tilstand: den enkleste vej gennem hele motoren. Ingen
  // efterbehandling, ingen kaskade-skygger, ingen ekstra vandpas. Den findes
  // for at kunne svare på ét spørgsmål: virker grundmotoren på maskinen?
  const params0 = new URLSearchParams(window.location.search);
  O.safeMode = params0.has('safe') || params0.get('safe') === '1';

  function detectDefault() {
    const params = new URLSearchParams(window.location.search);
    if (O.safeMode) return 'low';
    const asked = params.get('quality') || params.get('kvalitet');
    if (asked && PRESETS[asked]) return asked;

    // Skrivebordsprogrammet (Electron) sætter dette flag og kører uden
    // browserens hukommelsesloft.
    if (window.OASIS_DESKTOP) return 'kino';

    try {
      const saved = localStorage.getItem('oasen.quality');
      if (saved && PRESETS[saved]) return saved;
    } catch (e) { /* privat browser-tilstand */ }

    // Safari er strammere med WebGL-hukommelse end Chrome; der starter vi
    // et niveau lavere, indtil andet er bevist.
    const ua = navigator.userAgent;
    const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
    return safari ? 'low' : 'medium';
  }

  const current = detectDefault();

  O.quality = {
    presets: PRESETS,
    order: ORDER,
    name: current,
    settings: Object.assign({}, PRESETS[current]),

    get: function (key) { return this.settings[key]; },

    set: function (name) {
      if (!PRESETS[name]) return;
      try { localStorage.setItem('oasen.quality', name); } catch (e) { /* ignoreres */ }
      // Flere af indstillingerne (terrænets tæthed, antal planter) afgøres når
      // verdenen bygges, så et skift genindlæser scenen. Det er ærligere end
      // at lade som om alt kan skiftes i farten.
      const url = new URL(window.location.href);
      url.searchParams.set('quality', name);
      window.location.href = url.toString();
    },

    // Trin ned uden genindlæsning: kun de ting, der kan slukkes i farten.
    stepDown: function () {
      const i = ORDER.indexOf(this.runtimeName || this.name);
      if (i <= 0) return false;
      this.runtimeName = ORDER[i - 1];
      const p = PRESETS[this.runtimeName];
      this.settings.pixelRatio = Math.min(this.settings.pixelRatio, p.pixelRatio);
      this.settings.ssao = p.ssao;
      this.settings.bloom = p.bloom;
      this.settings.godrays = p.godrays;
      this.settings.reflect = Math.min(this.settings.reflect, p.reflect);
      this.settings.refract = Math.min(this.settings.refract, p.refract);
      return true;
    }
  };
  O.quality.runtimeName = current;
})();
