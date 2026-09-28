import { app, BrowserWindow, ipcMain, Tray, Menu, Notification, shell } from 'electron';
import * as path from 'path';
import * as updater from './updater';
import { UpdateCheckResult, DownloadProgress } from '../types/updater';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function createWindow(): void {
    const iconPath = path.join(__dirname, '../../build/icon.ico');
    
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 860,
        minWidth: 960,
        minHeight: 650,
        title: 'القرآن الكريم والأذكار',
        icon: iconPath,
        autoHideMenuBar: true,
        backgroundColor: '#0d3b2e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false // allow audio streaming from different Quran CDN domains smoothly
        },
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.once('ready-to-show', () => {
        if (mainWindow) mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    createTray(iconPath);
}

function createTray(iconPath: string): void {
    try {
        tray = new Tray(iconPath);
        tray.setToolTip('القرآن الكريم والأذكار');

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'فتح المصحف',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            {
                label: 'أذكار الصباح والمساء',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.webContents.send('navigate-to', 'adhkar');
                    }
                }
            },
            {
                label: 'سورة الكهف',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.webContents.send('navigate-to', 'kahf');
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'إغلاق تماماً',
                click: () => {
                    isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => {
            if (mainWindow) {
                if (mainWindow.isVisible()) {
                    mainWindow.focus();
                } else {
                    mainWindow.show();
                }
            }
        });
    } catch (e: any) {
        console.warn('Tray icon creation skipped or unsupported:', e.message);
    }
}

// IPC Handlers
ipcMain.handle('show-notification', (_event, { title, body }: { title: string; body: string }) => {
    try {
        if (Notification.isSupported()) {
            const notif = new Notification({
                title: title || 'القرآن الكريم',
                body: body || '',
                icon: path.join(__dirname, '../../build/icon.png'),
                silent: false
            });
            notif.show();
            notif.on('click', () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                }
            });
            return true;
        }
    } catch (e) {
        console.error('Notification error:', e);
    }
    return false;
});

ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.handle('window-close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async (_event, updateUrl: string): Promise<UpdateCheckResult> => {
    try {
        const currentVersion = app.getVersion();
        const updateData = await updater.fetchJsonWithRedirects(updateUrl);
        const hasUpdate = updater.isNewerVersion(updateData.version, currentVersion);
        return {
            success: true,
            hasUpdate,
            currentVersion,
            latestVersion: updateData.version,
            changelog: updateData.changelog || '',
            downloadUrl: updateData.downloadUrl || '',
            releaseDate: updateData.releaseDate || ''
        };
    } catch (err: any) {
        return {
            success: false,
            error: err.message
        };
    }
});

ipcMain.handle('download-update', async (_event, downloadUrl: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const destPath = await updater.downloadUpdateFile(downloadUrl, (progress: DownloadProgress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-download-progress', progress);
            }
        });
        updater.installAndRestart(destPath);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('open-external-url', (_event, url: string): boolean => {
    const formatted = updater.formatGoogleDriveUrl(url);
    shell.openExternal(formatted || url);
    return true;
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
