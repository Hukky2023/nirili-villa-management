const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('niriliDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  listPrinters: () => ipcRenderer.invoke('nirili:list-printers'),
  rawPrint: (printer, base64) => ipcRenderer.invoke('nirili:raw-print', {printer, base64}),
  openDrawer: (printer) => ipcRenderer.invoke('nirili:open-drawer', {printer}),
  appVersion: () => ipcRenderer.invoke('nirili:version')
}));
