/* ------------------------------------------------------------------
   Efterlyst.

   Skyder man på gaden, kommer politiet. De bruger samme figur og samme
   rutenet som de øvrige folk, men de går ikke tur: de går efter
   spilleren, og har de fri sigtelinje og er inden for rækkevidde,
   skyder de tilbage.

   Uden dem er våbnene bare legetøj — der er ingen, der svarer igen.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  const SPEED = 4.6;
  const RANGE = 42;
  const FIRE_GAP = 0.85;
  const DAMAGE = 7;
  const ACCURACY = 0.55;      // andel af skud der rammer på kort hold

  O.buildPolice = function (scene, npcs, hooks) {
    const gltf = O.assets.model('person');
    const group = new THREE.Group();
    group.name = 'police';
    scene.add(group);

    const BASE = O.world.PLATEAU + O.config.city.kerb;
    const units = [];
    let wanted = 0;
    let cooldown = 0;

    if (!gltf || !THREE.SkeletonUtils) {
      return {
        group: group, units: units,
        get wanted() { return 0; },
        crime: function () {}, update: function () {}, hit: function () { return false; }
      };
    }

    const source = gltf.scene;
    const NAVY = O.srgb(0x2b3a55);

    function spawn() {
      const clone = THREE.SkeletonUtils.clone(source);
      clone.traverse(function (o) {
        if (o.isMesh || o.isSkinnedMesh) {
          o.castShadow = O.quality.get('grassShadows');
          o.material = o.material.clone();
          o.material.color.copy(NAVY);
          o.material.roughness = 0.8;
          o.material.metalness = 0.05;
        }
      });
      const mixer = new THREE.AnimationMixer(clone);
      const clips = {};
      for (const c of gltf.animations) clips[c.name.toLowerCase()] = mixer.clipAction(c);
      const idle = clips['idle'], run = clips['run'], walk = clips['walk'];
      if (idle) { idle.play(); idle.setEffectiveWeight(1); }
      if (run) { run.play(); run.setEffectiveWeight(0); }
      if (walk) { walk.play(); walk.setEffectiveWeight(0); }

      // De kommer fra kanten af byen, ikke ud af den blå luft foran næsen.
      const nodes = npcs.nodes;
      let best = null, bestD = -Infinity;
      const p = hooks.playerPos();
      for (let i = 0; i < 40; i++) {
        const n = nodes[(Math.random() * nodes.length) | 0];
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d > 40 && d < 110 && d > bestD) { bestD = d; best = n; }
      }
      if (!best) best = nodes[(Math.random() * nodes.length) | 0];

      const u = {
        isCop: true,
        obj: clone, mixer: mixer, idle: idle, run: run, walk: walk,
        pos: new THREE.Vector3(best.x, BASE, best.z),
        yaw: 0, speed: 0, health: 100, dead: false, deadTimer: 0,
        fire: 0.8 + Math.random() * 0.8
      };
      clone.position.copy(u.pos);
      group.add(clone);
      units.push(u);
    }

    const _from = new THREE.Vector3();
    const _to = new THREE.Vector3();

    return {
      group: group,
      units: units,
      get wanted() { return wanted; },

      // Meldes fra våbenmodulet, når spilleren rammer nogen.
      crime: function (severity) {
        wanted = Math.min(5, wanted + severity);
      },

      hit: function (u, dmg, dir) {
        if (!u || u.dead) return false;
        u.health -= dmg;
        if (u.health <= 0) {
          u.dead = true;
          u.deadTimer = 8.0;
          if (u.idle) u.idle.stop();
          if (u.run) u.run.stop();
          if (u.walk) u.walk.stop();
          u.fallDir = Math.atan2(dir ? dir.x : 0, dir ? dir.z : 1);
          wanted = Math.min(5, wanted + 1);
          return true;
        }
        return false;
      },

      update: function (dt, player) {
        // Efterlysningen løber af, hvis man holder sig i ro.
        if (wanted > 0) {
          cooldown += dt;
          if (cooldown > 22) { wanted--; cooldown = 0; }
        }

        const want = wanted === 0 ? 0 : Math.min(10, wanted * 2);
        const alive = units.filter(function (u) { return !u.dead; }).length;
        if (alive < want && Math.random() < dt * 0.9) spawn();

        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (u.dead) {
            u.deadTimer -= dt;
            const k = M.clamp(1 - (u.deadTimer - 5.5) / 2.5, 0, 1);
            u.obj.rotation.set(Math.sin(u.fallDir) * 1.55 * k, u.yaw, Math.cos(u.fallDir) * 1.55 * k);
            if (u.deadTimer <= 0) {
              group.remove(u.obj);
              units.splice(i, 1); i--;
            }
            continue;
          }

          const dx = player.pos.x - u.pos.x, dz = player.pos.z - u.pos.z;
          const dist = Math.hypot(dx, dz);
          const wantYaw = Math.atan2(dx, dz);
          let dy = wantYaw - u.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          u.yaw += dy * Math.min(1, dt * 5);

          // Går frem, indtil de er på skudhold, og bliver så stående.
          const wantSpeed = dist > 14 ? SPEED : (dist < 8 ? -1.2 : 0);
          u.speed += (wantSpeed - u.speed) * Math.min(1, dt * 3);
          if (Math.abs(u.speed) > 0.05) {
            const nx = u.pos.x + Math.sin(u.yaw) * u.speed * dt;
            const nz = u.pos.z + Math.cos(u.yaw) * u.speed * dt;
            if (!O.world.blocked(nx, nz)) { u.pos.x = nx; u.pos.z = nz; }
            else {
              // Sidefod om hjørnet i stedet for at stå og skubbe på muren.
              const sx = u.pos.x + Math.cos(u.yaw) * u.speed * dt;
              const sz = u.pos.z - Math.sin(u.yaw) * u.speed * dt;
              if (!O.world.blocked(sx, sz)) { u.pos.x = sx; u.pos.z = sz; }
            }
          }
          u.pos.y = Math.max(BASE, O.world.surface(u.pos.x, u.pos.z));
          u.obj.position.copy(u.pos);
          u.obj.rotation.set(0, u.yaw, 0);

          const runK = M.clamp(Math.abs(u.speed) / SPEED, 0, 1);
          if (u.idle) u.idle.setEffectiveWeight(1 - runK);
          if (u.run) u.run.setEffectiveWeight(runK);

          if (dist < 130) u.mixer.update(dt);

          // Skyder de? Kun med fri sigtelinje.
          u.fire -= dt;
          if (u.fire <= 0 && dist < RANGE) {
            _from.set(u.pos.x, u.pos.y + 1.55, u.pos.z);
            _to.copy(player.pos); _to.y += 1.4;
            if (O.ray.clear(_from, _to)) {
              u.fire = FIRE_GAP + Math.random() * 0.6;
              const chance = ACCURACY * (1 - M.clamp((dist - 8) / RANGE, 0, 1) * 0.7);
              if (hooks.onShot) hooks.onShot(_from);
              if (Math.random() < chance) {
                player.damage(DAMAGE);
                if (hooks.onPlayerHit) hooks.onPlayerHit();
              }
            } else {
              u.fire = 0.4;
            }
          }
        }
      }
    };
  };
})();
