// Headless smoke test for the Android web bundle.
//
// Serves ./www over HTTP and loads it in headless Chrome with the Capacitor
// bridge faked, so the native code paths (desktopAPI shim + native fetch) get
// exercised the same way they do inside the APK's WebView. Fails on any console
// error, page error, or a broken interaction.
//
// Usage: node scripts/smoke-test.js
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const wwwDir = path.join(rootDir, 'www');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 8931;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.json': 'application/json'
};

// Stands in for the update manifest so the whole updater path (fetch -> version
// compare -> APK guard) can run without depending on Google Drive.
const TEST_MANIFESTS = {
    '/test-manifest.json': {
        version: '99.0.0',
        releaseDate: '2026-09-29',
        downloadUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
        changelog: 'test manifest (apk)'
    },
    '/test-manifest-exe.json': {
        version: '99.0.0',
        releaseDate: '2026-09-29',
        downloadUrl: 'https://example.com/Quran_App_Setup_99.0.0.exe',
        changelog: 'desktop manifest (exe)'
    }
};

function serve() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);

            if (TEST_MANIFESTS[urlPath]) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(TEST_MANIFESTS[urlPath]));
                return;
            }

            let file = path.join(wwwDir, urlPath === '/' ? 'index.html' : urlPath);
            if (!file.startsWith(wwwDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            fs.createReadStream(file).pipe(res);
        });
        server.listen(PORT, () => resolve(server));
    });
}

async function main() {
    if (!fs.existsSync(wwwDir)) {
        console.error("❌ ./www introuvable — lance d'abord `npm run android:sync`.");
        process.exit(1);
    }
    if (!fs.existsSync(CHROME)) {
        console.error(`❌ Chrome introuvable : ${CHROME}`);
        process.exit(1);
    }

    const server = await serve();
    // Unique per run: a profile from a previous run may still be locked.
    const userDataDir = path.join(process.env.TEMP, `quran-smoke-${process.pid}-${Date.now()}`);

    const chrome = spawn(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        // The player calls audio.play() without a real user gesture in the harness.
        '--autoplay-policy=no-user-gesture-required',
        '--remote-debugging-port=9333',
        `--user-data-dir=${userDataDir}`,
        'about:blank'
    ], { stdio: 'ignore' });

    let wsUrl = null;
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
            const res = await fetch('http://127.0.0.1:9333/json/version');
            wsUrl = (await res.json()).webSocketDebuggerUrl;
            if (wsUrl) break;
        } catch (_) { /* not up yet */ }
    }
    if (!wsUrl) {
        console.error("❌ Chrome headless n'a pas démarré");
        chrome.kill();
        server.close();
        process.exit(1);
    }

    const { WebSocket } = require('ws');
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const consoleErrors = [];
    const pageErrors = [];

    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const msgId = ++id;
        const timer = setTimeout(() => {
            pending.delete(msgId);
            reject(new Error(`CDP timeout: ${method}`));
        }, 30000);
        pending.set(msgId, (v) => { clearTimeout(timer); resolve(v); });
        ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    });

    // The listener must be attached before the first send(), otherwise the
    // replies are dropped and every await below hangs forever.
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg.result || {});
            pending.delete(msg.id);
            return;
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            pageErrors.push(msg.params.exceptionDetails.exception?.description
                || msg.params.exceptionDetails.text);
        }
    });

    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    await send('Runtime.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    // Phone-sized viewport, so the drawer layout and mobile.css are what runs.
    await send('Emulation.setDeviceMetricsOverride', {
        width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true
    }, sessionId);

    // Fake the Capacitor bridge BEFORE the app bundle runs.
    await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            window.__smoke = { notifications: [], downloads: [], openedUrls: [] };
            // Captured before app.js runs, because the app patches window.fetch.
            const realFetch = window.fetch.bind(window);
            window.Capacitor = {
                isNativePlatform: () => true,
                getPlatform: () => 'android',
                Plugins: {
                    CapacitorHttp: {
                        request: async (opts) => {
                            const r = await realFetch(opts.url, { headers: opts.headers });
                            const text = await r.text();
                            let data = text;
                            try { data = JSON.parse(text); } catch (e) { /* keep text */ }
                            return { status: r.status, headers: r.headers, url: opts.url, data };
                        }
                    },
                    LocalNotifications: {
                        requestPermissions: async () => ({ display: 'granted' }),
                        schedule: async (o) => { window.__smoke.notifications.push(o); }
                    },
                    Browser: { open: async (o) => { window.__smoke.openedUrls.push(o.url); } },
                    App: { getInfo: async () => ({ version: '1.0.4' }), openUrl: async () => {} },
                    ApkUpdater: {
                        addListener: async () => ({ remove: async () => {} }),
                        downloadAndInstall: async (o) => { window.__smoke.downloads.push(o); return { success: true }; }
                    }
                }
            };
        `
    }, sessionId);

    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` }, sessionId);
    await new Promise(r => setTimeout(r, 9000));

    // `expression` must evaluate to a JSON *string*: CDP has no structured
    // cloning, so each interaction stringifies its own result.
    const evaluate = async (expression) => {
        const res = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
        }, sessionId);
        if (res.exceptionDetails) {
            throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
        }
        return res.result?.value;
    };

    const probe = JSON.parse(await evaluate(`JSON.stringify({
        platform: window.Platform && window.Platform.name,
        hasApi: !!window.desktopAPI,
        appReady: !!window.App,
        quran: !!window.QuranModule,
        player: !!window.PlayerModule,
        adhkar: !!window.AdhkarModule,
        icons: document.querySelectorAll('svg.lucide').length,
        unrenderedIcons: document.querySelectorAll('i[data-lucide]').length,
        surahItems: document.querySelectorAll('.surah-list-item').length,
        ayahCards: document.querySelectorAll('.ayah-card').length,
        contentLength: (document.getElementById('quranContent') || {}).textContent?.trim().length || 0,
        fontLoaded: document.fonts ? document.fonts.check('16px Amiri') : 'n/a',
        drawerScrim: !!document.getElementById('sidebarScrim'),
        mobileCssLoaded: [...document.styleSheets].some(s => (s.href || '').includes('mobile.css'))
    })`));

    // ---- recitation audio: remote stream + official verse timings ----
    const audio = JSON.parse(await evaluate(`(async () => {
        try { await window.PlayerModule.playSurah(1, 'alafasy'); } catch (e) { return { error: String(e) }; }
        const a = window.PlayerModule.audio || {};
        return {
            src: a.src || '',
            remote: /^https:\\/\\//.test(a.src || ''),
            timings: (window.PlayerModule.ayahTimings || []).length
        };
    })().then(JSON.stringify)`));

    // ---- tafsir through the native fetch bridge ----
    const tafsir = JSON.parse(await evaluate(`(async () => {
        try { await window.TafsirModule.openTafsir(1, 1); } catch (e) { return { error: String(e) }; }
        const box = document.querySelector('.tafsir-text-content');
        return {
            open: document.getElementById('tafsirDrawer').classList.contains('open'),
            length: box ? box.textContent.trim().length : 0
        };
    })().then(JSON.stringify)`));

    // ---- notification through the Capacitor plugin ----
    const notification = JSON.parse(await evaluate(`(async () => {
        const returned = await window.desktopAPI.showNotification('test', 'body');
        return { returned: returned, scheduled: window.__smoke.notifications.length };
    })().then(JSON.stringify)`));

    // ---- update flow with an APK manifest ----
    const updateApk = JSON.parse(await evaluate(`(async () => {
        const r = await window.desktopAPI.checkForUpdates('http://127.0.0.1:${PORT}/test-manifest.json');
        return { hasUpdate: r.hasUpdate, latest: r.latestVersion, url: r.downloadUrl };
    })().then(JSON.stringify)`));

    // ---- a desktop .exe manifest must be rejected on Android ----
    const updateExe = JSON.parse(await evaluate(`(async () => {
        const r = await window.desktopAPI.checkForUpdates('http://127.0.0.1:${PORT}/test-manifest-exe.json');
        return { hasUpdate: r.hasUpdate, error: r.error || '' };
    })().then(JSON.stringify)`));

    // ---- the sidebar drawer toggles on a phone-sized viewport ----
    const drawer = JSON.parse(await evaluate(`JSON.stringify((() => {
        const isDrawer = window.App.isDrawerLayout();
        window.App.toggleSidebar();
        const opensOnToggle = document.body.classList.contains('sidebar-open');
        window.App.toggleSidebar();
        return { isDrawer: isDrawer, opensOnToggle: opensOnToggle };
    })())`));

    // ---- APK install path reaches the native plugin ----
    const install = JSON.parse(await evaluate(`(async () => {
        const r = await window.desktopAPI.downloadUpdate('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view');
        return { success: r.success, calls: window.__smoke.downloads.length };
    })().then(JSON.stringify)`));

    // ---- the five shortcuts live in the drawer with readable text ----
    // Regression guard: at phone width .nav-btn sets font-size:0, so the top-bar
    // copies of these five showed as unlabelled icons. They must be hidden there
    // and present in the tools tab, with a title whose text is not collapsed and
    // a row tall enough to tap.
    const toolsTab = JSON.parse(await evaluate(`JSON.stringify((() => {
        const labels = ['الكهف', 'الصباح', 'المساء', 'مسبحة', 'قراءتي'];
        const hiddenInTopBar = Array.from(document.querySelectorAll('.nav-desktop-only'))
            .filter(el => getComputedStyle(el).display !== 'none').length;

        window.App.switchSidebarTab('tools');
        const view = document.getElementById('sidebarToolsView');
        const rows = Array.from(document.querySelectorAll('#sidebarToolsView .tool-row'));
        // Read the visibility while the tab is still open: switching back to the
        // surah index hides the view again.
        const viewVisible = !!view && getComputedStyle(view).display !== 'none';

        const titles = rows.map(r => {
            const t = r.querySelector('.tool-row-title');
            return t ? t.textContent.trim() : '';
        });

        // font-size:0 is how the top bar hid its labels, so assert a real size here.
        const smallestTitleFont = rows.length ? Math.min(...rows.map(r => {
            const t = r.querySelector('.tool-row-title');
            return t ? parseFloat(getComputedStyle(t).fontSize) : 0;
        })) : 0;

        const shortestRow = rows.length ? Math.min(...rows.map(r => r.getBoundingClientRect().height)) : 0;

        window.App.switchSidebarTab('surahs');
        return {
            hiddenInTopBar,
            viewVisible,
            rowCount: rows.length,
            foundLabels: labels.filter(l => titles.some(t => t.includes(l))).length,
            smallestTitleFont,
            shortestRow,
            subLength: (rows[0] && rows[0].querySelector('.tool-row-sub')
                ? rows[0].querySelector('.tool-row-sub').textContent.trim().length : 0)
        };
    })())`));

    const smoke = JSON.parse(await evaluate('JSON.stringify(window.__smoke)'));

    ws.close();
    chrome.kill();
    server.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* profile may still be held */ }

    console.log('\n--- état de l\'app ---');
    console.log(JSON.stringify(probe, null, 2));
    console.log('\n--- interactions ---');
    console.log('audio       ', JSON.stringify(audio));
    console.log('tafsir      ', JSON.stringify(tafsir));
    console.log('notification', JSON.stringify(notification));
    console.log('update(apk) ', JSON.stringify(updateApk));
    console.log('update(exe) ', JSON.stringify(updateExe));
    console.log('install(apk)', JSON.stringify(install));
    console.log('drawer      ', JSON.stringify(drawer));
    console.log('toolsTab    ', JSON.stringify(toolsTab));
    console.log('plugin calls', JSON.stringify(smoke));

    const problems = [];
    if (probe.platform !== 'android') problems.push('Platform bridge non activé');
    if (!probe.hasApi) problems.push('desktopAPI shim absent');
    if (!probe.appReady || !probe.quran || !probe.player) problems.push('modules non initialisés');
    if (probe.unrenderedIcons > 0) problems.push(`${probe.unrenderedIcons} icônes lucide non rendues`);
    if (probe.surahItems !== 114) problems.push(`index des sourates = ${probe.surahItems} (attendu 114)`);
    if (!probe.ayahCards) problems.push("aucune carte d'ayah rendue (texte du Coran non chargé)");
    if (!probe.drawerScrim) problems.push('scrim du drawer absent');
    if (!probe.mobileCssLoaded) problems.push('mobile.css non chargé');
    if (probe.fontLoaded === false) problems.push('police Amiri non chargée');

    if (!audio.remote) problems.push(`audio non streamé en distant (${audio.src || audio.error || 'src vide'})`);
    if (!audio.timings) problems.push('timestamps des versets non chargés');
    if (!tafsir.open || !tafsir.length) problems.push('tafsir non chargé via le pont HTTP natif');
    if (!notification.returned || !notification.scheduled) problems.push('notification locale non planifiée');
    if (!updateApk.hasUpdate || updateApk.latest !== '99.0.0') problems.push('détection de mise à jour APK KO');
    if (updateExe.hasUpdate || updateExe.error !== 'android-requires-apk') problems.push("un manifeste .exe n'a pas été rejeté");
    if (!install.success || install.calls < 1) problems.push("le téléchargement d'APK n'atteint pas le plugin natif");
    if (!drawer.isDrawer || !drawer.opensOnToggle) problems.push("le drawer ne s'ouvre pas sur viewport étroit");

    // The five shortcuts must be gone from the top bar and readable in the drawer.
    if (toolsTab.hiddenInTopBar !== 0) problems.push(`${toolsTab.hiddenInTopBar} raccourci(s) encore visible(s) dans la barre du haut`);
    if (!toolsTab.viewVisible) problems.push("l'onglet outils ne s'affiche pas dans le drawer");
    if (toolsTab.rowCount !== 5) problems.push(`onglet outils = ${toolsTab.rowCount} lignes (attendu 5)`);
    if (toolsTab.foundLabels !== 5) problems.push(`${toolsTab.foundLabels}/5 libellés trouvés dans l'onglet outils`);
    if (!(toolsTab.smallestTitleFont > 0)) problems.push('titre des outils à font-size 0 (texte masqué)');
    if (toolsTab.shortestRow < 44) problems.push(`ligne d'outil trop petite pour le tactile (${toolsTab.shortestRow}px)`);
    if (!toolsTab.subLength) problems.push('sous-titre des outils vide');
    if (consoleErrors.length) problems.push(`${consoleErrors.length} erreur(s) console`);
    if (pageErrors.length) problems.push(`${pageErrors.length} exception(s)`);

    if (consoleErrors.length) {
        console.log('\n--- erreurs console ---');
        consoleErrors.slice(0, 15).forEach(e => console.log('  ! ' + e));
    }
    if (pageErrors.length) {
        console.log('\n--- exceptions ---');
        pageErrors.slice(0, 15).forEach(e => console.log('  ! ' + e));
    }

    console.log('');
    if (problems.length) {
        console.error('❌ ' + problems.join(' | '));
        process.exit(1);
    }
    console.log('✅ Smoke test OK');
}

main()
    .catch((err) => {
        console.error('❌ Smoke test crashed:', err);
        process.exit(1);
    })
    .then(() => process.exit(process.exitCode || 0));
