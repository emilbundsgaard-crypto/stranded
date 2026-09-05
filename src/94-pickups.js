/* ------------------------------------------------------------------
   Ting man kan samle op: ammunition og forbinding.

   De ligger på fortovene i byen, svæver og drejer, så man kan se dem på
   afstand, og samles op ved at gå ind i dem. Uden dem løber magasinerne
   tør, og så er der ikke mere spil tilbage.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;
  const BGU = THREE.BufferGeometryUtils;

  const RESPAWN = 26.0;
  const REACH = 1.5;

  O.buildPickups = function (scene, npcs, hooks) {
    const rnd = M.mulberry32(O.config.seed ^ 0x4d1c);
    const group = new THREE.Group();
    group.name = 'pickups';
    scene.add(group);

    const BASE = O.world.PLATEAU + O.config.city.kerb;

    function ammoGeo() {
      const parts = [];
      const box = new THREE.BoxGeometry(0.42, 0.26, 0.30);
      box.translate(0, 0.13, 0);
      parts.push(box);
      const lid = new THREE.BoxGeometry(0.44, 0.05, 0.32);
      lid.translate(0, 0.28, 0);
      parts.push(lid);
      const handle = new THREE.TorusGeometry(0.08, 0.018, 5, 10);
      handle.rotateY(Math.PI / 2);
      handle.translate(0, 0.33, 0);
      parts.push(handle);
      return BGU.mergeBufferGeometries(parts);
    }

    function medGeo() {
      const parts = [];
      const box = new THREE.BoxGeometry(0.34, 0.22, 0.26);
      box.translate(0, 0.11, 0);
      parts.push(box);
      // Korset ovenpå, så man kan se hvad det er uden at læse noget.
      const a = new THREE.BoxGeometry(0.20, 0.03, 0.06);
      a.translate(0, 0.23, 0);
      parts.push(a);
      const bb = new THREE.BoxGeometry(0.06, 0.03, 0.20);
      bb.translate(0, 0.23, 0);
      parts.push(bb);
      return BGU.mergeBufferGeometries(parts);
    }

    const ammoMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0x4a5a34), roughness: 0.7, metalness: 0.25,
      emissive: O.srgb(0x2a3a12), emissiveIntensity: 0.5, envMapIntensity: 0.9
    });
    const medMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0xe8e4dc), roughness: 0.6, metalness: 0.0,
      emissive: O.srgb(0x882020), emissiveIntensity: 0.35, envMapIntensity: 0.9
    });

    // Punkterne fra fodgængernes rutenet er præcis de steder, man kommer
    // forbi til fods — derfor ligger tingene dér.
    const items = [];
    const nodes = npcs.nodes || [];
    const wanted = Math.min(18, Math.max(6, Math.round(nodes.length * 0.25)));
    const ga = ammoGeo(), gm = medGeo();
    for (let i = 0; i < wanted && nodes.length; i++) {
      const n = nodes[(i * 4409 + 11) % nodes.length];
      const kind = i % 3 === 0 ? 'med' : 'ammo';
      const m = new THREE.Mesh(kind === 'med' ? gm : ga, kind === 'med' ? medMat : ammoMat);
      const x = n.x + (rnd() - 0.5) * 1.4, z = n.z + (rnd() - 0.5) * 1.4;
      m.position.set(x, BASE + 0.25, z);
      m.castShadow = true;
      group.add(m);
      items.push({
        mesh: m, kind: kind, x: x, z: z, y: BASE + 0.25,
        gone: 0, phase: rnd() * 6.28,
        weapon: (i % 3 === 1) ? 1 : (i % 3 === 2 ? 2 : 0)
      });
    }

    return {
      group: group,
      items: items,

      update: function (dt, t, player, weapons) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.gone > 0) {
            it.gone -= dt;
            if (it.gone <= 0) it.mesh.visible = true;
            continue;
          }
          it.mesh.rotation.y = t * 1.1 + it.phase;
          it.mesh.position.y = it.y + Math.sin(t * 2.0 + it.phase) * 0.06;

          const dx = player.pos.x - it.x, dz = player.pos.z - it.z;
          if (dx * dx + dz * dz < REACH * REACH && Math.abs(player.pos.y - it.y) < 2.2) {
            it.gone = RESPAWN;
            it.mesh.visible = false;
            if (it.kind === 'med') {
              player.heal(35);
              if (hooks && hooks.onPickup) hooks.onPickup('Forbinding +35');
            } else {
              const w = it.weapon;
              const n = weapons.specs[w].mag * 2;
              weapons.addAmmo(w, n);
              if (hooks && hooks.onPickup) hooks.onPickup(weapons.specs[w].name + ' +' + n);
            }
          }
        }
      }
    };
  };
})();
