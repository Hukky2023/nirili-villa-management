const {app, BrowserWindow, ipcMain, Menu, shell} = require('electron');
const {spawn} = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_POS_URL = 'https://www.nirilihotels.com/restaurant';
let mainWindow = null;

function validateServerUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Nirili POS server must use HTTPS.');
  return url.toString();
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readServerUrl() {
  const cli = process.argv.find(arg => arg.startsWith('--server='));
  if (cli) return validateServerUrl(cli.slice('--server='.length));
  if (process.env.NIRILI_POS_URL) return validateServerUrl(process.env.NIRILI_POS_URL);
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (saved && saved.serverUrl) return validateServerUrl(saved.serverUrl);
  } catch {}
  return DEFAULT_POS_URL;
}

function ensureConfig() {
  const file = configPath();
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({serverUrl: DEFAULT_POS_URL}, null, 2));
}

function rawScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'windows-raw.ps1')
    : path.join(__dirname, 'windows-raw.ps1');
}

function sendRawToWindowsPrinter(printer, base64) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('Direct desktop printing is currently supported on Windows only.'));
      return;
    }
    if (typeof printer !== 'string' || !printer.trim()) {
      reject(new Error('Select a Windows receipt printer first.'));
      return;
    }
    if (typeof base64 !== 'string' || !base64) {
      reject(new Error('Printer data is empty.'));
      return;
    }

    let data;
    try {
      data = Buffer.from(base64, 'base64');
    } catch {
      reject(new Error('Printer data is invalid.'));
      return;
    }
    if (!data.length || data.length > 16 * 1024 * 1024) {
      reject(new Error('Printer data size is invalid.'));
      return;
    }

    const temp = path.join(os.tmpdir(), 'nirili-pos-' + crypto.randomUUID() + '.raw');
    fs.writeFileSync(temp, data);

    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', rawScriptPath(),
      '-PrinterName', printer,
      '-DataFile', temp
    ], {windowsHide: true});

    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => {
      try { fs.unlinkSync(temp); } catch {}
      reject(error);
    });
    child.on('close', code => {
      try { fs.unlinkSync(temp); } catch {}
      if (code === 0) resolve({ok: true});
      else reject(new Error(stderr.trim() || 'Windows printer command failed.'));
    });
  });
}

async function assertPrinterExists(sender, printer) {
  const printers = await sender.getPrintersAsync();
  if (!printers.some(item => item.name === printer)) {
    throw new Error('The selected Windows printer is unavailable. Open Printer and refresh the list.');
  }
}

function offlinePage(serverUrl) {
  const safe = serverUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><title>Nirili POS</title>
<style>body{margin:0;background:#111b25;color:#eef5f6;font:16px system-ui;display:grid;place-items:center;min-height:100vh}.box{max-width:520px;padding:32px;text-align:center}button{background:#24a269;color:#fff;border:0;border-radius:10px;padding:13px 20px;font:inherit;font-weight:700}</style></head>
<body><div class="box"><h1>Nirili POS</h1><p>Unable to reach the Nirili Villa management system.</p><p>Check the internet connection and try again.</p><p><small>${safe}</small></p><button onclick="location.href='${serverUrl.replace(/'/g, '%27')}'">Retry</button></div></body></html>`);
}

function createWindow() {
  const serverUrl = readServerUrl();
  const allowedOrigin = new URL(serverUrl).origin;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#111b25',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    try {
      if (new URL(url).origin === allowedOrigin) {
        mainWindow.loadURL(url);
      } else {
        shell.openExternal(url);
      }
    } catch {}
    return {action: 'deny'};
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'data:' || target.origin === allowedOrigin) return;
      event.preventDefault();
      shell.openExternal(url);
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    mainWindow.loadURL(offlinePage(serverUrl)).catch(() => {});
  });

  mainWindow.loadURL(serverUrl).catch(() => {
    mainWindow.loadURL(offlinePage(serverUrl)).catch(() => {});
  });
}

ipcMain.handle('nirili:list-printers', async event => {
  const printers = await event.sender.getPrintersAsync();
  return printers.map(item => item.name).filter(Boolean);
});

ipcMain.handle('nirili:raw-print', async (event, payload) => {
  const printer = payload && payload.printer;
  await assertPrinterExists(event.sender, printer);
  return sendRawToWindowsPrinter(printer, payload && payload.base64);
});

ipcMain.handle('nirili:open-drawer', async (event, payload) => {
  const printer = payload && payload.printer;
  await assertPrinterExists(event.sender, printer);
  const pulse = Buffer.from([27, 112, 0, 25, 250]).toString('base64');
  return sendRawToWindowsPrinter(printer, pulse);
});

ipcMain.handle('nirili:version', () => app.getVersion());

app.whenReady().then(() => {
  ensureConfig();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
