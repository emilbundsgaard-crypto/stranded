/* ------------------------------------------------------------------
   Opstart og render-løkke.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  function boot() {
    const hud = O.buildHud();
    hud.initQualityButtons();
    O.diagnostics.install();
    const canvas = document.getElementById('scene');

    const Q = O.quality.settings;

    // Pixeltætheden er den dyreste enkeltknap: den koster kvadratisk på
    // ALLE buffere. Derfor både et loft pr. niveau og et samlet loft over
    // antal pixels — det er dét, der forhindrer, at hukommelsen løber tør
    // på en skærm med høj opløsning.
    const MAX_PIXELS = { kino: 7.0e6, ultra: 4.5e6, high: 3.0e6, medium: 2.2e6, low: 1.5e6 };
    function choosePixelRatio() {
      const budget = MAX_PIXELS[O.quality.runtimeName] || 2.2e6;
      const area = Math.max(1, window.innerWidth * window.innerHeight);
      return Math.min(window.devicePixelRatio, Q.pixelRatio, Math.sqrt(budget / area));
    }

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: false, powerPreference: 'high-performance',
      stencil: false
    });
    let pixelRatio = choosePixelRatio();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = Q.shadowSoft ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;   // styres manuelt i render-løkken

    // Mister vi WebGL-konteksten (typisk fordi grafikhukommelsen løb tør),
    // skal spilleren få besked i stedet for en grå skærm.
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      const box = document.getElementById('lostBox');
      if (box) {
        box.style.display = 'block';
        document.getElementById('overlay').classList.remove('hidden');
        document.getElementById('startBox').style.display = 'none';
        document.getElementById('loading').style.display = 'none';
      }
    }, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight,
                                               0.08, Q.drawDistance + 500);
    scene.add(camera);

    const timeUniform = { value: 0 };
    let tex, sky, terrain, cliffs, water, props, stones, player, audio, post, wreck;

    const steps = [
      ['Blander sand og sten…', function () { tex = O.textures.build(renderer); }],
      ['Rejser himlen…', function () { sky = O.buildSky(scene, renderer, camera); }],
      ['Former flodlejet…', function () { terrain = O.buildTerrain(scene, tex, timeUniform); }],
      ['Stabler kløftens lag…', function () { cliffs = O.buildCliffs(scene, tex); }],
      ['Fylder vand i oasen…', function () { water = O.buildWater(scene, renderer, camera, sky); }],

      ['Efterlader et vrag i vandet…', function () { wreck = O.buildWreck(scene, tex, timeUniform); }],
      ['Sår græs og tænder bål…', function () { props = O.buildProps(scene, tex, timeUniform); }],
      ['Spreder sten på bredden…', function () { stones = O.buildStones(scene, tex); }],
      ['Kobler skygger på…', function () {
        if (O.safeMode) return;
        const seen = new Set();
        scene.traverse(function (obj) {
          const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
          for (const m of mats) {
            if (!m || seen.has(m) || !m.isMeshStandardMaterial) continue;
            seen.add(m);
            // CSM.setupMaterial overskriver onBeforeCompile, så vores egne
            // indgreb hægtes på igen bagefter.
            const prev = m.onBeforeCompile;
            sky.csm.setupMaterial(m);
            const csmHook = m.onBeforeCompile;
            m.onBeforeCompile = function (shader, r) {
              csmHook.call(this, shader, r);
              if (prev) prev.call(this, shader, r);
            };
            m.needsUpdate = true;
          }
        });
      }],
      ['Blander farverne…', function () {
        if (O.safeMode) {
          // Ingen efterbehandling overhovedet: scenen går direkte på skærmen.
          post = {
            render: function () { renderer.setRenderTarget(null); renderer.render(scene, camera); },
            resize: function () {}, setQuality: function () {},
            bloom: { strength: 0 },
            ssao: { enabled: false }, godrays: { enabled: false }
          };
        } else {
          post = O.buildPost(renderer, scene, camera);
        }
      }],
      ['Varmer shaderne op…', function () {
        // Uden det her oversættes shaderne først, når man drejer og et nyt
        // materiale kommer i billedet — det giver hak de første sekunder.
        renderer.compile(scene, camera);
      }],
      ['Snører støvlerne…', function () {
        player = O.buildPlayer(camera, canvas);
        audio = O.buildAudio();
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
      let frames = 0, frameAcc = 0, reflectSkip = 0, quality = 1, degradeSteps = 0;
      let renderFailed = false;
      let bypassedPost = false, bypassedWater = false;

      function directRenderer() {
        return {
          render: function () { renderer.setRenderTarget(null); renderer.render(scene, camera); },
          resize: function () {}, setQuality: function () {},
          bloom: { strength: 0 }, ssao: { enabled: false }, godrays: { enabled: false }
        };
      }

      // Læser nogle få pixels fra det færdige billede og svarer på, hvor
      // meget de er forskellige. Nul betyder: alt har præcis samme farve.
      const probe = new Uint8Array(4);
      function imageSpread() {
        try {
          const gl = renderer.getContext();
          const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
          const pts = [[0.2, 0.25], [0.5, 0.25], [0.8, 0.25],
                       [0.2, 0.5], [0.5, 0.5], [0.8, 0.5],
                       [0.2, 0.78], [0.5, 0.78], [0.8, 0.78]];
          let lo = [255, 255, 255], hi = [0, 0, 0];
          for (const pt of pts) {
            gl.readPixels(Math.floor(pt[0] * w), Math.floor(pt[1] * h), 1, 1,
                          gl.RGBA, gl.UNSIGNED_BYTE, probe);
            for (let c = 0; c < 3; c++) {
              if (probe[c] < lo[c]) lo[c] = probe[c];
              if (probe[c] > hi[c]) hi[c] = probe[c];
            }
          }
          return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        } catch (e) {
          return -1;
        }
      }
      const hideInReflection = [player.hand, stones.highlight, props.detailGroup];

      // Startskærmen ligger oven på lærredet, så klikket fanges på
      // dokumentet — ellers ville man aldrig komme i gang.
      // Et tryk på en knap må ikke også starte spillet — ellers skifter man
      // kvalitet og går ind i kløften i samme bevægelse.
      function onButton(e) {
        return !!(e.target && e.target.closest && e.target.closest('button'));
      }

      document.addEventListener('mousedown', function (e) {
        if (onButton(e)) return;
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
      hud.initTouch(player, tryPickup);

      // På en telefon starter spillet ved den første berøring.
      document.addEventListener('touchstart', function (e) {
        if (onButton(e)) return;
        if (!player.started) { player.started = true; audio.start(); }
        hud.hideOverlay();
      }, { passive: true });

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
        sky.csm.updateFrustums();
        pixelRatio = choosePixelRatio();
        renderer.setPixelRatio(pixelRatio);
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

        // Kaskaderne følger kameraet, så det nære altid får den skarpeste
        // skyggeopløsning.
        camera.updateMatrixWorld();
        sky.csm.update();
        sky.uniforms.uTime.value = t;

        // Skyggekortene tegnes én gang pr. billede — vandets ekstra pas
        // genbruger dem.
        renderer.shadowMap.needsUpdate = true;

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

        // Fejler efterbehandlingen på en driver, jeg ikke kan afprøve, så
        // falder vi tilbage til den simple visning i stedet for at fryse.
        try {
          post.render(dt, t);
        } catch (err) {
          if (!renderFailed) {
            renderFailed = true;
            O.diagnostics.fail('efterbehandling fejlede: ' + err.message +
                               ' — skifter til simpel visning');
            post = directRenderer();
          }
        }
        O.debug.frames++;

        // Vagthund: et billede kan sagtens blive tegnet uden en eneste fejl
        // og alligevel være ensfarvet — det sker, når en driver behandler
        // noget i pipelinen anderledes end min. Er billedet fladt, går vi
        // uden om efterbehandlingen i stedet for at lade brugeren stirre på
        // en grå skærm.
        if (O.debug.frames === 5 || O.debug.frames === 40) {
          const spread = imageSpread();
          O.diagnostics.note('billedvariation ved billede ' + O.debug.frames + ': ' + spread);
          if (spread >= 0 && spread < 4) {
            if (!bypassedPost) {
              bypassedPost = true;
              O.diagnostics.fail('billedet var ensfarvet — springer efterbehandlingen over');
              post = directRenderer();
            } else if (!bypassedWater) {
              bypassedWater = true;
              O.diagnostics.fail('stadig ensfarvet — slukker også vandets ekstra pas');
              water.update = function () {};
              O.diagnostics.show(true);
            }
          }
        }

        // Automatisk nedtrapning. Den skal reagere hurtigt — det hjælper
        // ingen at opdage efter ti sekunder, at maskinen ikke kan følge med.
        frameAcc += dt; frames++;
        if (frames >= 30) {
          const avg = frameAcc / frames;
          O.debug.fps = Math.round(1 / avg);
          hud.setFps(O.debug.fps);
          if (avg > 0.033 && degradeSteps < 3) {
            degradeSteps++;
            O.quality.stepDown();
            post.setQuality(false);
            water.setQuality(false);
            pixelRatio = Math.min(pixelRatio, choosePixelRatio(), degradeSteps > 1 ? 1.0 : 1.25);
            renderer.setPixelRatio(pixelRatio);
            post.resize();
            water.resize();
            hud.setQualityNote(O.quality.runtimeName, true);
          } else if (avg < 0.014 && degradeSteps === 0) {
            post.setQuality(true);
            water.setQuality(true);
          }
          frames = 0; frameAcc = 0;
        }
      }

      // Bruges af udviklings-scriptet til at tage skærmbilleder.
      O.debug = {
        frames: 0,
        scene: scene, camera: camera, renderer: renderer, player: player,
        stones: stones, water: water, sky: sky, props: props, post: post, wreck: wreck,
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
