// Platform Bridge — Electron (desktop) vs Capacitor (Android)
//
// Imported first by app.ts. On Android it:
//   1. Patches `window.fetch` so every existing call in the codebase goes through
//      the native HTTP bridge (the WebView enforces CORS, the native layer does not).
//   2. Installs a `window.desktopAPI` shim with the exact same surface the Electron
//      preload exposed, so no other module has to change.
//
// Capacitor plugins are reached through `window.Capacitor.Plugins.*` (the runtime
// registry the native bridge populates) rather than static imports, so this module
// stays free of Capacitor code and the Electron build is unaffected.

// Injected by esbuild `define` from update-channel.json. Declared rather than imported
// so it stays a plain constant in the bundle: no JSON module, no runtime fetch, and no
// second copy of the URL to keep in sync. Both build.js and build-android.js define it.
// May legitimately be empty: the channel is then discovered at runtime, see
// UPDATE_CHANNEL_CANDIDATES below.
declare const __ANDROID_UPDATE_URL__: string;

const g: any = window as any;

// Runtime channel discovery for Android. Kept in its own module so the candidate
// list and the manifest validation can be unit-tested without a WebView.
import { discoverAndroidManifest } from './update-discovery';

const plugin = (name: string): any | null => {
    const p = g.Capacitor && g.Capacitor.Plugins ? g.Capacitor.Plugins[name] : null;
    return p || null;
};

export const isNativePlatform = (): boolean =>
    !!(g.Capacitor && typeof g.Capacitor.isNativePlatform === 'function' && g.Capacitor.isNativePlatform());

// Mirrors src/main/updater.ts isNewerVersion() so both platforms agree.
const isNewerVersion = (latest: string, current: string): boolean => {
    const parse = (v: string) => String(v || '').trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const a = parse(latest);
    const b = parse(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x > y) return true;
        if (x < y) return false;
    }
    return false;
};

// The update manifest is hosted on Google Drive, whose /view link returns an HTML
// page. Rewrite it to the direct download endpoint, like src/main/updater.ts and
// the native ApkUpdaterPlugin both do.
const toDirectDownloadUrl = (url: string): string => {
    if (!/drive\.google\.com/.test(url)) return url;
    let id: string | null = null;
    const m = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/);
    if (m) id = m[1];
    if (!id) {
        const q = url.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
        if (q) id = q[1];
    }
    if (!id) return url;
    return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
};

// True when a URL is *provably* not an APK, so it can be rejected before any bytes
// are downloaded.
//
// This deliberately does NOT try to prove a Drive link IS an APK. A Drive file id
// is opaque, so the previous version of this check accepted any drive.google.com
// link, which meant the desktop manifest — whose downloadUrl is the Windows .exe
// installer — passed the "android-requires-apk" guard and offered an .exe to the
// Android package installer. Positive confirmation that a URL is an APK is done by
// the native plugin, which inspects the downloaded bytes and the signer.
const looksLikeApk = (url: string): boolean => {
    if (!url) return false;
    const withoutQuery = url.split('?')[0].split('#')[0];

    // An explicit .apk extension is proof. An explicit other archive-ish extension
    // (.exe, .msi, .zip, .dmg) is proof of the opposite.
    if (/\.apk$/i.test(withoutQuery)) return true;
    if (/\.(exe|msi|bat|cmd|com|scr|dmg|deb|rpm|pkg)$/i.test(withoutQuery)) return false;

    // Unknown, opaque link: assume it may be an APK and let the native side verify.
    return true;
};

export const Platform = {
    name: isNativePlatform() ? 'android' : 'desktop',

    /**
     * Where Android looks for its update manifest.
     *
     * This used to be hardcoded empty, which made self-update impossible in practice:
     * every user had to paste the manifest URL into Settings by hand, on every device,
     * and nothing was ever checked automatically.
     *
     * It now comes from update-channel.json, injected at build time by the bundler and
     * written back there by `node scripts/upload-to-drive.js --android`. The desktop
     * build injects the same constant so the renderer never throws on a missing define;
     * the desktop channel keeps its own URL in UpdaterModule because it serves a .exe.
     */
    defaultUpdateUrl: __ANDROID_UPDATE_URL__,

    // ==========================================================
    // 1. NATIVE FETCH BRIDGE (Android only)
    // ==========================================================
    installNativeFetch(capacitorHttp: any): void {
        if (this.name !== 'android' || !capacitorHttp || g.__quranFetchPatched) return;
        g.__quranFetchPatched = true;

        // Keep the real fetch: the fallback below must not call the patched one.
        const webFetch: typeof fetch = g.fetch.bind(window);

        g.fetch = async (input: any, init: any = {}): Promise<Response> => {
            const url: string = typeof input === 'string' ? input : (input && input.url) || '';
            const method: string = String(init.method || (input && input.method) || 'GET').toUpperCase();

            const params: any = {
                url,
                method,
                headers: {},
                connectTimeout: 15000,
                readTimeout: 30000
            };

            if (init.headers) {
                if (typeof init.headers.forEach === 'function') {
                    init.headers.forEach((v: string, k: string) => { params.headers[k] = v; });
                } else {
                    Object.keys(init.headers).forEach(k => { params.headers[k] = init.headers[k]; });
                }
            }

            const body = init.body;
            const isTextBody = typeof body === 'string'
                || (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams);

            if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
                if (isTextBody) {
                    params.data = typeof body === 'string' ? body : body.toString();
                } else {
                    // FormData / Blob: unused by this app, keep the WebView path.
                    return webFetch(input as any, init);
                }
            }

            const res = await capacitorHttp.request(params);
            const status: number = typeof res.status === 'number' ? res.status : 0;

            // CapacitorHttp already parsed JSON responses into objects, so the
            // payload has to be re-serialised before a Response can carry it.
            let payload = res.data;
            if (payload === undefined || payload === null) {
                payload = '';
            } else if (typeof payload !== 'string') {
                payload = JSON.stringify(payload);
            }

            // Rebuild a real Response so `.ok` / `.json()` / `.text()` keep working.
            return new Response(payload, {
                status,
                statusText: String(res.statusText || ''),
                headers: res.headers || {}
            });
        };
    },

    // ==========================================================
    // 2. desktopAPI SHIM (Android only)
    // ==========================================================
    installDesktopApiShim(): void {
        if (this.name !== 'android') return;
        if (g.desktopAPI) return; // a real preload already provided one

        const log = (scope: string, err: any) => console.error(`[platform:${scope}]`, err);
        const warn = (scope: string, err: any) => console.warn(`[platform:${scope}]`, err);
        const fallbackToast = (title: string, body: string) => {
            if (g.App && g.App.showToast) g.App.showToast(`${title}\n${body}`, 6000);
        };

        g.desktopAPI = {
            platform: 'android',

            async getAppVersion(): Promise<string> {
                try {
                    const app = plugin('App');
                    const info = app ? await app.getInfo() : null;
                    return (info && info.version) || g.__APP_VERSION__ || '1.0.4';
                } catch (err) {
                    log('getAppVersion', err);
                    return g.__APP_VERSION__ || '1.0.4';
                }
            },

            async showNotification(title: string, body: string): Promise<boolean> {
                try {
                    const notif = plugin('LocalNotifications');
                    if (!notif) throw new Error('LocalNotifications plugin unavailable');

                    const perm = await notif.requestPermissions();
                    const display = perm && perm.display ? perm.display : perm;
                    if (display !== 'granted') {
                        fallbackToast(title, body);
                        return false;
                    }
                    await notif.schedule({
                        notifications: [{
                            id: Math.floor(Math.random() * 100000),
                            title,
                            body,
                            schedule: { at: new Date(Date.now() + 300) }
                        }]
                    });
                    return true;
                } catch (err) {
                    log('showNotification', err);
                    fallbackToast(title, body);
                    return false;
                }
            },

            async openExternalUrl(url: string): Promise<boolean> {
                try {
                    const browser = plugin('Browser');
                    if (browser) {
                        await browser.open({ url });
                        return true;
                    }
                    const app = plugin('App');
                    if (app) {
                        await app.openUrl({ url });
                        return true;
                    }
                    g.open(url, '_system');
                    return false;
                } catch (err) {
                    log('openExternalUrl', err);
                    try {
                        g.open(url, '_system');
                    } catch (_) { /* nothing else to try */ }
                    return false;
                }
            },

            // Window management has no meaning on Android. Kept so the rest of the
            // codebase is unchanged; minimize/exit map to real app behaviour.
            async minimize(): Promise<void> {
                try {
                    const app = plugin('App');
                    if (app) await app.minimizeApp();
                } catch (err) { log('minimize', err); }
            },
            async maximize(): Promise<void> { /* no-op on Android */ },
            async close(): Promise<void> {
                try {
                    const app = plugin('App');
                    if (app) await app.exitApp();
                } catch (err) { log('close', err); }
            },
            async isMaximized(): Promise<boolean> { return true; },

            // No tray on Android: the same destinations live in the top bar.
            onNavigate(_callback: (destination: string) => void): void { /* no-op */ },
            onDownloadProgress(_callback: (progress: any) => void): void { /* handled in downloadUpdate */ },

            // ---- Auto-update ----
            async checkForUpdates(url: string): Promise<any> {
                try {
                    const currentVersion = g.UpdaterModule
                        ? g.UpdaterModule.currentVersion
                        : (g.__APP_VERSION__ || '1.0.4');

                    let raw: string;

                    // Android resolves its manifest at runtime from an ordered list of
                    // known public locations, so publishing a new manifest is enough and
                    // no URL has to be stored in the APK or typed on the device. The
                    // desktop keeps its explicit URL: it serves an .exe and is not
                    // distributed through this path.
                    if (Platform.name === 'android' && !url) {
                        const discovered = await discoverAndroidManifest(plugin, Platform.defaultUpdateUrl);
                        if (!discovered) {
                            return {
                                success: false,
                                hasUpdate: false,
                                currentVersion,
                                error: 'channel-not-found'
                            };
                        }
                        log('checkForUpdates', 'canal trouvé sur ' + discovered.source);
                        raw = JSON.stringify(discovered);
                    } else {
                        const target = toDirectDownloadUrl(url);
                        const http = plugin('CapacitorHttp');
                        if (http) {
                            const res = await http.request({ url: target, method: 'GET', headers: {}, readTimeout: 15000 });
                            raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                        } else {
                            const res = await fetch(target);
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            raw = await res.text();
                        }
                    }

                    if (raw.trimStart().startsWith('<')) {
                        throw new Error('HTML reçu au lieu du manifeste de mise à jour');
                    }

                    const info = JSON.parse(raw);

                    // `this` inside these methods is the desktopAPI object, not
                    // Platform, so the platform name is read from the closure.
                    if (Platform.name === 'android' && info.downloadUrl && !looksLikeApk(info.downloadUrl)) {
                        // The manifest is the desktop one; an .exe is not installable here.
                        return {
                            success: true,
                            hasUpdate: false,
                            currentVersion,
                            latestVersion: info.version,
                            error: 'android-requires-apk'
                        };
                    }

                    // Self-declared channel guard. Drive file ids are opaque, so an
                    // extension check cannot tell the desktop manifest from the
                    // Android one when both are hosted as Drive links; without this
                    // the Android build would happily read a manifest whose
                    // downloadUrl is a Windows installer and offer it for install.
                    if (Platform.name === 'android' && info.platform && info.platform !== 'android') {
                        return {
                            success: true,
                            hasUpdate: false,
                            currentVersion,
                            latestVersion: info.version,
                            error: 'wrong-channel'
                        };
                    }

                    return {
                        success: true,
                        hasUpdate: isNewerVersion(info.version, currentVersion),
                        currentVersion,
                        latestVersion: info.version,
                        releaseDate: info.releaseDate,
                        downloadUrl: info.downloadUrl,
                        changelog: info.changelog
                    };
                } catch (err: any) {
                    // A failed background check is normal (no network, manifest moved).
                    warn('checkForUpdates', err);
                    return {
                        success: false,
                        hasUpdate: false,
                        error: String(err && err.message ? err.message : err)
                    };
                }
            },

            async downloadUpdate(downloadUrl: string): Promise<{ success: boolean; error?: string }> {
                if (!looksLikeApk(downloadUrl)) {
                    return { success: false, error: 'Le lien de mise à jour ne pointe pas vers un fichier APK' };
                }
                let handle: any = null;
                try {
                    const updater = plugin('ApkUpdater');
                    if (!updater) throw new Error('ApkUpdater plugin unavailable');

                    if (typeof updater.addListener === 'function') {
                        handle = await updater.addListener('apkUpdaterProgress', (data: any) => {
                            if (g.UpdaterModule) g.UpdaterModule.updateDownloadProgress(data || {});
                        });
                    }

                    const res = await updater.downloadAndInstall({ url: downloadUrl });
                    return { success: !!(res && res.success), error: res && res.error };
                } catch (err: any) {
                    log('downloadUpdate', err);
                    return { success: false, error: String(err && err.message ? err.message : err) };
                } finally {
                    if (handle && typeof handle.remove === 'function') {
                        try { await handle.remove(); } catch (_) { /* listener already gone */ }
                    }
                }
            }
        };
    },

    init(): void {
        if (this.name === 'android') {
            this.installNativeFetch(plugin('CapacitorHttp'));
            this.installDesktopApiShim();

            const badge = document.getElementById('brandPlatformBadge');
            if (badge) badge.textContent = 'تطبيق الجوال';
        }
    }
};

Platform.init();
g.Platform = Platform;
