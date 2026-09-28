import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { app, shell } from 'electron';
import { UpdateInfo, DownloadProgress } from '../types/updater';

// Converts common Google Drive sharing links into direct download links
export function formatGoogleDriveUrl(url: string): string {
    if (!url) return '';
    const trimmed = url.trim();

    // Check if it's already a direct usercontent link
    if (trimmed.includes('drive.usercontent.google.com')) {
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
export function fetchJsonWithRedirects(url: string, maxRedirects: number = 6): Promise<UpdateInfo> {
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
            if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, formattedUrl).href;
                }
                return resolve(fetchJsonWithRedirects(redirectUrl, maxRedirects - 1));
            }

            if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
                return reject(new Error(`HTTP status code ${res.statusCode}`));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
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
export function isNewerVersion(remote: string, local: string): boolean {
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

// Download file following redirects with cookie preservation and virus warning bypass
export function downloadUpdateFile(
    url: string,
    onProgress?: (progress: DownloadProgress) => void,
    maxRedirects: number = 10,
    cookieJar: string = ''
): Promise<string> {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

        const formattedUrl = formatGoogleDriveUrl(url);
        const parsedUrl = new URL(formattedUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*'
        };
        if (cookieJar) {
            headers['Cookie'] = cookieJar;
        }

        const req = protocol.get(formattedUrl, { headers }, (res) => {
            // Collect cookies
            let updatedCookieJar = cookieJar;
            const rawCookies = res.headers['set-cookie'];
            if (rawCookies) {
                const newCookies = Array.isArray(rawCookies) 
                    ? rawCookies.map((c: string) => c.split(';')[0]).join('; ')
                    : String(rawCookies).split(';')[0];
                updatedCookieJar = updatedCookieJar ? `${updatedCookieJar}; ${newCookies}` : newCookies;
            }

            // Handle HTTP redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, formattedUrl).href;
                }
                return resolve(downloadUpdateFile(redirectUrl, onProgress, maxRedirects - 1, updatedCookieJar));
            }

            if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
                return reject(new Error(`Download failed with status ${res.statusCode}`));
            }

            const contentType = res.headers['content-type'] || '';

            // Handle Google Drive virus scan confirmation page for large files
            if (contentType.includes('text/html')) {
                let htmlData = '';
                res.on('data', chunk => htmlData += chunk);
                res.on('end', () => {
                    const linkMatch = htmlData.match(/id="uc-download-link"\s+href="([^"]+)"/i) 
                        || htmlData.match(/href="(\/uc\?export=download[^"]+)"/i)
                        || htmlData.match(/action="([^"]+)"[^>]*id="download-form"/i)
                        || htmlData.match(/action="([^"]+download[^"]*)"/i);

                    const confirmMatch = htmlData.match(/name="confirm"\s+value="([^"]+)"/i)
                        || htmlData.match(/confirm=([a-zA-Z0-9_-]+)/i);

                    if (linkMatch && linkMatch[1]) {
                        let nextUrl = linkMatch[1].replace(/&amp;/g, '&');
                        if (!nextUrl.startsWith('http')) {
                            nextUrl = new URL(nextUrl, formattedUrl).href;
                        }
                        return resolve(downloadUpdateFile(nextUrl, onProgress, maxRedirects - 1, updatedCookieJar));
                    } else if (confirmMatch && confirmMatch[1]) {
                        const idMatch = formattedUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || formattedUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                        if (idMatch) {
                            const nextUrl = `https://drive.usercontent.google.com/download?id=${idMatch[1]}&export=download&confirm=${confirmMatch[1]}`;
                            return resolve(downloadUpdateFile(nextUrl, onProgress, maxRedirects - 1, updatedCookieJar));
                        }
                    }

                    reject(new Error('Google Drive requires confirmation: please download via browser'));
                });
                return;
            }

            const totalBytes = parseInt(res.headers['content-length'] as string, 10) || 0;
            let receivedBytes = 0;

            const tempDir = os.tmpdir();
            const destPath = path.join(tempDir, `quran_app_update_${Date.now()}.exe`);
            const fileStream = fs.createWriteStream(destPath);

            res.on('data', chunk => {
                receivedBytes += chunk.length;
                if (typeof onProgress === 'function') {
                    const percent = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;
                    onProgress({ percent, receivedBytes, totalBytes });
                }
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close(() => {
                    // Verify Windows PE binary ('MZ' signature)
                    try {
                        const buffer = Buffer.alloc(2);
                        const fd = fs.openSync(destPath, 'r');
                        fs.readSync(fd, buffer, 0, 2, 0);
                        fs.closeSync(fd);
                        if (buffer.toString('ascii') !== 'MZ') {
                            fs.unlink(destPath, () => {});
                            return reject(new Error('Downloaded file is not a valid Windows executable.'));
                        }
                    } catch (e: any) {
                        return reject(new Error(`Failed to verify executable: ${e.message}`));
                    }
                    resolve(destPath);
                });
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
export function installAndRestart(installerPath: string): void {
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
