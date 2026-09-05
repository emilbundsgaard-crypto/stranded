/* ------------------------------------------------------------------
   HUD: helbred, våben, kort, træfmarkering og berøringsknapper.

   Kortet tegnes én gang som et stort billede af øen og byen, og hvert
   billede klippes der bare et udsnit ud og drejes, så spilleren altid
   vender opad. Det er både billigere og roligere at se på end at tegne
   gaderne forfra hver frame.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  const MAP_SPAN = 340;     // meter fra midten til kortets kant
  const MAP_RES = 640;
  const MAP_ZOOM = 3.1;     // hvor mange kortpixels pr. skærmpixel

  O.buildHud = function () {
    const el = function (id) { return document.getElementById(id); };
    const hud = el('hud');
    const overlay = el('overlay');
    const crosshair = el('crosshair');
    const hitmark = el('hitmark');
    const hurt = el('hurt');
    const wName = el('wName'), wAmmo = el('wAmmo'), wSlots = el('wSlots');
    const hpBar = el('hpBar');
    const toastEl = el('toast');
    const feedEl = el('feed');
    const mapCanvas = el('map');
    const mapMe = el('mapMe');
    const stick = el('stick'), stickKnob = el('stickKnob');
    const wantedStars = el('wanted') ? el('wanted').children : [];

    let hudVisible = true;
    let hitTimer = 0;

    /* ---------- Kortets baggrund ---------- */
    const base = document.createElement('canvas');
    base.width = base.height = MAP_RES;
    (function drawBase() {
      const g = base.getContext('2d');
      const s = MAP_RES / (MAP_SPAN * 2);
      const toPx = function (w) { return (w + MAP_SPAN) * s; };

      g.fillStyle = '#12304a';                       // hav
      g.fillRect(0, 0, MAP_RES, MAP_RES);

      // Land: en grov afsøgning af højdefunktionen.
      const step = 3;
      for (let z = -MAP_SPAN; z < MAP_SPAN; z += step) {
        for (let x = -MAP_SPAN; x < MAP_SPAN; x += step) {
          const h = O.world.height(x, z);
          if (h < 0) continue;
          const beach = O.world.beachness(x, z, h);
          const rock = O.world.rockiness(x, z, h);
          let col;
          if (h < 1.4) col = '#c9b58a';
          else if (rock > 0.45) col = '#6f6a63';
          else col = beach > 0.5 ? '#bda87e' : '#4d6b3e';
          g.fillStyle = col;
          g.fillRect(toPx(x), toPx(z), step * s + 1, step * s + 1);
        }
      }

      // Byens karreer og veje ovenpå.
      const C = O.config.city, RH = C.roadHalf;
      const av = C.avenues, st = C.streets;
      g.fillStyle = '#8d8b86';
      for (let i = 0; i < av.length - 1; i++) {
        for (let j = 0; j < st.length - 1; j++) {
          g.fillRect(toPx(av[i] + RH), toPx(st[j] + RH),
                     (av[i + 1] - av[i] - RH * 2) * s, (st[j + 1] - st[j] - RH * 2) * s);
        }
      }
      g.fillStyle = '#2f3338';
      for (const x of av) g.fillRect(toPx(x - RH), toPx(st[0] - RH), RH * 2 * s, (st[st.length - 1] - st[0] + RH * 2) * s);
      for (const z of st) g.fillRect(toPx(av[0] - RH), toPx(z - RH), (av[av.length - 1] - av[0] + RH * 2) * s, RH * 2 * s);
    })();

    const mg = mapCanvas.getContext('2d');
    const mapW = mapCanvas.width, mapH = mapCanvas.height;

    function drawMap(player, npcs, cars) {
      const s = MAP_RES / (MAP_SPAN * 2);
      const px = (player.pos.x + MAP_SPAN) * s;
      const pz = (player.pos.z + MAP_SPAN) * s;

      mg.save();
      mg.clearRect(0, 0, mapW, mapH);
      mg.translate(mapW / 2, mapH / 2);
      mg.rotate(player.yaw);
      mg.scale(MAP_ZOOM, MAP_ZOOM);
      mg.translate(-px, -pz);
      mg.imageSmoothingEnabled = true;
      mg.drawImage(base, 0, 0);

      // Prikker: folk hvidt, biler gult.
      if (npcs) {
        mg.fillStyle = '#e8ecef';
        for (let i = 0; i < npcs.length; i++) {
          const n = npcs[i];
          if (n.dead) continue;
          mg.beginPath();
          mg.arc((n.pos.x + MAP_SPAN) * s, (n.pos.z + MAP_SPAN) * s, 1.6 / MAP_ZOOM * 3, 0, 6.3);
          mg.fill();
        }
      }
      if (cars) {
        mg.fillStyle = '#ffcf5a';
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i].mesh || cars[i];
          mg.beginPath();
          mg.arc((c.position.x + MAP_SPAN) * s, (c.position.z + MAP_SPAN) * s, 2.0 / MAP_ZOOM * 3, 0, 6.3);
          mg.fill();
        }
      }
      mg.restore();
    }

    /* ---------- Kvalitetsknapper ---------- */
    function initQualityButtons() {
      const cur = O.quality.name;
      document.querySelectorAll('.q-buttons button[data-q]').forEach(function (b) {
        if (b.dataset.q === cur) b.classList.add('on');
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          O.quality.set(b.dataset.q);
        });
        b.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
      });
      const safe = el('qSafe');
      if (safe) {
        if (O.safeMode) safe.classList.add('on');
        safe.addEventListener('click', function (e) {
          e.stopPropagation();
          const url = new URL(window.location.href);
          if (O.safeMode) url.searchParams.delete('safe');
          else url.searchParams.set('safe', '1');
          window.location.href = url.toString();
        });
      }
      const dg = el('qDiag');
      if (dg) {
        dg.addEventListener('click', function (e) {
          e.stopPropagation();
          O.diagnostics.show(true);
        });
      }
    }

    /* ---------- Berøring ---------- */
    function initTouch(player, weapons) {
      if (!player.isTouch) return;
      document.body.classList.add('touch');
      player.onStick = function (on, x, y, dx, dy) {
        if (!on) { stick.style.display = 'none'; return; }
        stick.style.display = 'block';
        stick.style.left = x + 'px';
        stick.style.top = y + 'px';
        stickKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      };
      function hold(id, down, up) {
        const b = el(id);
        if (!b) return;
        b.addEventListener('touchstart', function (e) { e.stopPropagation(); e.preventDefault(); down(); }, { passive: false });
        b.addEventListener('touchend', function (e) { e.stopPropagation(); if (up) up(); });
        b.addEventListener('touchcancel', function () { if (up) up(); });
      }
      hold('btnFire', function () { player.triggerDown = true; }, function () { player.triggerDown = false; });
      hold('btnAim', function () { weapons.setAds(!weapons.state.wantAds); });
      hold('btnJump', function () { player.wantJump = true; });
      hold('btnReload', function () { weapons.reload(); });
      hold('btnSwap', function () { weapons.next(); });
    }

    const api = {
      initQualityButtons: initQualityButtons,
      initTouch: initTouch,

      setLoading: function (text, frac) {
        el('loadText').textContent = text;
        el('loadBar').style.width = Math.round(frac * 100) + '%';
      },
      ready: function () {
        el('loading').style.display = 'none';
        el('startBox').style.display = 'block';
      },
      showOverlay: function (show) { overlay.classList.toggle('hidden', !show); },
      hideOverlay: function () { overlay.classList.add('hidden'); },
      toggle: function () {
        hudVisible = !hudVisible;
        hud.style.opacity = hudVisible ? '1' : '0';
      },
      setFps: function (n) { el('fps').textContent = n; },
      setQualityNote: function (name, auto) {
        el('qName').textContent = name;
        if (auto) el('qNote').textContent = 'Skruet automatisk ned til ' + name + ', fordi billedraten faldt.';
      },
      setSound: function (on) { el('sndState').textContent = on ? 'til' : 'fra'; },

      setWeapon: function (spec, ammo, reserve, index) {
        wName.textContent = spec.name;
        wAmmo.innerHTML = ammo + '<small>/' + reserve + '</small>';
        wAmmo.classList.toggle('empty', ammo === 0);
        const kids = wSlots.children;
        for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === index);
      },
      setAds: function (on) { crosshair.classList.toggle('ads', on); },
      setWanted: function (n) {
        for (let i = 0; i < wantedStars.length; i++) {
          wantedStars[i].classList.toggle('on', i < n);
        }
      },
      setHealth: function (h) {
        hpBar.style.width = M.clamp(h, 0, 100) + '%';
        hpBar.classList.toggle('low', h < 34);
      },
      setHurt: function (v) { hurt.style.opacity = M.clamp(v, 0, 1) * 0.9; },

      hit: function (kill) {
        hitmark.classList.add('on');
        hitmark.classList.toggle('kill', !!kill);
        hitTimer = 0.16;
      },
      feed: function (html) {
        const d = document.createElement('div');
        d.innerHTML = html;
        feedEl.appendChild(d);
        setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 4200);
        while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstChild);
      },
      toast: function (text) {
        toastEl.textContent = text;
        toastEl.classList.add('show');
        clearTimeout(api._tt);
        api._tt = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
      },

      update: function (dt, player, npcs, cars) {
        if (hitTimer > 0) {
          hitTimer -= dt;
          if (hitTimer <= 0) hitmark.classList.remove('on');
        }
        mapMe.style.transform = 'rotate(0deg)';
        drawMap(player, npcs, cars);
      }
    };
    return api;
  };
})();
