const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { app, shell } = require('electron');

// Converts common Google Drive sharing links into direct download links
function formatGoogleDriveUrl(url) {
    if (!url) return '';
    const trimmed = url.trim();

    // Check if it's already a direct link
    if (trimmed.includes('export=download') || trimmed.includes('drive.usercontent.google.com')) {
        return trimmed;
    }

    // Pattern: /file/d/ID/...
    const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
        return `https://drive.usercontent.google.com/download?id=${match[1]}&export=download&confirm=t`;
    }

    // Pattern: id=ID
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
        return `https://drive.usercontent.google.com/download?id=${idMatch[1]}&export=download&confirm=t`;
    }

    return trimmed;
}

// Fetch JSON data following HTTP/HTTPS redirects
function fetchJsonWithRedirects(url, maxRedirects = 6) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

        const formattedUrl = formatGoogleDriveUrl(url);
        const parsedUrl = new URL(formattedUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const req = protocol.get(formattedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QuranAppUpdater/1.0',
                'Accept': 'application/json, text/plain, */*'
            }
        }, (res) => {
            // Handle redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, formattedUrl).href;
                }
                return resolve(fetchJsonWithRedirects(redirectUrl, maxRedirects - 1));
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP status code ${res.statusCode}`));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    // Try parsing JSON
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(new Error('Invalid JSON received from update server'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Update check request timed out'));
        });
    });
}

// Compare semantic version (e.g. "1.1.0" > "1.0.0")
function isNewerVersion(remote, local) {
    if (!remote || !local) return false;
    const cleanR = remote.replace(/^[vV]/, '').split('.').map(Number);
    const cleanL = local.replace(/^[vV]/, '').split('.').map(Number);

    for (let i = 0; i < Math.max(cleanR.length, cleanL.length); i++) {
        const r = cleanR[i] || 0;
        const l = cleanL[i] || 0;
        if (r > l) return true;
        if (r < l) return false;
    }
    return false;
}

// Download file following redirects with progress tracking
function downloadUpdateFile(url, onProgress, maxRedirects = 8) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

        const formattedUrl = formatGoogleDriveUrl(url);
        const parsedUrl = new URL(formattedUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const req = protocol.get(formattedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QuranAppUpdater/1.0'
            }
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, formattedUrl).href;
                }
                return resolve(downloadUpdateFile(redirectUrl, onProgress, maxRedirects - 1));
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Download failed with status ${res.statusCode}`));
            }

            const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
            let receivedBytes = 0;

            const tempDir = os.tmpdir();
            const destPath = path.join(tempDir, `quran_app_update_${Date.now()}.exe`);
            const fileStream = fs.createWriteStream(destPath);

            res.on('data', chunk => {
                receivedBytes += chunk.length;
                if (totalBytes > 0 && typeof onProgress === 'function') {
                    const percent = Math.round((receivedBytes / totalBytes) * 100);
                    onProgress({ percent, receivedBytes, totalBytes });
                }
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close(() => resolve(destPath));
            });

            fileStream.on('error', err => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        });

        req.on('error', reject);
    });
}

// Launch the downloaded executable installer or portable app
function installAndRestart(installerPath) {
    try {
        const child = spawn(installerPath, [], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
        app.quit();
    } catch (err) {
        console.error('Failed to launch installer:', err);
        shell.openPath(installerPath);
    }
}

module.exports = {
    fetchJsonWithRedirects,
    isNewerVersion,
    downloadUpdateFile,
    installAndRestart,
    formatGoogleDriveUrl
};
