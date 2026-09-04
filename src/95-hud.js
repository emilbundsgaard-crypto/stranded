/* ------------------------------------------------------------------
   HUD: sigtekorn, opsamlings-prompt, lomme og små beskeder.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  O.buildHud = function () {
    const $ = id => document.getElementById(id);
    const overlay = $('overlay');
    const loadText = $('loadText');
    const loadBar = $('loadBar');
    const startBox = $('startBox');
    const prompt = $('prompt');
    const invList = $('invList');
    const invCount = $('invCount');
    const toast = $('toast');
    const hud = $('hud');
    const overlayTitle = $('overlayTitle');
    const overlayHint = $('overlayHint');

    const inventory = {};
    const fpsEl = $('fps');
    const qNameEl = $('qName');
    const qNoteEl = $('qNote');
    let toastTimer = null;
    let visible = true;

    const api = {
      setLoading: function (text, pct) {
        loadText.textContent = text;
        loadBar.style.width = Math.round(pct * 100) + '%';
      },
      ready: function () {
        $('loading').style.display = 'none';
        startBox.style.display = 'block';
      },
      showOverlay: function (paused) {
        overlay.classList.remove('hidden');
        overlayTitle.textContent = paused ? 'På pause' : 'Oasen';
        overlayHint.textContent = paused ? 'Klik for at fortsætte' : 'Klik for at gå ind i kløften';
      },
      hideOverlay: function () {
        overlay.classList.add('hidden');
      },
      setPrompt: function (type) {
        if (!type) { prompt.classList.remove('show'); return; }
        prompt.classList.add('show');
        prompt.innerHTML = '<b>E</b> Saml op &nbsp;<span style="color:' + type.hud + '">' + type.name + '</span>';
      },
      addStone: function (type) {
        if (!inventory[type.id]) inventory[type.id] = { type: type, n: 0 };
        inventory[type.id].n++;
        this.renderInventory();
        this.toast(type);
      },
      renderInventory: function () {
        const rows = Object.values(inventory).sort((a, b) => b.type.tier - a.type.tier || b.n - a.n);
        let total = 0;
        for (const r of rows) total += r.n;
        invCount.textContent = total;
        invList.innerHTML = rows.map(r =>
          '<li><i style="background:' + r.type.hud + '"></i>' +
          '<span class="nm">' + r.type.name + '</span>' +
          '<span class="ct">' + r.n + '</span></li>'
        ).join('') || '<li class="empty">Tom — kig efter sten i sandet</li>';
      },
      toast: function (type) {
        toast.style.borderColor = type.hud;
        toast.innerHTML = '<span class="t-name" style="color:' + type.hud + '">' + type.name + '</span>' +
          '<span class="t-rar">' + type.rarity + '</span>';
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
      },
      toggle: function () {
        visible = !visible;
        hud.style.opacity = visible ? '1' : '0';
        return visible;
      },
      setSound: function (on) {
        $('sndState').textContent = on ? 'til' : 'fra';
      },

      setFps: function (fps) {
        if (fpsEl) fpsEl.textContent = fps;
      },

      // Sig det ærligt, hvis spillet selv har skruet ned.
      setQualityNote: function (name, automatic) {
        const label = (O.quality.presets[name] || {}).label || name;
        if (qNameEl) qNameEl.textContent = label.toLowerCase();
        if (automatic && qNoteEl) {
          qNoteEl.textContent = 'Skruet ned til ' + label.toLowerCase() +
            ' — maskinen kunne ikke følge med.';
        }
      },

      initQualityButtons: function () {
        const current = O.quality.name;
        const label = (O.quality.presets[current] || {}).label || current;
        if (qNameEl) qNameEl.textContent = label.toLowerCase();
        const buttons = document.querySelectorAll('.q-buttons button[data-q]');
        buttons.forEach(function (btn) {
          if (btn.dataset.q === current) btn.classList.add('on');
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            O.quality.set(btn.dataset.q);
          });
        });

        const safeBtn = $('qSafe');
        if (safeBtn) {
          if (O.safeMode) safeBtn.classList.add('on');
          safeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const url = new URL(window.location.href);
            if (O.safeMode) url.searchParams.delete('safe');
            else url.searchParams.set('safe', '1');
            window.location.href = url.toString();
          });
        }
        const diagBtn = $('qDiag');
        if (diagBtn) {
          diagBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            O.diagnostics.show(true);
          });
        }
      }
    };

    api.renderInventory();
    return api;
  };
})();
