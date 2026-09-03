/* ------------------------------------------------------------------
   Opstart og render-løkke.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  function boot() {
    const hud = O.buildHud();
    const canvas = document.getElementById('scene');

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    let pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.08, 1400);
    scene.add(camera);

    const timeUniform = { value: 0 };
    let tex, sky, terrain, cliffs, water, props, stones, player, audio, post;

    const steps = [
      ['Blander sand og sten…', function () { tex = O.textures.build(renderer); }],
      ['Rejser himlen…', function () { sky = O.buildSky(scene, renderer); }],
      ['Former flodlejet…', function () { terrain = O.buildTerrain(scene, tex); }],
      ['Stabler kløftens lag…', function () { cliffs = O.buildCliffs(scene, tex); }],
      ['Fylder vand i oasen…', function () { water = O.buildWater(scene, renderer, camera, sky); }],
      ['Sår græs og tænder bål…', function () { props = O.buildProps(scene, tex, timeUniform); }],
      ['Spreder sten på bredden…', function () { stones = O.buildStones(scene, tex); }],
      ['Blander farverne…', function () { post = O.buildPost(renderer, scene, camera); }],
      ['Snører støvlerne…', function () {
        player = O.buildPlayer(camera, canvas);
        audio = O.buildAudio();
        sky.light.target.position.set(player.pos.x, 0, player.pos.z);
      }]
    ];

    let stepIndex = 0;
    function runStep() {
      if (stepIndex >= steps.length) {
        hud.setLoading('Klar', 1);
        hud.ready();
        start();
        return;
      }
      const [label, fn] = steps[stepIndex];
      hud.setLoading(label, stepIndex / steps.length);
      requestAnimationFrame(function () {
        fn();
        stepIndex++;
        setTimeout(runStep, 0);
      });
    }
    runStep();

    function start() {
      const clock = new THREE.Clock();
      let t = 0;
      let stepDistance = 0;
      let frames = 0, frameAcc = 0, reflectSkip = 0, quality = 1;
      const hideInReflection = [player.hand, stones.highlight, props.detailGroup];

      // Startskærmen ligger oven på lærredet, så klikket fanges på
      // dokumentet — ellers ville man aldrig komme i gang.
      document.addEventListener('mousedown', function () {
        if (player.locked) return;
        const first = !player.started;
        player.requestLock();
        if (first) audio.start();
        hud.hideOverlay();
      });

      canvas.addEventListener('mousedown', function (e) {
        if (player.locked && e.button === 0) tryPickup();
      });

      // Klik uden pointer lock (fx i en indlejret ramme) samler også op.
      player.onClick = tryPickup;

      player.onLockChange = function (locked, was) {
        if (locked) hud.hideOverlay();
        else if (was) hud.showOverlay(true);
      };

      window.addEventListener('keydown', function (e) {
        if (!player.started) return;
        if (e.code === 'KeyE') tryPickup();
        if (e.code === 'KeyF') hud.toggle();
        if (e.code === 'KeyM') hud.setSound(audio.toggle());
      });

      function tryPickup() {
        const focus = stones.focus;
        if (!focus) return;
        const geo = focus.geometry;
        const type = stones.collect();
        if (!type) return;
        player.showPickup(type, geo);
        hud.addStone(type);
        hud.setPrompt(null);
        audio.pickup(type.tier);
      }

      window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        post.resize();
        water.resize();
      });

      function frame() {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, clock.getDelta());
        t += dt;
        timeUniform.value = t;

        player.update(dt, t);

        // Skridtlyde efter tilbagelagt afstand.
        stepDistance += player.speed * dt;
        if (stepDistance > (player.speed > 5 ? 2.1 : 1.7)) {
          stepDistance = 0;
          audio.step(player.inWater);
        }
        audio.setWaterProximity(1 - Math.min(1, Math.max(0,
          (O.world.river(player.pos.x, player.pos.z).d - O.world.river(player.pos.x, player.pos.z).w) / 22)));

        stones.updateFocus(camera);
        hud.setPrompt(stones.focus ? stones.focus.userData.type : null);
        stones.update(t);
        props.fire.update(t, dt);
        props.dust.update(t, camera.position);

        // Skyggekeglen følger spilleren, så skyggerne altid er skarpe.
        sky.light.position.set(
          player.pos.x + sky.sun.x * 180,
          sky.sun.y * 180,
          player.pos.z + sky.sun.z * 180
        );
        sky.light.target.position.set(player.pos.x, 0, player.pos.z);
        sky.light.target.updateMatrixWorld();
        sky.uniforms.uTime.value = t;

        water.uniforms.uTime.value = t;
        water.uniforms.uCamPos.value.copy(camera.position);

        // Spejlingen opdateres hver frame — eller hver anden, hvis maskinen
        // er presset. Er der slet intet vand i nærheden, springes begge de
        // ekstra pas over.
        reflectSkip++;
        const rv = O.world.river(camera.position.x, camera.position.z);
        const toWater = rv.d - rv.w;
        if (toWater < 170 && (quality === 1 || reflectSkip % 2 === 0)) {
          water.update(scene, hideInReflection, toWater < 40);
        }

        post.render(dt, t);
        O.debug.frames++;

        // Enkel automatisk kvalitetsjustering.
        frameAcc += dt; frames++;
        if (frames >= 90) {
          const avg = frameAcc / frames;
          if (avg > 0.026 && quality === 1) {
            quality = 0;
            pixelRatio = Math.min(pixelRatio, 1.25);
            renderer.setPixelRatio(pixelRatio);
            post.resize();
            post.setQuality(false);
          } else if (avg < 0.016 && quality === 0) {
            quality = 1;
            post.setQuality(true);
          }
          frames = 0; frameAcc = 0;
        }
      }

      // Bruges af udviklings-scriptet til at tage skærmbilleder.
      O.debug = {
        frames: 0,
        scene: scene, camera: camera, renderer: renderer, player: player,
        stones: stones, water: water, sky: sky, props: props, post: post,
        terrain: terrain, cliffs: cliffs, hud: hud
      };

      hud.showOverlay(false);
      frame();
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    window.addEventListener('DOMContentLoaded', boot);
  }
})();
