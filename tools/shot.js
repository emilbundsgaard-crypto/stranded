/* Tager skærmbilleder af scenen med headless Chromium (udviklingsværktøj). */
const { chromium } = require('playwright');
const path = require('path');

const VIEWS = [
  { name: 'spawn',    yaw: null, pitch: -0.06 },
  { name: 'water',    pos: [22, -22], yaw: 3.5, pitch: -0.10 },
  { name: 'cliffs',   pos: [-24, 10], yaw: 1.3, pitch: 0.10 },
  { name: 'ground',   pos: [26, -40], yaw: 3.5, pitch: -0.75 },
  { name: 'fire',     pos: [4, 6], yaw: 0.4, pitch: -0.05 },
  { name: 'wide',     pos: [34, 30], yaw: 4.2, pitch: 0.03 }
];

(async () => {
  const out = process.argv[2] || '/tmp/shots';
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--enable-webgl']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto('http://localhost:8123/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.OASIS && window.OASIS.debug, null, { timeout: 120000 });
  console.log('scene klar');
  const showHud = process.argv.includes('--hud');
  await page.evaluate((showHud) => {
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('hud').style.opacity = showHud ? '1' : '0';
  }, showHud);

  for (const v of VIEWS) {
    await page.evaluate((v) => {
      const d = window.OASIS.debug;
      if (v.pos) {
        d.player.pos.x = v.pos[0];
        d.player.pos.z = v.pos[1];
        d.player.pos.y = window.OASIS.world.height(v.pos[0], v.pos[1]);
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
      draws: d.renderer.info.render.calls,
      tris: d.renderer.info.render.triangles,
      stones: d.stones.list.length,
      colliders: window.OASIS.world.colliders.length,
      spawn: [d.player.pos.x.toFixed(1), d.player.pos.y.toFixed(2), d.player.pos.z.toFixed(1)],
      fire: [d.props.fire.position.x.toFixed(1), d.props.fire.position.z.toFixed(1)]
    };
  });
  console.log(JSON.stringify(info));
  await browser.close();
})();
