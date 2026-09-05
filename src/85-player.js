/* ------------------------------------------------------------------
   Spilleren: kig, gang, løb, spring, hug, svømning og helbred.

   Kroppen er en simpel søjle med tyngdekraft. Kollisionen prøves i x og
   z hver for sig — det er dét, der gør, at man glider langs en husmur i
   stedet for at sætte sig fast i den. Kan trinnet foran træde op på en
   kantsten eller et fortov, gør man det uden at skulle hoppe.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  const EYE = 1.66;
  const EYE_CROUCH = 1.05;
  const WALK = 3.9;
  const RUN = 7.4;
  const CROUCH = 1.9;
  const SWIM = 2.2;
  const SWIM_DEPTH = 1.25;
  const GRAVITY = 22.0;
  const JUMP = 6.3;
  const STEP_UP = 0.55;      // hvor højt et trin man kan gå op ad

  O.buildPlayer = function (camera, dom) {
    const state = {
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(),
      vy: 0,
      onGround: true,
      yaw: 0,
      pitch: 0,
      bob: 0,
      bobAmount: 0,
      locked: false,
      inWater: 0,
      crouch: 0,
      health: 100,
      sensitivity: 0.0022
    };

    /* ---------- Startsted: på fortovet i bykernen ---------- */
    (function spawn() {
      // Midt på alléen med huse i begge sider. Fortovet er kun et par meter
      // bredt, og står man dér, fylder muren det halve billede.
      const C = O.config.city;
      const x = C.avenues[1];
      const z = (C.streets[1] + C.streets[2]) / 2;
      state.pos.set(x, O.world.surface(x, z), z);
      state.yaw = 0;          // ser ned ad gaden mod nord
      state.pitch = -0.02;
    })();

    const keys = {};
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', function () {
      for (const k in keys) keys[k] = false;
    });

    /* ---------- Musen ---------- */
    let dragging = false, dragDist = 0;

    function look(dx, dy, gain) {
      state.yaw -= dx * state.sensitivity * gain;
      state.pitch -= dy * state.sensitivity * gain;
      state.pitch = M.clamp(state.pitch, -1.45, 1.35);
    }
    state.look = look;

    document.addEventListener('mousemove', function (e) {
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (state.locked) look(mx, my, 1);
      else if (dragging) { dragDist += Math.abs(mx) + Math.abs(my); look(mx, my, 1.25); }
    });

    dom.addEventListener('mousedown', function () {
      if (!state.locked) { dragging = true; dragDist = 0; }
    });
    window.addEventListener('mouseup', function () {
      dragging = false;
    });
    window.addEventListener('contextmenu', function (e) {
      if (state.started) e.preventDefault();
    });

    document.addEventListener('pointerlockchange', function () {
      const was = state.locked;
      state.locked = document.pointerLockElement === dom;
      if (state.locked) state.everLocked = true;
      if (state.onLockChange) state.onLockChange(state.locked, was);
    });
    document.addEventListener('pointerlockerror', function () {
      state.lockDenied = true;
    });

    /* ---------- Berøring ----------
       Venstre halvdel styrer, højre halvdel kigger. Knapperne til at
       skyde og skifte våben ligger i HUD'en og melder ind her. */
    const touch = { moveId: null, x0: 0, y0: 0, dx: 0, dy: 0, lookId: null, lx: 0, ly: 0 };
    state.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    function touchStart(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth * 0.42 && touch.moveId === null) {
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
      state.started = true;
      if (dom.requestPointerLock && !state.lockDenied) {
        const r = dom.requestPointerLock();
        if (r && r.catch) r.catch(function () { state.lockDenied = true; });
      }
    };

    /* ---------- Bevægelse ---------- */
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const move = new THREE.Vector3();
    const probe = { x: 0, z: 0 };

    // Kan man stå her? Man kan gå op ad et lavt trin, men ikke op ad en mur.
    function canStand(x, z, fromY) {
      if (O.world.blocked(x, z)) return false;
      if (Math.hypot(x, z) > O.config.playRadius) return false;
      if (state.swimming) return true;
      const h = O.world.surface(x, z);
      if (h - fromY > STEP_UP) return false;
      return true;
    }

    state.damage = function (n) {
      state.health = Math.max(0, state.health - n);
      state.hurtFlash = 1;
    };
    state.heal = function (n) { state.health = Math.min(100, state.health + n); };

    state.update = function (dt, t) {
      probe.x = state.pos.x; probe.z = state.pos.z;
      if (O.world.pushOut(probe)) { state.pos.x = probe.x; state.pos.z = probe.z; }

      const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
      const wantCrouch = keys['ControlLeft'] || keys['KeyC'];
      state.crouch += ((wantCrouch ? 1 : 0) - state.crouch) * Math.min(1, dt * 12);

      const depth = O.world.waterDepth(state.pos.x, state.pos.z);
      state.swimming = depth > SWIM_DEPTH;
      state.inWater = M.clamp(depth / SWIM_DEPTH, 0, 1);

      let speed = sprint ? RUN : WALK;
      speed = M.lerp(speed, CROUCH, state.crouch);
      if (state.swimming) speed = sprint ? SWIM * 1.3 : SWIM;
      else speed *= (1 - state.inWater * 0.45);
      if (state.aiming) speed *= 0.55;

      forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

      move.set(0, 0, 0);
      if (keys['KeyW'] || keys['ArrowUp']) move.add(forward);
      if (keys['KeyS'] || keys['ArrowDown']) move.sub(forward);
      if (keys['KeyD'] || keys['ArrowRight']) move.add(right);
      if (keys['KeyA'] || keys['ArrowLeft']) move.sub(right);

      let stickPush = 0;
      if (touch.moveId !== null) {
        const sx = M.clamp(touch.dx / 64, -1, 1);
        const sy = M.clamp(touch.dy / 64, -1, 1);
        stickPush = Math.min(1, Math.hypot(sx, sy));
        if (stickPush > 0.08) {
          move.addScaledVector(forward, -sy);
          move.addScaledVector(right, sx);
        }
      }

      const moving = move.lengthSq() > 0.0001;
      if (moving) {
        move.normalize();
        const push = stickPush > 0.08
          ? M.lerp(WALK * 0.4, RUN, M.smoothstep(0.25, 0.98, stickPush))
          : speed;
        move.multiplyScalar(touch.moveId !== null ? Math.min(push, RUN) : speed);
      }

      state.vel.lerp(move, 1 - Math.pow(state.onGround ? 0.0009 : 0.15, dt));

      const curY = state.pos.y;
      const nx = state.pos.x + state.vel.x * dt;
      const nz = state.pos.z + state.vel.z * dt;
      if (canStand(nx, state.pos.z, curY)) state.pos.x = nx; else state.vel.x *= 0.15;
      if (canStand(state.pos.x, nz, curY)) state.pos.z = nz; else state.vel.z *= 0.15;

      /* ---- lodret ---- */
      const ground = O.world.surface(state.pos.x, state.pos.z);
      if (state.swimming) {
        state.vy = 0;
        state.onGround = false;
        state.pos.y = O.config.waterLevel - 0.25;
        if (keys['Space']) state.pos.y += 0.1;
      } else {
        if ((keys['Space'] || state.wantJump) && state.onGround) {
          state.vy = JUMP;
          state.onGround = false;
        }
        state.wantJump = false;
        state.vy -= GRAVITY * dt;
        state.pos.y += state.vy * dt;
        if (state.pos.y <= ground) {
          // Op ad et lavt trin sker uden fald: ellers hakker man op ad
          // hver eneste kantsten.
          state.pos.y = ground;
          state.vy = 0;
          state.onGround = true;
        } else if (state.pos.y - ground < 0.02) {
          state.onGround = true;
        }
      }

      /* ---- kamera ---- */
      const spd = Math.hypot(state.vel.x, state.vel.z);
      state.bob += dt * spd * (sprint ? 2.0 : 2.4);
      state.bobAmount = M.lerp(state.bobAmount, M.clamp(spd / RUN, 0, 1) * (state.onGround ? 1 : 0.2),
                               1 - Math.pow(0.002, dt));
      const bobY = Math.sin(state.bob * 2.0) * 0.052 * state.bobAmount;
      const bobX = Math.cos(state.bob) * 0.042 * state.bobAmount;

      let eyeY;
      if (state.swimming) {
        const swell = Math.sin(t * 0.9) * 0.045 + Math.sin(t * 1.7 + 1.3) * 0.025;
        eyeY = O.config.waterLevel + 0.28 + swell;
      } else {
        eyeY = state.pos.y + M.lerp(EYE, EYE_CROUCH, state.crouch) + bobY;
      }

      camera.position.set(state.pos.x + bobX * 0.35, eyeY, state.pos.z);
      camera.rotation.set(0, 0, 0);
      camera.rotateY(state.yaw + (state.recoilYaw || 0));
      camera.rotateX(state.pitch + (state.recoilPitch || 0));
      camera.rotateZ(Math.cos(state.bob) * 0.010 * state.bobAmount);

      if (state.hurtFlash > 0) state.hurtFlash = Math.max(0, state.hurtFlash - dt * 1.6);

      state.speed = spd;
      state.moving = moving;
      return state;
    };

    return state;
  };
})();
