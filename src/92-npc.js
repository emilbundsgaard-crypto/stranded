/* ------------------------------------------------------------------
   Folk på gaden.

   Figuren er en rigtig, riggede model med gang-, løbe- og
   stå-animationer. Den klones til hver enkelt (skelettet skal klones
   med, ellers deler alle samme kropsholdning) og får sin egen tone i
   tøjet, så det ikke er den samme mand tredive gange.

   De går på et net af punkter langs fortovene og krydser gaden ved
   krydsene. Falder der skud i nærheden, holder de op med at gå tur:
   de løber væk fra lyden i nogle sekunder og finder så tilbage i trit.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;
  const C = O.config.city;

  const WALK = 1.35;
  const RUN = 5.2;
  const PANIC_TIME = 7.0;

  O.buildNpcs = function (scene, camera) {
    const gltf = O.assets.model('person');
    const rnd = M.mulberry32(O.config.seed ^ 0x27ab);
    const group = new THREE.Group();
    group.name = 'npcs';
    scene.add(group);

    const BASE = O.world.PLATEAU + C.kerb;
    const RH = C.roadHalf, WK = C.walk;

    /* ---------- Rutenet på fortovene ---------- */
    const nodes = [];
    function node(x, z) {
      nodes.push({ x: x, z: z, links: [] });
      return nodes.length - 1;
    }
    function link(a, b) {
      if (a === b) return;
      if (nodes[a].links.indexOf(b) < 0) nodes[a].links.push(b);
      if (nodes[b].links.indexOf(a) < 0) nodes[b].links.push(a);
    }

    const av = C.avenues, st = C.streets;
    const inset = WK * 0.5;
    const rings = [];
    for (let i = 0; i < av.length - 1; i++) {
      for (let j = 0; j < st.length - 1; j++) {
        const x0 = av[i] + RH + inset, x1 = av[i + 1] - RH - inset;
        const z0 = st[j] + RH + inset, z1 = st[j + 1] - RH - inset;
        // Otte punkter rundt om karreen: fire hjørner og fire midtpunkter.
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const r = [
          node(x0, z0), node(mx, z0), node(x1, z0), node(x1, mz),
          node(x1, z1), node(mx, z1), node(x0, z1), node(x0, mz)
        ];
        for (let k = 0; k < 8; k++) link(r[k], r[(k + 1) % 8]);
        rings.push({ n: r, i: i, j: j, mx: mx, mz: mz });
      }
    }
    // Overgange: midtpunkterne på to nabokarreer bindes sammen over vejen.
    for (const a of rings) {
      for (const b of rings) {
        if (b.i === a.i + 1 && b.j === a.j) link(a.n[3], b.n[7]);
        if (b.j === a.j + 1 && b.i === a.i) link(a.n[5], b.n[1]);
      }
    }

    /* ---------- Figurerne ---------- */
    const people = [];
    const wanted = O.quality.get('npcs');
    const castShadow = O.quality.get('grassShadows');

    if (!gltf || !THREE.SkeletonUtils) {
      // Uden modellen kører byen videre — bare uden folk.
      return {
        group: group, list: people, nodes: nodes,
        update: function () {}, alarm: function () {}, hit: function () { return false; }
      };
    }

    const SHIRT = [0xb8402f, 0x2f5f8f, 0x2c2f33, 0xe0dccd, 0x3f7a4f,
                   0xd9a63c, 0x7a4a8f, 0x9aa3ab, 0x6d4326, 0x1f6f7a];

    const source = gltf.scene;
    source.updateMatrixWorld(true);

    for (let i = 0; i < wanted; i++) {
      const clone = THREE.SkeletonUtils.clone(source);
      const tint = O.srgb(SHIRT[(rnd() * SHIRT.length) | 0]);
      clone.traverse(function (o) {
        if (o.isMesh || o.isSkinnedMesh) {
          o.castShadow = castShadow;
          o.receiveShadow = false;
          o.frustumCulled = true;
          o.material = o.material.clone();
          // Modellen har én tekstur til hele figuren, så farven bliver en
          // tone over det hele. Det er nok til, at de ikke ligner kopier.
          o.material.color.copy(tint);
          o.material.roughness = 0.85;
          o.material.metalness = 0.0;
          o.material.envMapIntensity = 0.6;
        }
      });
      const scale = 0.95 + rnd() * 0.16;
      clone.scale.setScalar(scale);

      const mixer = new THREE.AnimationMixer(clone);
      const clips = {};
      for (const c of gltf.animations) clips[c.name.toLowerCase()] = mixer.clipAction(c);
      const idle = clips['idle'], walk = clips['walk'], run = clips['run'];
      if (idle) { idle.play(); idle.setEffectiveWeight(1); }
      if (walk) { walk.play(); walk.setEffectiveWeight(0); }
      if (run) { run.play(); run.setEffectiveWeight(0); }

      const start = (rnd() * nodes.length) | 0;
      const p = {
        obj: clone, mixer: mixer, idle: idle, walk: walk, run: run,
        pos: new THREE.Vector3(nodes[start].x, BASE, nodes[start].z),
        node: start,
        target: nodes[start].links.length
          ? nodes[start].links[(rnd() * nodes[start].links.length) | 0] : start,
        yaw: rnd() * 6.28,
        speed: 0,
        wantSpeed: WALK * (0.8 + rnd() * 0.5),
        health: 100,
        dead: false,
        deadTimer: 0,
        panic: 0,
        pause: rnd() * 4,
        wBase: WALK * (0.8 + rnd() * 0.5)
      };
      clone.position.copy(p.pos);
      group.add(clone);
      people.push(p);
    }

    const _v = new THREE.Vector3();
    const _flee = new THREE.Vector3();

    function retarget(p) {
      const n = nodes[p.node];
      const links = n.links;
      if (!links.length) return;
      let pick = links[(Math.random() * links.length) | 0];
      // Undgå at vende om på stedet, når der er andre muligheder.
      if (links.length > 1 && pick === p.prev) {
        pick = links[(links.indexOf(pick) + 1) % links.length];
      }
      p.prev = p.node;
      p.target = pick;
    }

    return {
      group: group,
      list: people,
      nodes: nodes,

      // Et skud i nærheden får folk til at flygte.
      alarm: function (x, z, radius) {
        for (const p of people) {
          if (p.dead) continue;
          const dx = p.pos.x - x, dz = p.pos.z - z;
          if (dx * dx + dz * dz < radius * radius) {
            p.panic = PANIC_TIME;
            p.fleeX = dx; p.fleeZ = dz;
          }
        }
      },

      // Returnerer true, hvis træfferen slog personen ihjel.
      hit: function (p, dmg, dir) {
        if (!p || p.dead) return false;
        p.health -= dmg;
        p.panic = PANIC_TIME;
        p.fleeX = dir ? dir.x : 0;
        p.fleeZ = dir ? dir.z : 1;
        if (p.health <= 0) {
          p.dead = true;
          p.deadTimer = 9.0;
          if (p.idle) p.idle.stop();
          if (p.walk) p.walk.stop();
          if (p.run) p.run.stop();
          p.fallDir = Math.atan2(dir ? dir.x : 0, dir ? dir.z : 1);
          return true;
        }
        return false;
      },

      update: function (dt, playerPos) {
        for (let i = 0; i < people.length; i++) {
          const p = people[i];
          const dx = p.pos.x - playerPos.x, dz = p.pos.z - playerPos.z;
          const far = dx * dx + dz * dz;

          if (p.dead) {
            p.deadTimer -= dt;
            // Falder om og glider ned i jorden, før pladsen genbruges.
            const t = M.clamp(1 - (p.deadTimer - 6.5) / 2.5, 0, 1);
            p.obj.rotation.set(Math.sin(p.fallDir) * 1.55 * t, p.yaw, Math.cos(p.fallDir) * 1.55 * t);
            p.obj.position.y = p.pos.y - (p.deadTimer < 2.0 ? (2.0 - p.deadTimer) * 0.5 : 0);
            if (p.deadTimer <= 0) {
              // Ny person et andet sted i byen.
              const s = (Math.random() * nodes.length) | 0;
              p.node = s; p.prev = -1;
              p.pos.set(nodes[s].x, BASE, nodes[s].z);
              p.obj.position.copy(p.pos);
              p.obj.rotation.set(0, p.yaw, 0);
              p.health = 100; p.dead = false; p.panic = 0;
              if (p.idle) { p.idle.reset().play(); }
              if (p.walk) { p.walk.reset().play(); p.walk.setEffectiveWeight(0); }
              if (p.run) { p.run.reset().play(); p.run.setEffectiveWeight(0); }
              retarget(p);
            }
            // Døde figurer skal stadig tegnes, men ikke animeres.
            continue;
          }

          if (p.panic > 0) p.panic -= dt;

          let wantYaw = p.yaw;
          let want = 0;

          if (p.panic > 0) {
            // Væk fra lyden, men stadig langs fortovet: der vælges det
            // nabopunkt, der ligger længst fra faren.
            const n = nodes[p.target];
            _v.set(n.x - p.pos.x, 0, n.z - p.pos.z);
            const d = _v.length();
            if (d < 1.2) {
              p.node = p.target;
              let best = -Infinity, bi = p.target;
              for (const l of nodes[p.node].links) {
                const s = (nodes[l].x - playerPos.x) * p.fleeX + (nodes[l].z - playerPos.z) * p.fleeZ;
                if (s > best) { best = s; bi = l; }
              }
              p.prev = p.node; p.target = bi;
            }
            want = RUN;
            wantYaw = Math.atan2(_v.x, _v.z);
          } else if (p.pause > 0) {
            p.pause -= dt;
            want = 0;
          } else {
            const n = nodes[p.target];
            _v.set(n.x - p.pos.x, 0, n.z - p.pos.z);
            const d = _v.length();
            if (d < 0.9) {
              p.node = p.target;
              retarget(p);
              if (Math.random() < 0.12) p.pause = 1.5 + Math.random() * 3.5;
            }
            want = p.wBase;
            wantYaw = Math.atan2(_v.x, _v.z);
          }

          p.speed += (want - p.speed) * Math.min(1, dt * 3.5);

          // Blødt drej mod målet.
          let dy = wantYaw - p.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          p.yaw += dy * Math.min(1, dt * 6);

          if (p.speed > 0.02) {
            const nx = p.pos.x + Math.sin(p.yaw) * p.speed * dt;
            const nz = p.pos.z + Math.cos(p.yaw) * p.speed * dt;
            if (!O.world.blocked(nx, nz)) { p.pos.x = nx; p.pos.z = nz; }
            else { retarget(p); }
          }
          p.pos.y = Math.max(BASE, O.world.height(p.pos.x, p.pos.z));

          p.obj.position.copy(p.pos);
          p.obj.rotation.set(0, p.yaw, 0);

          // Animationerne blandes efter farten, så fødderne følger med.
          const runK = M.clamp((p.speed - WALK * 1.4) / (RUN - WALK * 1.4), 0, 1);
          const walkK = M.clamp(p.speed / (WALK * 1.2), 0, 1) * (1 - runK);
          if (p.idle) p.idle.setEffectiveWeight(Math.max(0, 1 - walkK - runK));
          if (p.walk) p.walk.setEffectiveWeight(walkK);
          if (p.run) p.run.setEffectiveWeight(runK);

          // Langt væk er der ingen grund til at regne skelettet ud.
          if (far < 110 * 110) p.mixer.update(dt);
          else if ((i + (Date.now() / 100 | 0)) % 4 === 0) p.mixer.update(dt * 4);
        }
      }
    };
  };
})();
