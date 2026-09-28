import { contextBridge, ipcRenderer } from 'electron';
import { DownloadProgress } from '../types/updater';

contextBridge.exposeInMainWorld('desktopAPI', {
    platform: process.platform,
    showNotification: (title: string, body: string) => ipcRenderer.invoke('show-notification', { title, body }),
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onNavigate: (callback: (destination: string) => void) => ipcRenderer.on('navigate-to', (_event, destination) => callback(destination)),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: (url: string) => ipcRenderer.invoke('check-for-updates', url),
    downloadUpdate: (downloadUrl: string) => ipcRenderer.invoke('download-update', downloadUrl),
    openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => ipcRenderer.on('update-download-progress', (_event, data) => callback(data))
});
