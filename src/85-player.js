/* ------------------------------------------------------------------
   Spilleren: musestyret kig, WASD, terrænfølge, vadning i vandet,
   hovedbevægelse under gang og en hånd i billedets bund.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  const EYE = 1.68;
  const WALK = 3.5;
  const RUN = 6.4;
  const SWIM = 1.9;
  const SWIM_DEPTH = 1.25;   // dybere end det, og man svømmer i stedet for at vade

  O.buildPlayer = function (camera, dom) {
    const state = {
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      bob: 0,
      bobAmount: 0,
      locked: false,
      inWater: 0,
      sensitivity: 0.0022
    };

    function insideCollider(x, z, margin) {
      for (const c of O.world.colliders) {
        const dx = x - c.x, dz = z - c.z;
        const r = c.r + (margin || 0);
        if (dx * dx + dz * dz < r * r) return c;
      }
      return null;
    }

    // Startsted: nede på sandbredden i den sydlige ende, med udsigt
    // op ad floden mod oasen — samme udsyn som referencebilledet.
    (function spawn() {
      const target = { x: 0, z: 24 };   // punktet man kigger mod: det brede vandspejl
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < 6000; i++) {
        const z = -80 + (i % 50);
        const x = -60 + Math.floor(i / 50) * 1.0;
        const h = O.world.height(x, z);
        if (h < 0.25 || h > 0.85) continue;
        if (insideCollider(x, z, 2.5)) continue;
        const r = O.world.river(x, z);
        const score = -Math.abs(r.d - r.w - 3.5) - Math.abs(h - 0.45) * 4;
        if (score > bestScore) { bestScore = score; best = { x: x, z: z, h: h }; }
      }
      if (!best) best = { x: 18, z: -70, h: O.world.height(18, -70) };
      state.pos.set(best.x, best.h, best.z);
      state.yaw = Math.atan2(-(target.x - best.x), -(target.z - best.z));
      state.pitch = -0.03;
    })();

    const keys = {};
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // Musen: pointer lock når browseren tillader det, ellers "træk for at
    // kigge". Så virker det også i en indlejret ramme.
    let dragging = false, dragDist = 0;

    function look(dx, dy, gain) {
      state.yaw -= dx * state.sensitivity * gain;
      state.pitch -= dy * state.sensitivity * gain;
      state.pitch = M.clamp(state.pitch, -1.45, 1.35);
    }

    document.addEventListener('mousemove', function (e) {
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (state.locked) look(mx, my, 1);
      else if (dragging) { dragDist += Math.abs(mx) + Math.abs(my); look(mx, my, 1.25); }
    });

    dom.addEventListener('mousedown', function () {
      if (!state.locked) { dragging = true; dragDist = 0; }
    });
    window.addEventListener('mouseup', function () {
      // Et rent klik (uden at trække) tæller som "saml op" — men ikke det
      // allerførste klik, der bare starter spillet.
      if (dragging && dragDist < 6 && state.started && !state.suppressClick && state.onClick) state.onClick();
      state.suppressClick = false;
      dragging = false;
    });

    document.addEventListener('pointerlockchange', function () {
      const was = state.locked;
      state.locked = document.pointerLockElement === dom;
      if (state.locked) state.everLocked = true;
      if (state.onLockChange) state.onLockChange(state.locked, was);
    });
    document.addEventListener('pointerlockerror', function () {
      state.lockDenied = true;   // så falder vi tilbage til træk-styring
    });

    /* ---------- Berøring: venstre halvdel styrer, højre halvdel kigger ----
       Uden det her kan man hverken gå eller dreje på en telefon — der er
       hverken tastatur eller musemarkør at låse. --------------------------- */
    const touch = { moveId: null, x0: 0, y0: 0, dx: 0, dy: 0, lookId: null, lx: 0, ly: 0 };
    state.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    function touchStart(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth * 0.5 && touch.moveId === null) {
          touch.moveId = t.identifier;
          touch.x0 = t.clientX; touch.y0 = t.clientY;
          touch.dx = 0; touch.dy = 0;
          if (state.onStick) state.onStick(true, t.clientX, t.clientY, 0, 0);
        } else if (touch.lookId === null) {
          touch.lookId = t.identifier;
          touch.lx = t.clientX; touch.ly = t.clientY;
        }
      }
      state.started = true;
      if (e.cancelable) e.preventDefault();
    }

    function touchMove(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touch.moveId) {
          touch.dx = t.clientX - touch.x0;
          touch.dy = t.clientY - touch.y0;
          const len = Math.hypot(touch.dx, touch.dy);
          const max = 64;
          if (len > max) { touch.dx *= max / len; touch.dy *= max / len; }
          if (state.onStick) state.onStick(true, touch.x0, touch.y0, touch.dx, touch.dy);
        } else if (t.identifier === touch.lookId) {
          look(t.clientX - touch.lx, t.clientY - touch.ly, 1.7);
          touch.lx = t.clientX; touch.ly = t.clientY;
        }
      }
      if (e.cancelable) e.preventDefault();
    }

    function touchEnd(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touch.moveId) {
          touch.moveId = null; touch.dx = 0; touch.dy = 0;
          if (state.onStick) state.onStick(false);
        } else if (t.identifier === touch.lookId) {
          touch.lookId = null;
        }
      }
    }

    dom.addEventListener('touchstart', touchStart, { passive: false });
    dom.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd);
    window.addEventListener('touchcancel', touchEnd);
    state.touch = touch;

    state.requestLock = function () {
      if (!state.started) state.suppressClick = true;
      state.started = true;
      if (dom.requestPointerLock && !state.lockDenied) {
        const r = dom.requestPointerLock();
        if (r && r.catch) r.catch(function () { state.lockDenied = true; });
      }
    };

    /* ---------- Hånden ---------- */
    // Bygget af primitiver, men med rigtige led: håndryg, knoer, fire fingre
    // med to led hver, og en tommel der lukker om pinden. Silhuetten er det,
    // øjet læser — derfor er fingrene bøjet omkring træet og ikke bare
    // stænger ved siden af.
    const hand = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      color: O.srgb(0x6f4527), roughness: 0.72, metalness: 0.0, envMapIntensity: 0.4
    });
    const sleeve = new THREE.MeshStandardMaterial({ color: O.srgb(0x574c3a), roughness: 0.98 });
    const wood = new THREE.MeshStandardMaterial({ color: O.srgb(0x4a3524), roughness: 0.88, envMapIntensity: 0.3 });
    const cord = new THREE.MeshStandardMaterial({ color: O.srgb(0x4b5228), roughness: 1.0 });

    function capsule(r, len, seg) {
      return THREE.CapsuleGeometry
        ? new THREE.CapsuleGeometry(r, len, 4, seg || 10)
        : new THREE.CylinderGeometry(r, r, len + r * 2, seg || 10);
    }

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.100, 0.82, 16), skin);
    forearm.position.set(0.16, -0.36, 0.24);
    forearm.rotation.set(-0.60, 0.0, 0.44);
    hand.add(forearm);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.126, 0.15, 16), sleeve);
    cuff.position.set(0.27, -0.60, 0.38);
    cuff.rotation.copy(forearm.rotation);
    hand.add(cuff);

    // Håndryggen: en flad, afrundet kasse i stedet for en kugle.
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.115, 0.20, 2, 2, 2), skin);
    palm.position.set(0.0, -0.01, 0.02);
    palm.rotation.set(0.12, 0.0, 0.10);
    hand.add(palm);

    const palmEdge = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), skin);
    palmEdge.scale.set(1.0, 0.85, 1.5);
    palmEdge.position.set(0.075, -0.03, 0.01);
    hand.add(palmEdge);

    // Fire fingre, hver med to led, bøjet omkring pinden.
    const proxGeo = capsule(0.027, 0.075);
    const distGeo = capsule(0.024, 0.055);
    for (let i = 0; i < 4; i++) {
      const z = -0.075 + i * 0.05;
      const scale = 1.0 - Math.abs(i - 1.2) * 0.07;

      const prox = new THREE.Mesh(proxGeo, skin);
      prox.position.set(-0.055, 0.028, z);
      prox.rotation.set(0.0, 0.0, Math.PI / 2 - 0.25);
      prox.scale.setScalar(scale);
      hand.add(prox);

      const dist = new THREE.Mesh(distGeo, skin);
      dist.position.set(-0.105, -0.028, z);
      dist.rotation.set(0.0, 0.0, 0.35);
      dist.scale.setScalar(scale);
      hand.add(dist);
    }

    const thumb = new THREE.Mesh(capsule(0.030, 0.085), skin);
    thumb.position.set(-0.035, 0.055, -0.10);
    thumb.rotation.set(0.9, 0.0, 0.75);
    hand.add(thumb);

    // Pinden med en snoet læderomvikling.
    const stick = new THREE.Group();
    const stickMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.060, 0.90, 14), wood);
    stickMesh.position.y = 0.24;
    stick.add(stickMesh);
    for (let i = 0; i < 4; i++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.011, 6, 14), cord);
      wrap.position.y = -0.06 + i * 0.035;
      wrap.rotation.set(Math.PI / 2, 0, i * 0.4);
      stick.add(wrap);
    }
    stick.position.set(-0.02, 0.0, -0.01);
    stick.rotation.set(0.2, 0, -0.16);
    hand.add(stick);

    // Den opsamlede sten vises kort i hånden.
    const heldStone = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: O.srgb(0x888888), roughness: 0.8 })
    );
    heldStone.visible = false;
    heldStone.position.set(-0.02, 0.13, -0.07);
    hand.add(heldStone);

    hand.scale.setScalar(0.54);
    hand.position.set(0.42, -0.33, -0.54);
    hand.rotation.set(0.05, -0.52, 0.14);
    hand.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    camera.add(hand);

    let holdTimer = 0;

    state.showPickup = function (type, geometry) {
      heldStone.geometry = geometry || heldStone.geometry;
      heldStone.material.color.copy(type.mat.color);
      if (type.mat.emissive) heldStone.material.emissive.copy(type.mat.emissive);
      else heldStone.material.emissive.setRGB(0, 0, 0);
      heldStone.material.emissiveIntensity = (type.mat.emissiveIntensity || 0) * 0.5;
      heldStone.material.roughness = type.mat.roughness;
      heldStone.material.metalness = type.mat.metalness || 0;
      heldStone.scale.setScalar(0.055);
      heldStone.visible = true;
      stick.visible = false;
      holdTimer = 1.7;
    };

    /* ---------- Bevægelse ---------- */
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const move = new THREE.Vector3();

    function blocked(x, z, fromH) {
      for (const c of O.world.colliders) {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz < c.r * c.r) return true;
      }
      // Vandet spærrer ikke længere: bliver det for dybt, svømmer man over.
      // Det er dét, der gør det muligt at komme hele vejen rundt om oasen.
      const h = O.world.height(x, z);
      if (!state.swimming && h - fromH > 0.85) return true;   // for stejlt at kravle op
      if (Math.hypot(x, z * 0.62) > 170) return true;         // verdens kant
      return false;
    }

    state.update = function (dt, t) {
      // Skulle man endelig ende inde i en klippe, så skub blødt ud igen.
      const stuck = insideCollider(state.pos.x, state.pos.z, 0);
      if (stuck) {
        const dx = state.pos.x - stuck.x, dz = state.pos.z - stuck.z;
        const d = Math.hypot(dx, dz) || 0.001;
        state.pos.x = stuck.x + (dx / d) * (stuck.r + 0.08);
        state.pos.z = stuck.z + (dz / d) * (stuck.r + 0.08);
      }

      const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
      let speed = sprint ? RUN : WALK;

      const depth = O.world.waterDepth(state.pos.x, state.pos.z);
      state.swimming = depth > SWIM_DEPTH;
      state.inWater = M.clamp(depth / SWIM_DEPTH, 0, 1);
      speed = state.swimming ? (sprint ? SWIM * 1.25 : SWIM)
                             : speed * (1 - state.inWater * 0.5);

      forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

      move.set(0, 0, 0);
      if (keys['KeyW'] || keys['ArrowUp']) move.add(forward);
      if (keys['KeyS'] || keys['ArrowDown']) move.sub(forward);
      if (keys['KeyD'] || keys['ArrowRight']) move.add(right);
      if (keys['KeyA'] || keys['ArrowLeft']) move.sub(right);

      // Styrepinden: hvor langt fingeren er trukket bestemmer farten, så man
      // kan liste og løbe med samme tommel.
      let stickPush = 0;
      if (touch.moveId !== null) {
        const sx = M.clamp(touch.dx / 64, -1, 1);
        const sy = M.clamp(touch.dy / 64, -1, 1);
        stickPush = Math.min(1, Math.hypot(sx, sy));
        if (stickPush > 0.08) {
          move.add(forward.clone().multiplyScalar(-sy));
          move.add(right.clone().multiplyScalar(sx));
        }
      }

      const moving = move.lengthSq() > 0.0001;
      if (moving) {
        move.normalize();
        const push = stickPush > 0.08
          ? M.lerp(WALK * 0.45, sprint ? RUN : RUN * 0.92, M.smoothstep(0.25, 0.98, stickPush))
          : speed;
        move.multiplyScalar(touch.moveId !== null ? Math.min(push, RUN) : speed);
      }

      // Blødt op og ned i fart, så det ikke føles klodset.
      state.vel.lerp(move, 1 - Math.pow(0.0009, dt));

      const curH = O.world.height(state.pos.x, state.pos.z);
      let nx = state.pos.x + state.vel.x * dt;
      let nz = state.pos.z + state.vel.z * dt;
      if (!blocked(nx, state.pos.z, curH)) state.pos.x = nx; else state.vel.x *= 0.2;
      if (!blocked(state.pos.x, nz, curH)) state.pos.z = nz; else state.vel.z *= 0.2;

      const groundY = O.world.height(state.pos.x, state.pos.z);
      state.pos.y += (groundY - state.pos.y) * (1 - Math.pow(0.0001, dt));

      // Hovedbevægelse under gang.
      const spd = Math.hypot(state.vel.x, state.vel.z);
      state.bob += dt * spd * (sprint ? 2.0 : 2.4);
      state.bobAmount = M.lerp(state.bobAmount, M.clamp(spd / RUN, 0, 1), 1 - Math.pow(0.002, dt));
      const bobY = Math.sin(state.bob * 2.0) * 0.055 * state.bobAmount;
      const bobX = Math.cos(state.bob) * 0.045 * state.bobAmount;

      // Svømmende ligger hovedet lige over overfladen og vugger med bølgen.
      let eyeY;
      if (state.swimming) {
        const swell = Math.sin(t * 0.9) * 0.045 + Math.sin(t * 1.7 + 1.3) * 0.025;
        eyeY = O.config.waterLevel + 0.30 + swell;
      } else {
        eyeY = Math.max(O.config.waterLevel + 0.32,
                        state.pos.y + EYE - state.inWater * 0.12) + bobY;
      }
      camera.position.set(state.pos.x + bobX * 0.4, eyeY, state.pos.z);
      camera.rotation.set(0, 0, 0);
      camera.rotateY(state.yaw);
      camera.rotateX(state.pitch);
      camera.rotateZ(Math.cos(state.bob) * 0.012 * state.bobAmount);

      // Hånden følger lidt efter og vipper i takt med skridtene.
      hand.position.x = 0.42 - bobX * 0.5;
      hand.position.y = -0.33 + bobY * 0.8 - state.bobAmount * 0.02;
      hand.visible = !state.swimming;
      hand.rotation.z = 0.06 + Math.sin(state.bob * 2.0) * 0.05 * state.bobAmount;
      hand.rotation.x = Math.sin(state.bob) * 0.04 * state.bobAmount - state.pitch * 0.12;

      if (holdTimer > 0) {
        holdTimer -= dt;
        const k = M.clamp(holdTimer / 1.7, 0, 1);
        heldStone.rotation.y += dt * 2.0;
        heldStone.position.y = 0.13 + (1 - k) * 0.02;
        if (holdTimer <= 0) {
          heldStone.visible = false;
          stick.visible = true;
        }
      }

      state.speed = spd;
      state.moving = moving;
      return state;
    };

    state.hand = hand;
    return state;
  };
})();
