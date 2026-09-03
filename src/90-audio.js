/* ------------------------------------------------------------------
   Lyd genereret i browseren (ingen filer): vind, vand, skridt og
   en lille klang når man samler en sten op.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  O.buildAudio = function () {
    let ctx = null, master = null, windGain = null, waterGain = null, noiseBuf = null;
    let enabled = true;
    let ready = false;

    function makeNoise(seconds) {
      const len = ctx.sampleRate * seconds;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;    // brunlig støj = blødere
        d[i] = last * 3.2;
      }
      return buf;
    }

    function loopSource(buf, filterType, freq, q, gainNode) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      src.connect(f);
      f.connect(gainNode);
      src.start();
      return { src: src, filter: f };
    }

    function init() {
      if (ready) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      noiseBuf = makeNoise(4);

      windGain = ctx.createGain();
      windGain.gain.value = 0.06;
      windGain.connect(master);
      const wind = loopSource(noiseBuf, 'bandpass', 520, 0.7, windGain);

      waterGain = ctx.createGain();
      waterGain.gain.value = 0.0;
      waterGain.connect(master);
      loopSource(noiseBuf, 'bandpass', 1500, 1.4, waterGain);

      // Vinden kommer i stød.
      let t = 0;
      setInterval(function () {
        if (!ctx) return;
        t += 1;
        const v = 0.035 + 0.045 * (0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.07));
        windGain.gain.setTargetAtTime(enabled ? v : 0, ctx.currentTime, 1.5);
        wind.filter.frequency.setTargetAtTime(420 + 260 * (0.5 + 0.5 * Math.sin(t * 0.13)), ctx.currentTime, 2.0);
      }, 900);

      ready = true;
    }

    function step(inWater) {
      if (!ready || !enabled) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.value = 0.8 + Math.random() * 0.5;
      const f = ctx.createBiquadFilter();
      f.type = inWater > 0.15 ? 'lowpass' : 'bandpass';
      f.frequency.value = inWater > 0.15 ? 900 + Math.random() * 400 : 1900 + Math.random() * 900;
      f.Q.value = 0.9;
      const g = ctx.createGain();
      const now = ctx.currentTime;
      const peak = inWater > 0.15 ? 0.26 : 0.13;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (inWater > 0.15 ? 0.34 : 0.17));
      src.connect(f); f.connect(g); g.connect(master);
      src.start(now, Math.random() * 3, 0.4);
      src.stop(now + 0.45);
    }

    function pickup(tier) {
      if (!ready || !enabled) return;
      const now = ctx.currentTime;
      const notes = [[440], [520, 660], [560, 700, 840], [520, 660, 880, 1170]][tier] || [440];
      notes.forEach(function (n, i) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = tier >= 2 ? 'sine' : 'triangle';
        osc.frequency.value = n;
        g.gain.setValueAtTime(0.0001, now + i * 0.075);
        g.gain.linearRampToValueAtTime(0.13, now + i * 0.075 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.075 + 0.55);
        osc.connect(g); g.connect(master);
        osc.start(now + i * 0.075);
        osc.stop(now + i * 0.075 + 0.6);
      });
    }

    return {
      start: function () { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
      step: step,
      pickup: pickup,
      setWaterProximity: function (v) {
        if (!ready) return;
        waterGain.gain.setTargetAtTime(enabled ? v * 0.055 : 0, ctx.currentTime, 0.6);
      },
      toggle: function () {
        enabled = !enabled;
        if (master) master.gain.setTargetAtTime(enabled ? 0.9 : 0.0, ctx.currentTime, 0.1);
        return enabled;
      },
      get enabled() { return enabled; }
    };
  };
})();
