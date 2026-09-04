/* ------------------------------------------------------------------
   Oasen som program til macOS.

   Det er den samme scene som i browseren, men uden fanens begrænsninger:
   den kører i sit eget vindue, henter ANGLE's Metal-backend, beder om det
   kraftigste grafikkort på maskinen og starter på "Kino"-niveauet, som er
   for tungt til en browserfane.
   ------------------------------------------------------------------ */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Grafikflag. Sættes før app'en er klar, ellers har de ingen effekt. ---
app.commandLine.appendSwitch('use-angle', 'metal');       // Metal på macOS
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Uden vsync bliver billedraten højere, men maskinen bliver også varmere.
if (process.argv.includes('--uncapped')) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

let win = null;

function sceneFile() {
  // I udvikling ligger scenen ved siden af; i den pakkede app ligger den
  // under Resources. Vi prøver begge, så det virker i begge tilfælde.
  const candidates = [
    path.join(__dirname, '..', 'dist', 'oasen.html'),
    path.join(process.resourcesPath || '', 'dist', 'oasen.html')
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* prøv næste */ }
  }
  return candidates[0];
}

function sceneUrl(quality) {
  return 'file://' + sceneFile() + '?quality=' + (quality || 'kino');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0b0a09',
    title: 'Oasen',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,      // scenen må ikke sløves i baggrunden
      webgl: true
    }
  });

  win.once('ready-to-show', function () { win.show(); });
  win.loadURL(sceneUrl(process.env.OASE_QUALITY));

  // Links ud af programmet åbnes i browseren i stedet for i vinduet.
  win.webContents.setWindowOpenHandler(function (details) {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Sig til, hvis grafikprocessen falder fra — ellers står man med et sort
  // vindue uden at vide hvorfor.
  win.webContents.on('render-process-gone', function (event, details) {
    console.error('Grafikprocessen stoppede:', details.reason);
  });
}

function buildMenu() {
  const quality = ['kino', 'ultra', 'high', 'medium', 'low'];
  const labels = { kino: 'Kino', ultra: 'Ultra', high: 'Høj', medium: 'Middel', low: 'Lav' };
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'Om Oasen' },
        { type: 'separator' },
        { role: 'hide', label: 'Skjul Oasen' },
        { role: 'quit', label: 'Afslut Oasen' }
      ]
    },
    {
      label: 'Grafik',
      submenu: quality.map(function (q) {
        return {
          label: labels[q],
          click: function () { if (win) win.loadURL(sceneUrl(q)); }
        };
      }).concat([
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Fuld skærm' },
        { role: 'reload', label: 'Indlæs igen' },
        { role: 'toggleDevTools', label: 'Udviklerværktøjer' }
      ])
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(function () {
  buildMenu();
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
