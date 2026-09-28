const { app, BrowserWindow, ipcMain, Tray, Menu, Notification } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
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

function createWindow() {
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
        mainWindow.show();
    });

    // Minimize to tray instead of quitting on close (can be customized)
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            // Keep running in tray for Dhikr reminders
            // mainWindow.hide();
            // event.preventDefault();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    createTray(iconPath);
}

function createTray(iconPath) {
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
    } catch (e) {
        console.warn('Tray icon creation skipped or unsupported:', e.message);
    }
}

// IPC Handlers
ipcMain.handle('show-notification', (event, { title, body }) => {
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

const updater = require('./updater');

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async (event, updateUrl) => {
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
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
});

ipcMain.handle('download-update', async (event, downloadUrl) => {
    try {
        const destPath = await updater.downloadUpdateFile(downloadUrl, (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-download-progress', progress);
            }
        });
        updater.installAndRestart(destPath);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('open-external-url', (event, url) => {
    const formatted = updater.formatGoogleDriveUrl(url);
    const { shell } = require('electron');
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
