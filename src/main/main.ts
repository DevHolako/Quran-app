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
            // Same-origin policy stays ON. It was disabled to "let audio stream from
            // different CDNs smoothly", but <audio>/<img> loads are not CORS-restricted,
            // so disabling it bought nothing while letting any injected script read local
            // files and phone home. The two fetch() call sites that do need cross-origin
            // (api.quran.com, cdn.jsdelivr.net) both send Access-Control-Allow-Origin.
            webSecurity: true
        },
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // The renderer only ever shows the local index.html. Anything that tries to walk it
    // somewhere else, or pop a window, is dropped rather than handed to the shell.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== mainWindow?.webContents.getURL()) {
            event.preventDefault();
            if (isSafeExternalUrl(url)) shell.openExternal(url);
        }
    });

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
    if (!isSafeExternalUrl(url)) {
        return false;
    }
    shell.openExternal(url);
    return true;
});

/**
 * The renderer can ask for any URL it likes, and shell.openExternal hands that string
 * to the Windows shell. Left unchecked it is a local privilege-escalation primitive:
 * an injected string like a UNC path or a file:// handler makes Explorer run something
 * on the user's machine. Only plain web links are allowed through.
 */
function isSafeExternalUrl(url: unknown): boolean {
    if (typeof url !== 'string' || !url.trim()) {
        return false;
    }
    try {
        const parsed = new URL(url.trim());
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return false;
        }
        return !!parsed.hostname;
    } catch {
        return false;
    }
}

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
