/* ------------------------------------------------------------------
   Diagnostik.

   Når scenen fejler på en maskine, jeg ikke kan røre, nytter det ikke at
   gætte. Det her modul fanger fejl, taber-tilfælde og oplysninger om
   grafikkortet og viser dem på skærmen — så der står hvad der gik galt,
   i stedet for at billedet bare bliver gråt.

   Tryk F2 for at åbne panelet. Knappen kopierer hele rapporten.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  const log = [];
  let panel = null, body = null, visible = false;

  function stamp() {
    return (performance.now() / 1000).toFixed(1) + 's';
  }

  function add(kind, text) {
    log.push({ t: stamp(), kind: kind, text: String(text).slice(0, 400) });
    if (log.length > 40) log.shift();
    if (kind === 'fejl') show(true);
    render();
  }

  function glInfo() {
    const out = {};
    try {
      const canvas = document.getElementById('scene');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { webgl: 'ingen kontekst' };
      out.webgl = gl instanceof WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        out.gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        out.leverandør = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
      }
      out.maxTekstur = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      out.maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      out.halvFloat = !!(gl.getExtension('EXT_color_buffer_half_float') ||
                         gl.getExtension('EXT_color_buffer_float'));
      out.dybdetekstur = !!(out.webgl === 'WebGL 2' || gl.getExtension('WEBGL_depth_texture'));
    } catch (e) {
      out.fejl = e.message;
    }
    return out;
  }

  function report() {
    const q = O.quality;
    const d = O.debug || {};
    const lines = [];
    lines.push('— Oasen: diagnostik —');
    lines.push('tid: ' + new Date().toISOString());
    lines.push('browser: ' + navigator.userAgent);
    lines.push('skærm: ' + window.innerWidth + '×' + window.innerHeight +
               ' @ ' + window.devicePixelRatio + 'x');
    lines.push('niveau: ' + q.name + (q.runtimeName !== q.name ? ' (kørende: ' + q.runtimeName + ')' : ''));
    lines.push('sikker tilstand: ' + (O.safeMode ? 'ja' : 'nej'));
    if (d.renderer) {
      lines.push('pixeltæthed: ' + d.renderer.getPixelRatio().toFixed(2));
      const info = d.renderer.info;
      lines.push('hukommelse: ' + info.memory.geometries + ' geometrier, ' +
                 info.memory.textures + ' teksturer, ' + info.programs.length + ' shaderprogrammer');
    }
    lines.push('billeder tegnet: ' + (d.frames || 0) + (d.fps ? ' (' + d.fps + ' fps)' : ''));
    const gi = glInfo();
    for (const k in gi) lines.push(k + ': ' + gi[k]);
    lines.push('');
    lines.push('hændelser:');
    if (!log.length) lines.push('  (ingen)');
    for (const e of log) lines.push('  [' + e.t + '] ' + e.kind + ': ' + e.text);
    return lines.join('\n');
  }

  function render() {
    if (!body || !visible) return;
    body.textContent = report();
  }

  function show(v) {
    visible = v;
    if (panel) panel.style.display = v ? 'block' : 'none';
    render();
  }

  O.diagnostics = {
    note: function (text) { add('note', text); },
    fail: function (text) { add('fejl', text); },
    report: report,
    show: show,
    toggle: function () { show(!visible); },

    install: function () {
      panel = document.getElementById('diag');
      body = document.getElementById('diagBody');
      if (!panel) return;

      document.getElementById('diagCopy').addEventListener('click', function (e) {
        e.stopPropagation();
        const text = report();
        if (navigator.clipboard) navigator.clipboard.writeText(text);
        else {
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
        }
        e.target.textContent = 'Kopieret';
        setTimeout(function () { e.target.textContent = 'Kopiér rapport'; }, 1500);
      });
      document.getElementById('diagClose').addEventListener('click', function (e) {
        e.stopPropagation();
        show(false);
      });

      window.addEventListener('keydown', function (e) {
        if (e.code === 'F2') { e.preventDefault(); O.diagnostics.toggle(); }
      });

      // Knappen skal kunne nås, også efter startskærmen er væk — ellers kan
      // man ikke fortælle mig noget, når billedet er gået i stykker.
      const opener = document.getElementById('diagOpen');
      if (opener) {
        opener.addEventListener('click', function (e) {
          e.stopPropagation();
          O.diagnostics.toggle();
        });
        opener.addEventListener('touchstart', function (e) {
          e.stopPropagation();
          e.preventDefault();
          O.diagnostics.toggle();
        }, { passive: false });
      }

      window.addEventListener('error', function (e) {
        add('fejl', (e.message || 'ukendt fejl') +
            (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''));
      });
      window.addEventListener('unhandledrejection', function (e) {
        add('fejl', 'ubehandlet løfte: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
      });

      const canvas = document.getElementById('scene');
      if (canvas) {
        canvas.addEventListener('webglcontextlost', function () {
          add('fejl', 'WebGL-konteksten gik tabt (grafikhukommelsen løb sandsynligvis tør)');
        });
        canvas.addEventListener('webglcontextrestored', function () {
          add('note', 'WebGL-konteksten kom tilbage');
        });
      }

      // Opdatér panelet mens det er åbent.
      setInterval(function () { if (visible) render(); }, 1000);
      add('note', 'diagnostik klar');
    }
  };
})();
