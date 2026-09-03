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

    state.requestLock = function () {
      if (!state.started) state.suppressClick = true;
      state.started = true;
      if (dom.requestPointerLock && !state.lockDenied) {
        const r = dom.requestPointerLock();
        if (r && r.catch) r.catch(function () { state.lockDenied = true; });
      }
    };

    /* ---------- Hånden ---------- */
    // En simpel, lav-poly hånd der kommer ind fra nederste højre hjørne
    // med en pind i næven — samme greb som i referencen.
    const hand = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: O.srgb(0x6b4526), roughness: 0.85, metalness: 0.0 });
    const sleeve = new THREE.MeshStandardMaterial({ color: O.srgb(0x574c3a), roughness: 0.98 });
    const wood = new THREE.MeshStandardMaterial({ color: O.srgb(0x3b2b1c), roughness: 0.95 });
    const cord = new THREE.MeshStandardMaterial({ color: O.srgb(0x4b5228), roughness: 1.0 });

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.115, 0.75, 12), skin);
    forearm.position.set(0.15, -0.34, 0.22);
    forearm.rotation.set(-0.62, 0.0, 0.42);
    hand.add(forearm);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.13, 0.16, 12), sleeve);
    cuff.position.set(0.26, -0.58, 0.36);
    cuff.rotation.copy(forearm.rotation);
    hand.add(cuff);

    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), skin);
    fist.scale.set(1.0, 0.82, 1.2);
    fist.position.set(0.0, 0.0, 0.0);
    hand.add(fist);

    const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.075, 0.18), skin);
    knuckles.position.set(-0.03, 0.06, -0.02);
    knuckles.rotation.set(0.1, 0.0, 0.12);
    hand.add(knuckles);

    const thumbGeo = THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.036, 0.09, 4, 8)
      : new THREE.CylinderGeometry(0.038, 0.038, 0.15, 8);
    const thumb = new THREE.Mesh(thumbGeo, skin);
    thumb.position.set(-0.09, 0.05, -0.05);
    thumb.rotation.set(0.35, 0, 1.0);
    hand.add(thumb);

    // Fingre der lukker om pinden.
    const fingerGeo = THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.032, 0.13, 4, 8)
      : new THREE.CylinderGeometry(0.034, 0.034, 0.19, 8);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fingerGeo, skin);
      f.position.set(-0.055, 0.075 - i * 0.055, -0.055 + i * 0.012);
      f.rotation.set(0.0, 0.0, Math.PI / 2 - 0.12 - i * 0.05);
      hand.add(f);
    }

    // Pinden man går rundt med.
    const stick = new THREE.Group();
    const stickMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.86, 10), wood);
    stickMesh.position.y = 0.22;
    stick.add(stickMesh);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.1, 10), cord);
    wrap.position.y = -0.05;
    stick.add(wrap);
    stick.position.set(-0.01, 0.0, -0.02);
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

    hand.scale.setScalar(0.62);
    hand.position.set(0.40, -0.34, -0.56);
    hand.rotation.set(0.05, -0.52, 0.14);
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
      if (O.world.waterDepth(x, z) > 1.15) return true;    // for dybt at vade i
      const h = O.world.height(x, z);
      if (h - fromH > 0.85) return true;                   // for stejlt at kravle op
      if (Math.hypot(x, z * 0.62) > 165) return true;      // verdens kant
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
      state.inWater = M.clamp(depth / 1.15, 0, 1);
      speed *= 1 - state.inWater * 0.55;

      forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

      move.set(0, 0, 0);
      if (keys['KeyW'] || keys['ArrowUp']) move.add(forward);
      if (keys['KeyS'] || keys['ArrowDown']) move.sub(forward);
      if (keys['KeyD'] || keys['ArrowRight']) move.add(right);
      if (keys['KeyA'] || keys['ArrowLeft']) move.sub(right);
      const moving = move.lengthSq() > 0.0001;
      if (moving) move.normalize().multiplyScalar(speed);

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

      camera.position.set(
        state.pos.x + bobX * 0.4,
        Math.max(O.config.waterLevel + 0.35, state.pos.y + EYE - state.inWater * 0.12) + bobY,
        state.pos.z
      );
      camera.rotation.set(0, 0, 0);
      camera.rotateY(state.yaw);
      camera.rotateX(state.pitch);
      camera.rotateZ(Math.cos(state.bob) * 0.012 * state.bobAmount);

      // Hånden følger lidt efter og vipper i takt med skridtene.
      hand.position.x = 0.40 - bobX * 0.5;
      hand.position.y = -0.34 + bobY * 0.8 - state.bobAmount * 0.02;
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
