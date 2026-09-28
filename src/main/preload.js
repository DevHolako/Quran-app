const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
    platform: process.platform,
    showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onNavigate: (callback) => ipcRenderer.on('navigate-to', (_event, destination) => callback(destination)),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: (url) => ipcRenderer.invoke('check-for-updates', url),
    downloadUpdate: (downloadUrl) => ipcRenderer.invoke('download-update', downloadUrl),
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
    onDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (_event, data) => callback(data))
});
