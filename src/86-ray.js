/* ------------------------------------------------------------------
   Skudlinjer.

   Der bliver ikke raycastet mod trekanterne. Byen er flettet til få,
   meget store net, og et raycast mod dem er en lineær gennemgang af
   titusindvis af trekanter — pr. skud. I stedet marcheres strålen
   igennem verdens egne former: terrænets højdefunktion, husenes kasser,
   masternes cylindre og folkene som kapsler. Det er både hurtigere og
   giver samme svar, fordi de former ER det, man kan gå ind i.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  const STEP = 0.45;
  const REFINE = 6;

  function solidAt(p, npcs, skip, out) {
    // Terræn.
    if (p.y < O.world.height(p.x, p.z)) {
      if (out) { out.kind = 'ground'; out.obj = null; }
      return true;
    }
    // Kasser (huse) og cylindre (master, biler).
    const b = O.world.blocked(p.x, p.z);
    if (b && p.y < b.top) {
      if (out) { out.kind = b.r !== undefined ? 'prop' : 'wall'; out.obj = b; }
      return true;
    }
    // Folk: en kapsel om hver.
    if (npcs) {
      for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        if (n === skip || n.dead) continue;
        const dy = p.y - n.pos.y;
        if (dy < 0.1 || dy > 1.85) continue;
        const dx = p.x - n.pos.x, dz = p.z - n.pos.z;
        if (dx * dx + dz * dz < 0.30 * 0.30) {
          if (out) { out.kind = 'npc'; out.obj = n; out.head = dy > 1.45; }
          return true;
        }
      }
    }
    return false;
  }

  const _p = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();

  // Overfladenormalen gættes ud fra, hvad strålen ramte: for terræn af
  // højdefunktionens hældning, for en mur af den flade man kom ind ad.
  function normalAt(hit, dir, out) {
    if (hit.kind === 'ground') {
      const e = 0.6;
      const hx = O.world.height(hit.point.x + e, hit.point.z) - O.world.height(hit.point.x - e, hit.point.z);
      const hz = O.world.height(hit.point.x, hit.point.z + e) - O.world.height(hit.point.x, hit.point.z - e);
      out.set(-hx, 2 * e, -hz).normalize();
      return out;
    }
    if (hit.kind === 'wall' && hit.obj && hit.obj.x0 !== undefined) {
      const b = hit.obj, p = hit.point;
      const dx0 = Math.abs(p.x - b.x0), dx1 = Math.abs(p.x - b.x1);
      const dz0 = Math.abs(p.z - b.z0), dz1 = Math.abs(p.z - b.z1);
      const m = Math.min(dx0, dx1, dz0, dz1);
      if (m === dx0) out.set(-1, 0, 0);
      else if (m === dx1) out.set(1, 0, 0);
      else if (m === dz0) out.set(0, 0, -1);
      else out.set(0, 0, 1);
      return out;
    }
    out.copy(dir).multiplyScalar(-1);
    return out;
  }

  O.ray = {
    // origin, dir (normaliseret), range. Returnerer null eller
    // { point, kind, obj, head, dist }.
    cast: function (origin, dir, range, npcs, skip) {
      const info = { kind: '', obj: null, head: false };
      let t = 0.2;
      _p.copy(origin);
      let prev = 0.2;
      while (t < range) {
        _p.copy(dir).multiplyScalar(t).add(origin);
        if (solidAt(_p, npcs, skip, info)) {
          // Halveringssøgning tilbage til overfladen.
          let lo = prev, hi = t;
          for (let k = 0; k < REFINE; k++) {
            const mid = (lo + hi) * 0.5;
            _a.copy(dir).multiplyScalar(mid).add(origin);
            if (solidAt(_a, npcs, skip, null)) hi = mid; else lo = mid;
          }
          _b.copy(dir).multiplyScalar(hi).add(origin);
          return {
            point: _b.clone(), kind: info.kind, obj: info.obj,
            head: info.head, dist: hi
          };
        }
        prev = t;
        // Grovere skridt langt væk: præcisionen bliver alligevel bestemt
        // af halveringssøgningen bagefter.
        t += STEP * (1 + t * 0.05);
      }
      return null;
    },

    normalAt: normalAt,

    // Fri sigtelinje mellem to punkter — bruges af folkene til at se, om de
    // overhovedet kan se spilleren.
    clear: function (from, to) {
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.001) return true;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      for (let t = 0.8; t < len - 0.5; t += 1.4) {
        _p.set(from.x + ux * t, from.y + uy * t, from.z + uz * t);
        if (solidAt(_p, null, null, null)) return false;
      }
      return true;
    }
  };
})();
