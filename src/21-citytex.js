/* ------------------------------------------------------------------
   Byens overflader: asfalt, beton, kantsten, facader, glas og metal.

   Facaderne er det, der afgør om en by ser ud som en by eller som en
   stak kasser. De tegnes derfor ikke som en flise, man gentager blindt,
   men i et rigtigt mål: én flise er fire etager gange fire fag, og hver
   variant har sin egen murtype, vinduesform, altaner og skidt. Husene
   bygges bagefter i hele fag- og etagemål, så vinduesrækkerne flugter i
   stedet for at blive skåret midt over.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  // Firkantet sløring i to gennemløb. Bruges på højdekortene, så
  // normalkortene får ramper i stedet for spring.
  function blur(c, radius) {
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const src = ctx.getImageData(0, 0, w, h);
    const d = src.data;
    const tmp = new Uint8ClampedArray(d.length);
    const r = radius | 0;
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? d : tmp;
      const to = pass === 0 ? tmp : d;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0, n = 0;
          for (let k = -r; k <= r; k++) {
            const xx = pass === 0 ? (x + k + w) % w : x;
            const yy = pass === 0 ? y : (y + k + h) % h;
            sum += from[(yy * w + xx) * 4]; n++;
          }
          const i = (y * w + x) * 4;
          const v = sum / n;
          to[i] = to[i + 1] = to[i + 2] = v; to[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(src, 0, 0);
  }

  function build(cache) {
    const U = O.texutil;
    const ihash = U.ihash, tfbm = U.tfbm, tnoise = U.tnoise, canvas = U.canvas;

    /* ================= Asfalt ================= */
    function asphaltMaps() {
      const S = 512;
      const col = canvas(S), hgt = canvas(S);
      const ci = col.getContext('2d').createImageData(S, S);
      const hi = hgt.getContext('2d').createImageData(S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          // Asfalt er grus i bitumen: fint, tæt korn med enkelte lyse sten.
          const grit = tfbm(x * 1.7, y * 1.7, 3);
          const coarse = tfbm(x * 0.16, y * 0.16, 3);
          const stone = ihash(x * 3 + 1, y * 3 + 7) > 0.986 ? 1 : 0;
          const pit = ihash(x + 31, y + 17) > 0.9975 ? 1 : 0;
          // Slidte hjulspor: to lysere baner, hvor bitumen er slidt af.
          const v = 0.44 + (grit - 0.5) * 0.34 + (coarse - 0.5) * 0.16
                  + stone * 0.40 - pit * 0.30;
          const g = M.clamp(v * 150 + 22, 0, 255);
          ci.data[i] = g * 1.02; ci.data[i + 1] = g; ci.data[i + 2] = g * 1.06;
          ci.data[i + 3] = 255;
          const h = M.clamp((0.5 + (grit - 0.5) * 0.9 + stone * 0.5 - pit * 0.7) * 255, 0, 255);
          hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
        }
      }
      col.getContext('2d').putImageData(ci, 0, 0);
      hgt.getContext('2d').putImageData(hi, 0, 0);
      return { color: col, normal: U.normalFromHeight(hgt, 2.2) };
    }

    /* ================= Beton (fortov) ================= */
    function concreteMaps() {
      const S = 512;
      const col = canvas(S), hgt = canvas(S);
      const cx = col.getContext('2d'), hx = hgt.getContext('2d');
      const ci = cx.createImageData(S, S), hi = hx.createImageData(S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          const fine = tfbm(x * 1.3, y * 1.3, 3);
          const blotch = tfbm(x * 0.055, y * 0.055, 3);
          const speck = ihash(x + 3, y + 11) > 0.995 ? 1 : 0;
          const v = 0.66 + (fine - 0.5) * 0.16 + (blotch - 0.5) * 0.20 - speck * 0.22;
          const g = M.clamp(v * 210, 0, 255);
          ci.data[i] = g; ci.data[i + 1] = g * 0.995; ci.data[i + 2] = g * 0.97;
          ci.data[i + 3] = 255;
          const h = M.clamp((0.6 + (fine - 0.5) * 0.6) * 255, 0, 255);
          hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
        }
      }
      cx.putImageData(ci, 0, 0);
      hx.putImageData(hi, 0, 0);

      // Fortovsfliser: fugerne skæres i bagefter, så de bliver skarpe.
      // Én flise er 128 pixels = 1 meter, når teksturen lægges på 4×4 m.
      cx.strokeStyle = 'rgba(40,40,42,0.55)';
      cx.lineWidth = 2;
      for (let k = 0; k <= 4; k++) {
        const p = k * (S / 4) + 0.5;
        cx.beginPath(); cx.moveTo(p, 0); cx.lineTo(p, S); cx.stroke();
        cx.beginPath(); cx.moveTo(0, p); cx.lineTo(S, p); cx.stroke();
      }
      hx.strokeStyle = 'rgba(0,0,0,1)';
      hx.lineWidth = 3;
      for (let k = 0; k <= 4; k++) {
        const p = k * (S / 4) + 0.5;
        hx.beginPath(); hx.moveTo(p, 0); hx.lineTo(p, S); hx.stroke();
        hx.beginPath(); hx.moveTo(0, p); hx.lineTo(S, p); hx.stroke();
      }
      return { color: col, normal: U.normalFromHeight(hgt, 3.0) };
    }

    /* ================= Facader =================
       Én flise = 4 etager × 4 fag. Etagehøjde 3 m, faghøjde 3 m, så en
       flise dækker 12 × 12 meter mur. */
    const PAL = [
      // vægfarve, karmfarve, sokkelbånd, murtype
      { wall: '#cfc6b4', trim: '#efeae0', band: '#b9ae99', kind: 'plaster', win: 'wide' },
      { wall: '#b7623f', trim: '#e8ded0', band: '#8f4a2e', kind: 'brick',   win: 'tall' },
      { wall: '#8f9aa4', trim: '#dfe6ec', band: '#6f7a84', kind: 'panel',   win: 'grid' },
      { wall: '#e2dcc6', trim: '#ffffff', band: '#c9c0a4', kind: 'plaster', win: 'tall' },
      { wall: '#6f7f8b', trim: '#cfd8de', band: '#55636d', kind: 'glass',   win: 'curtain' },
      { wall: '#c9a06a', trim: '#f2ead8', band: '#a37f4d', kind: 'brick',   win: 'wide' }
    ];

    function facadeMaps(p, seed) {
      const S = 512;
      const FLOORS = 4, BAYS = 4;
      const fh = S / FLOORS, bw = S / BAYS;
      const col = canvas(S), hgt = canvas(S), emi = canvas(S), rgh = canvas(S);
      const cx = col.getContext('2d');
      const hx = hgt.getContext('2d');
      const ex = emi.getContext('2d');
      const gx = rgh.getContext('2d');
      const rnd = M.mulberry32(seed);

      // --- grundmur ---
      cx.fillStyle = p.wall; cx.fillRect(0, 0, S, S);
      hx.fillStyle = '#909090'; hx.fillRect(0, 0, S, S);
      ex.fillStyle = '#000000'; ex.fillRect(0, 0, S, S);
      gx.fillStyle = '#b0b0b0'; gx.fillRect(0, 0, S, S);

      // Murværkets egen struktur.
      const ci = cx.getImageData(0, 0, S, S);
      const hi = hx.getImageData(0, 0, S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          let d = (tfbm(x * 0.5 + seed, y * 0.5, 3) - 0.5) * 0.10
                + (tfbm(x * 0.03, y * 0.03, 3) - 0.5) * 0.13;
          let hv = 0.55 + (tfbm(x * 0.7, y * 0.7, 2) - 0.5) * 0.4;

          if (p.kind === 'brick') {
            // Murstensskift: 8 px høje sten, 24 px lange, forskudt hver anden.
            const row = Math.floor(y / 8);
            const off = (row % 2) * 12;
            const mx = (x + off) % 24, my = y % 8;
            const joint = (mx < 2 || my < 2) ? 1 : 0;
            d -= joint * 0.16;
            hv -= joint * 0.42;
            d += (ihash(Math.floor((x + off) / 24), row) - 0.5) * 0.13;
          } else if (p.kind === 'panel') {
            // Betonelementer med fuger hver 64 px.
            const joint = (x % 64 < 2 || y % 64 < 2) ? 1 : 0;
            d -= joint * 0.13;
            hv -= joint * 0.45;
          }

          ci.data[i] = M.clamp(ci.data[i] * (1 + d), 0, 255);
          ci.data[i + 1] = M.clamp(ci.data[i + 1] * (1 + d), 0, 255);
          ci.data[i + 2] = M.clamp(ci.data[i + 2] * (1 + d), 0, 255);
          const g = M.clamp(hv * 255, 0, 255);
          hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = g;
        }
      }
      cx.putImageData(ci, 0, 0);
      hx.putImageData(hi, 0, 0);

      // --- etagebånd ---
      for (let f = 1; f < FLOORS; f++) {
        const y = f * fh;
        cx.fillStyle = p.band;
        cx.globalAlpha = 0.55; cx.fillRect(0, y - 3, S, 6); cx.globalAlpha = 1;
        hx.fillStyle = '#ffffff'; hx.fillRect(0, y - 3, S, 4);
      }

      // --- vinduer ---
      const style = p.win;
      for (let f = 0; f < FLOORS; f++) {
        for (let b = 0; b < BAYS; b++) {
          const x0 = b * bw, y0 = f * fh;
          let wx, wy, ww, wh;
          if (style === 'wide') { ww = bw * 0.62; wh = fh * 0.46; }
          else if (style === 'tall') { ww = bw * 0.40; wh = fh * 0.60; }
          else if (style === 'grid') { ww = bw * 0.70; wh = fh * 0.52; }
          else { ww = bw * 0.84; wh = fh * 0.66; }        // curtain wall
          wx = x0 + (bw - ww) * 0.5;
          wy = y0 + (fh - wh) * 0.42;

          // Karm og fordybning.
          cx.fillStyle = p.trim;
          cx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
          hx.fillStyle = '#f0f0f0';
          hx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

          // Glasset: en himmelrefleks der bliver mørkere nedad, så ruden
          // ikke ser ud som en flad grå plade.
          const grad = cx.createLinearGradient(wx, wy, wx, wy + wh);
          const cool = 150 + Math.floor(rnd() * 40);
          grad.addColorStop(0, 'rgb(' + (cool - 20) + ',' + (cool + 6) + ',' + (cool + 34) + ')');
          grad.addColorStop(0.45, 'rgb(' + (cool - 70) + ',' + (cool - 52) + ',' + (cool - 26) + ')');
          grad.addColorStop(1, 'rgb(26,30,36)');
          cx.fillStyle = grad;
          cx.fillRect(wx, wy, ww, wh);
          hx.fillStyle = '#404040';
          hx.fillRect(wx, wy, ww, wh);
          gx.fillStyle = '#141414';       // glas er blankt
          gx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

          // Sprosser.
          cx.strokeStyle = p.trim; cx.lineWidth = 2.5;
          cx.beginPath();
          cx.moveTo(wx + ww * 0.5, wy); cx.lineTo(wx + ww * 0.5, wy + wh);
          cx.stroke();
          if (style !== 'curtain') {
            cx.beginPath();
            cx.moveTo(wx, wy + wh * 0.46); cx.lineTo(wx + ww, wy + wh * 0.46);
            cx.stroke();
          }

          // Persienner i en tredjedel af ruderne, i tilfældig højde.
          if (rnd() < 0.34) {
            const bh = wh * (0.15 + rnd() * 0.6);
            cx.fillStyle = 'rgba(228,226,214,0.93)';
            cx.fillRect(wx, wy, ww, bh);
            for (let s = 2; s < bh; s += 4) {
              cx.fillStyle = 'rgba(150,146,136,0.5)';
              cx.fillRect(wx, wy + s, ww, 1);
            }
          }

          // Enkelte tændte ruder. De ligger i emissionskortet, så de lyser
          // uden at gøre resten af muren selvlysende.
          if (rnd() < 0.16) {
            ex.fillStyle = 'rgb(' + (200 + rnd() * 55 | 0) + ',' + (168 + rnd() * 50 | 0) + ',' + (110 + rnd() * 50 | 0) + ')';
            ex.fillRect(wx, wy, ww, wh);
          }

          // Vandrette skjolder under vinduerne — regn, der har løbet.
          if (rnd() < 0.45) {
            const g2 = cx.createLinearGradient(0, wy + wh, 0, wy + wh + fh * 0.34);
            g2.addColorStop(0, 'rgba(60,54,46,0.24)');
            g2.addColorStop(1, 'rgba(60,54,46,0)');
            cx.fillStyle = g2;
            cx.fillRect(wx + 2, wy + wh, ww - 4, fh * 0.34);
          }

          // Altan på nogle facader.
          if (style === 'tall' && rnd() < 0.3) {
            const by = wy + wh + 2;
            cx.fillStyle = 'rgba(236,232,222,0.9)';
            cx.fillRect(wx - 8, by, ww + 16, 3);
            cx.strokeStyle = 'rgba(120,118,112,0.8)'; cx.lineWidth = 1.5;
            for (let s = 0; s <= ww + 16; s += 5) {
              cx.beginPath(); cx.moveTo(wx - 8 + s, by - 12); cx.lineTo(wx - 8 + s, by); cx.stroke();
            }
            hx.fillStyle = '#ffffff'; hx.fillRect(wx - 8, by - 1, ww + 16, 4);
          }
        }
      }

      // --- skidt langs bunden af flisen ---
      const dirt = cx.createLinearGradient(0, S, 0, S - 60);
      dirt.addColorStop(0, 'rgba(52,46,38,0.30)');
      dirt.addColorStop(1, 'rgba(52,46,38,0)');
      cx.fillStyle = dirt;
      cx.fillRect(0, S - 60, S, 60);

      // Højdekortet blødgøres, før normalerne udledes. Et spring på én
      // pixel giver en kant, øjet ikke kan se; en rampe over fire pixels
      // giver en fordybning, lyset kan fange.
      blur(hgt, 2);

      return {
        color: col,
        normal: U.normalFromHeight(hgt, 3.4),
        emissive: emi,
        rough: rgh
      };
    }

    /* ================= Butiksfacade (stueetagen) =================
       Én flise = 4 m høj og 12 m bred. */
    function shopMaps(seed) {
      const W = 768, H = 256;
      const col = canvas(W, H), hgt = canvas(W, H), emi = canvas(W, H), rgh = canvas(W, H);
      const cx = col.getContext('2d'), hx = hgt.getContext('2d');
      const ex = emi.getContext('2d'), gx = rgh.getContext('2d');
      const rnd = M.mulberry32(seed);

      cx.fillStyle = '#5c5751'; cx.fillRect(0, 0, W, H);
      hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
      ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
      gx.fillStyle = '#a0a0a0'; gx.fillRect(0, 0, W, H);

      const signPal = ['#c8402f', '#2f6fc8', '#1f9d6a', '#d69a1e', '#8b3fc0', '#20a0b0'];
      const bays = 3;                                  // tre butikker pr. flise
      for (let b = 0; b < bays; b++) {
        const x0 = b * (W / bays) + 6, w = W / bays - 12;

        // Rude fra 40 til 210 px (≈ 0,6 m sokkel, 2,7 m glas).
        const grad = cx.createLinearGradient(0, 44, 0, 214);
        grad.addColorStop(0, '#3c4650');
        grad.addColorStop(0.5, '#1c2228');
        grad.addColorStop(1, '#2a3138');
        cx.fillStyle = grad; cx.fillRect(x0, 44, w, 170);
        gx.fillStyle = '#101010'; gx.fillRect(x0, 44, w, 170);
        hx.fillStyle = '#505050'; hx.fillRect(x0, 44, w, 170);

        // Dør i den ene ende.
        cx.fillStyle = '#12171c';
        cx.fillRect(x0 + w * 0.72, 60, w * 0.22, 154);
        cx.strokeStyle = '#9aa2aa'; cx.lineWidth = 3;
        cx.strokeRect(x0 + w * 0.72, 60, w * 0.22, 154);

        // Markise i butikkens farve.
        const c = signPal[(rnd() * signPal.length) | 0];
        if (rnd() < 0.6) {
          cx.fillStyle = c;
          cx.fillRect(x0 - 4, 18, w + 8, 26);
          cx.fillStyle = 'rgba(0,0,0,0.22)';
          for (let s = 0; s < w + 8; s += 22) cx.fillRect(x0 - 4 + s, 18, 11, 26);
          hx.fillStyle = '#ffffff'; hx.fillRect(x0 - 4, 18, w + 8, 26);
        }

        // Skilt over ruden — lyser om aftenen.
        cx.fillStyle = '#1b1f24';
        cx.fillRect(x0, 2, w, 16);
        ex.fillStyle = c;
        ex.fillRect(x0 + 8, 5, w - 16, 10);
        cx.fillStyle = c;
        cx.fillRect(x0 + 8, 5, w - 16, 10);

        // Sokkel af klinker.
        cx.fillStyle = '#4a4540'; cx.fillRect(x0, 214, w, H - 214);
        for (let s = 0; s < w; s += 16) {
          cx.fillStyle = 'rgba(0,0,0,0.18)';
          cx.fillRect(x0 + s, 214, 1, H - 214);
        }
      }
      return { color: col, normal: U.normalFromHeight(hgt, 2.4), emissive: emi, rough: rgh };
    }

    /* ================= Tag ================= */
    function roofMaps() {
      const S = 256;
      const col = canvas(S), hgt = canvas(S);
      const ci = col.getContext('2d').createImageData(S, S);
      const hi = hgt.getContext('2d').createImageData(S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          const g1 = tfbm(x * 0.9, y * 0.9, 3);
          const seam = (y % 42 < 2) ? 1 : 0;      // tagpapbaner
          const v = 0.40 + (g1 - 0.5) * 0.22 - seam * 0.14;
          const g = M.clamp(v * 190, 0, 255);
          ci.data[i] = g * 1.0; ci.data[i + 1] = g * 0.98; ci.data[i + 2] = g * 0.95;
          ci.data[i + 3] = 255;
          const h = M.clamp((0.5 + (g1 - 0.5) * 0.7 - seam * 0.5) * 255, 0, 255);
          hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
        }
      }
      col.getContext('2d').putImageData(ci, 0, 0);
      hgt.getContext('2d').putImageData(hi, 0, 0);
      return { color: col, normal: U.normalFromHeight(hgt, 2.0) };
    }

    /* ================= Palmebark og -blad ================= */
    function palmBark() {
      const W = 128, H = 512;
      const c = canvas(W, H);
      const ctx = c.getContext('2d');
      const im = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          // Palmens stamme er ringet: gamle bladar sidder som skæl.
          const ring = Math.sin(y * 0.22 + tfbm(x * 0.05, y * 0.05, 2) * 3.0);
          const grain = tfbm(x * 0.6, y * 0.25, 3);
          const v = 0.5 + ring * 0.16 + (grain - 0.5) * 0.34;
          im.data[i] = M.clamp(v * 152 + 26, 0, 255);
          im.data[i + 1] = M.clamp(v * 132 + 22, 0, 255);
          im.data[i + 2] = M.clamp(v * 104 + 18, 0, 255);
          im.data[i + 3] = 255;
        }
      }
      ctx.putImageData(im, 0, 0);
      return c;
    }

    function palmFrond() {
      const W = 256, H = 128;
      const c = canvas(W, H);
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      // Bladet tegnes som en midterribbe med smalle blade ud til siderne.
      ctx.strokeStyle = '#4e6b22';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(4, H * 0.5); ctx.lineTo(W - 6, H * 0.5); ctx.stroke();
      for (let i = 6; i < W - 12; i += 5) {
        const t = i / W;
        const len = (H * 0.46) * Math.sin(Math.min(1, t * 1.35) * Math.PI) * (1 - t * 0.25);
        const shade = 60 + ((i * 37) % 40);
        ctx.strokeStyle = 'rgb(' + (44 + shade * 0.30 | 0) + ',' + (76 + shade * 0.55 | 0) + ',' + (22 + shade * 0.20 | 0) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(i, H * 0.5);
        ctx.lineTo(i + len * 0.38, H * 0.5 - len);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i, H * 0.5);
        ctx.lineTo(i + len * 0.38, H * 0.5 + len);
        ctx.stroke();
      }
      return c;
    }

    /* ---------- byg og læg i cache ---------- */
    const asf = asphaltMaps();
    cache.asphalt = U.toTexture(asf.color, 1, true);
    cache.asphaltNormal = U.toTexture(asf.normal, 1);

    const con = concreteMaps();
    cache.concrete = U.toTexture(con.color, 1, true);
    cache.concreteNormal = U.toTexture(con.normal, 1);

    const roof = roofMaps();
    cache.roof = U.toTexture(roof.color, 1, true);
    cache.roofNormal = U.toTexture(roof.normal, 1);

    cache.facades = PAL.map(function (p, i) {
      const f = facadeMaps(p, 1000 + i * 977);
      return {
        map: U.toTexture(f.color, 1, true),
        normal: U.toTexture(f.normal, 1),
        emissive: U.toTexture(f.emissive, 1, true),
        rough: U.toTexture(f.rough, 1)
      };
    });

    const shop = shopMaps(4711);
    cache.shop = {
      map: U.toTexture(shop.color, 1, true),
      normal: U.toTexture(shop.normal, 1),
      emissive: U.toTexture(shop.emissive, 1, true),
      rough: U.toTexture(shop.rough, 1)
    };

    cache.palmBark = U.toTexture(palmBark(), 1, true);
    cache.palmFrond = U.toTexture(palmFrond(), 1, true);
  }

  O.citytex = { build: build };
})();
