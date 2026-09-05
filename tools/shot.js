/* Tager skærmbilleder af scenen med headless Chromium (udviklingsværktøj). */
const { chromium } = require('playwright');
const path = require('path');

const VIEWS = [
  { name: 'spawn',    yaw: null, pitch: -0.02 },
  { name: 'street',   pos: [-28, 40], yaw: 0, pitch: 0.05 },
  { name: 'kryds',    pos: [28, 24], yaw: 0.8, pitch: 0.10 },
  { name: 'facade',   pos: [-14, -4], yaw: 1.6, pitch: 0.28 },
  { name: 'strand',   pos: [30, 150], yaw: 3.6, pitch: -0.02 },
  { name: 'kyst',     pos: [10, 118], yaw: 0.2, pitch: 0.02 },
  { name: 'bakke',    pos: [-40, -170], yaw: 3.0, pitch: -0.06 },
  { name: 'skyline',  pos: [120, 130], yaw: 3.9, pitch: 0.06 }
];

(async () => {
  const out = process.argv[2] || '/tmp/shots';
  const only = (process.argv.find(a => a.startsWith('--views=')) || '').split('=')[1];
  const sizeArg = (process.argv.find(a => a.startsWith('--size=')) || '').split('=')[1];
  const [vw, vh] = sizeArg ? sizeArg.split('x').map(Number) : [1024, 576];
  const views = only ? VIEWS.filter(v => only.split(',').includes(v.name)) : VIEWS;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--enable-webgl']
  });
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.setDefaultTimeout(300000);
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  const t0 = Date.now();
  const quality = (process.argv.find(a => a.startsWith('--quality=')) || '').split('=')[1] || 'ultra';
  const extra = (process.argv.find(a => a.startsWith('--flags=')) || '').split('=')[1] || '';
  await page.goto('http://localhost:8123/index.html?quality=' + quality + (extra ? '&' + extra : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.OASIS && window.OASIS.debug, null, { timeout: 300000 });
  console.log('scene klar efter', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const showHud = process.argv.includes('--hud');
  await page.evaluate((showHud) => {
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('hud').style.opacity = showHud ? '1' : '0';
  }, showHud);

  for (const v of views) {
    await page.evaluate((v) => {
      const d = window.OASIS.debug;
      if (v.pos) {
        d.player.pos.x = v.pos[0];
        d.player.pos.z = v.pos[1];
        d.player.pos.y = window.OASIS.world.surface(v.pos[0], v.pos[1]);
      }
      if (v.yaw !== null && v.yaw !== undefined) d.player.yaw = v.yaw;
      d.player.pitch = v.pitch;
    }, v);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, v.name + '.png') });
    console.log('skud:', v.name);
  }

  const info = await page.evaluate(() => {
    const d = window.OASIS.debug;
    return {
      huse: d.city.buildings.length,
      folk: d.npcs.list.length,
      biler: d.vehicles.parked.length + d.vehicles.traffic.length,
      forhindringer: window.OASIS.world.boxes.length + window.OASIS.world.circles.length,
      geometrier: d.renderer.info.memory.geometries,
      teksturer: d.renderer.info.memory.textures,
      programmer: d.renderer.info.programs ? d.renderer.info.programs.length : 0
    };
  });
  console.log(JSON.stringify(info));
  await browser.close();
})();
