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
    renderer.toneMappingExposure = 0.80;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = Q.shadowSoft ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;

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
    const FOV = 68;
    const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight,
                                               0.06, Q.drawDistance + 700);
    scene.add(camera);

    const timeUniform = { value: 0 };
    let tex, sky, terrain, city, vehicles, water, props, player, audio, post, tracks, weapons, npcs, police, pickups;

    const steps = [
      ['Henter teksturer og modeller…', function (done) { O.assets.load(function () { done(); }); }],
      ['Blander asfalt og facader…', function () { tex = O.textures.build(renderer); }],
      ['Rejser himlen…', function () { sky = O.buildSky(scene, renderer, camera); }],
      ['Former øen…', function () { terrain = O.buildTerrain(scene, tex, timeUniform); }],
      ['Lægger gader og karreer…', function () {
        city = O.buildCity(scene, tex);
        O.world.setBlocks(city.blocks);
      }],
      ['Fylder havet op…', function () { water = O.buildWater(scene, renderer, camera, sky); }],
      ['Planter palmer…', function () { props = O.buildProps(scene, tex, timeUniform); }],
      ['Parkerer bilerne…', function () { vehicles = O.buildVehicles(scene, tex); }],
      ['Gør klar til fodspor…', function () { tracks = O.buildTracks(scene); }],
      ['Sender folk på gaden…', function () { npcs = O.buildNpcs(scene, camera); }],
      ['Sætter en patrulje ind…', function () {
        police = O.buildPolice(scene, npcs, {
          playerPos: function () { return player ? player.pos : new THREE.Vector3(); },
          onShot: function (from) { audio.gunshot('pistol'); },
          onPlayerHit: function () { hud.toast('Ramt!'); }
        });
      }],
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
      ['Snører støvlerne…', function () {
        player = O.buildPlayer(camera, canvas);
        audio = O.buildAudio();
      }],
      ['Lader magasinerne…', function () {
        weapons = O.buildWeapons(camera, scene, {
          // Både folk og betjente kan rammes; de ligger i samme liste, når
          // strålen skal afgøre, hvad den løb ind i.
          npcs: function () { return npcs.list.concat(police.units); },
          playerSpeed: function () { return player.speed || 0; },
          onNpcHit: function (p, dmg, dir) {
            const killed = p.isCop ? police.hit(p, dmg, dir) : npcs.hit(p, dmg, dir);
            hud.hit(killed);
            if (!p.isCop) police.crime(killed ? 2 : 1);
            if (killed) hud.feed('<b>' + (p.isCop ? 'Betjent' : 'Civil') + '</b> — nede');
            return killed;
          },
          onShot: function (kind) {
            audio.gunshot(kind);
            npcs.alarm(player.pos.x, player.pos.z, 55);
            police.crime(0.34);
          },
          onDryFire: function () { audio.dryFire(); },
          onReload: function () { audio.reload(); },
          onSwitch: function (name) { audio.swap(); hud.toast(name); }
        });
      }],
      ['Lægger kasser ud…', function () {
        pickups = O.buildPickups(scene, npcs, {
          onPickup: function (text) { hud.toast(text); audio.pickup(1); }
        });
      }],
      ['Varmer shaderne op…', function () {
        renderer.compile(scene, camera);
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
        if (fn.length >= 1) {
          fn(function () { stepIndex++; setTimeout(runStep, 0); });
        } else {
          fn();
          stepIndex++;
          setTimeout(runStep, 0);
        }
      });
    }
    runStep();

    function start() {
      const clock = new THREE.Clock();
      let t = 0;
      let stepDistance = 0, printDistance = 0;
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

      // Våbnet må ikke stå i spejlingen — det hænger fast på kameraet.
      const hideInReflection = [weapons.root, weapons.fxGroup];

      function onButton(e) {
        return !!(e.target && e.target.closest && e.target.closest('button'));
      }

      document.addEventListener('mousedown', function (e) {
        if (onButton(e)) return;
        if (!player.locked) {
          const first = !player.started;
          player.requestLock();
          if (first) audio.start();
          hud.hideOverlay();
          return;
        }
        if (e.button === 0) player.triggerDown = true;
        if (e.button === 2) { weapons.setAds(true); player.aiming = true; }
      });
      window.addEventListener('mouseup', function (e) {
        if (e.button === 0) player.triggerDown = false;
        if (e.button === 2) { weapons.setAds(false); player.aiming = false; }
      });
      window.addEventListener('wheel', function (e) {
        if (!player.locked) return;
        if (e.deltaY > 0) weapons.next(); else weapons.prev();
      }, { passive: true });

      hud.initTouch(player, weapons);

      document.addEventListener('touchstart', function (e) {
        if (onButton(e)) return;
        if (!player.started) { player.started = true; audio.start(); }
        hud.hideOverlay();
      }, { passive: true });

      player.onLockChange = function (locked, was) {
        if (locked) hud.hideOverlay();
        else if (was) { hud.showOverlay(true); player.triggerDown = false; }
      };

      window.addEventListener('keydown', function (e) {
        if (!player.started) return;
        if (e.code === 'KeyR') weapons.reload();
        if (e.code === 'Digit1') weapons.switchTo(0);
        if (e.code === 'Digit2') weapons.switchTo(1);
        if (e.code === 'Digit3') weapons.switchTo(2);
        if (e.code === 'KeyQ') weapons.next();
        if (e.code === 'KeyF') hud.toggle();
        if (e.code === 'KeyM') hud.setSound(audio.toggle());
      });

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

      let lastAmmo = -1, lastIdx = -1, lastRes = -1, lastHp = -1;

      function frame() {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, clock.getDelta());
        t += dt;
        timeUniform.value = t;

        // Rekylen lever i våbenmodulet, men kameraet skal bruge den.
        player.recoilPitch = weapons.state.recoilPitch;
        player.recoilYaw = weapons.state.recoilYaw;
        player.update(dt, t);

        if (player.triggerDown && player.started) {
          const sp = weapons.spec();
          if (sp.auto || !player.firedOnce) {
            if (weapons.fire(t)) player.firedOnce = true;
          }
        }
        if (!player.triggerDown) player.firedOnce = false;

        weapons.update(dt, t, player);
        npcs.update(dt, player.pos);
        police.update(dt, player);
        pickups.update(dt, t, player, weapons);
        vehicles.update(dt, player.pos);

        // Sigtekornet giver et smallere synsfelt.
        const wantFov = FOV * (1 - weapons.state.ads * (1 - weapons.spec().adsFov));
        if (Math.abs(camera.fov - wantFov) > 0.01) {
          camera.fov = wantFov;
          camera.updateProjectionMatrix();
        }

        stepDistance += player.speed * dt;
        if (stepDistance > (player.speed > 5 ? 2.1 : 1.7)) {
          stepDistance = 0;
          if (player.onGround) audio.step(player.inWater);
        }
        printDistance += player.speed * dt;
        if (printDistance > 0.85 && !player.swimming && player.onGround) {
          printDistance = 0;
          const beach = O.world.beachness(player.pos.x, player.pos.z);
          if (beach > 0.45 && O.world.cityMask(player.pos.x, player.pos.z) < 0.4) {
            tracks.step(player.pos, player.yaw, O.world.waterDepth(player.pos.x, player.pos.z));
          }
        }
        tracks.update(dt);

        const seaDist = Math.max(0, O.world.height(player.pos.x, player.pos.z));
        audio.setWaterProximity(1 - Math.min(1, seaDist / 12));

        camera.updateMatrixWorld();
        sky.csm.update();
        sky.uniforms.uTime.value = t;
        renderer.shadowMap.needsUpdate = true;

        water.uniforms.uTime.value = t;
        water.uniforms.uCamPos.value.copy(camera.position);

        // Havet spejler kun, når man er tæt nok på til at se det.
        reflectSkip++;
        const toWater = O.world.height(camera.position.x, camera.position.z);
        if (toWater < 24 && (quality === 1 || reflectSkip % 2 === 0)) {
          water.update(scene, hideInReflection, toWater < 6);
        }

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

        /* ---- HUD ---- */
        const ws = weapons.state;
        if (ws.ammo[ws.index] !== lastAmmo || ws.index !== lastIdx || ws.reserve[ws.index] !== lastRes) {
          lastAmmo = ws.ammo[ws.index]; lastIdx = ws.index; lastRes = ws.reserve[ws.index];
          hud.setWeapon(weapons.spec(), lastAmmo, lastRes, lastIdx);
        }
        if (player.health !== lastHp) { lastHp = player.health; hud.setHealth(lastHp); }
        hud.setAds(ws.ads > 0.5);
        hud.setHurt(player.hurtFlash || 0);
        hud.update(dt, player, npcs.list, vehicles.traffic);
        hud.setWanted(police.wanted);

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

      O.debug = {
        frames: 0,
        scene: scene, camera: camera, renderer: renderer, player: player,
        water: water, sky: sky, props: props, post: post, tracks: tracks,
        terrain: terrain, city: city, vehicles: vehicles, npcs: npcs, police: police, pickups: pickups,
        weapons: weapons, hud: hud
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
