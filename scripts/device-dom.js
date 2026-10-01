// Inspects the live WebView of the installed app over the Chrome DevTools
// Protocol. Unlike logcat checks, this sees what the device actually rendered:
// DOM size, loaded fonts, viewport, and real plugin calls.
//
// Needs android.webContentsDebuggingEnabled in capacitor.config.json.
//   node scripts/device-dom.js [--connect 127.0.0.1:62001]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const ROOT = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const SDK_ADB = path.join(ROOT, 'platform-tools', 'adb.exe');
const PKG = 'com.quran.creator';
const PORT = 9444;
const args = process.argv.slice(2);

// A vendor adb client and the running adb server must be the same build,
// otherwise each invocation evicts the other and the device flaps.
function pickAdb() {
    if (process.env.ADB) return process.env.ADB;
    const roots = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']
        .map(e => process.env[e]).filter(Boolean)
        .concat(fs.existsSync('D:\\') ? ['D:\\Program Files'] : []);
    const rel = [['Nox', 'bin', 'nox_adb.exe'], ['Nox', 'bin', 'adb.exe'], ['ldplayer', 'LDPlayer9', 'adb.exe']];
    for (const r of roots) for (const parts of rel) {
        const p = path.join(r, ...parts);
        if (!fs.existsSync(p)) continue;
        const o = spawnSync(p, ['devices'], { encoding: 'utf8' });
        if (/^\S+\s+device/m.test(o.stdout || '')) return p;
    }
    return SDK_ADB;
}

const ADB = pickAdb();
const adb = (...a) => {
    const r = spawnSync(ADB, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return (r.stdout || '') + (r.stderr || '');
};
const step = m => console.log(`\n▶ ${m}`);
const ok = m => console.log(`  ✓ ${m}`);
const bad = m => console.log(`  ✗ ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const serialOf = () => (adb('devices').split('\n').find(l => /^\S+\s+device/m.test(l.trim())) || '').trim().split(/\s+/)[0] || null;

(async () => {
    let serial = serialOf();
    const c = args.includes('--connect') ? args[args.indexOf('--connect') + 1] : null;
    if (c) {
        adb('connect', c.includes(':') ? c : `127.0.0.1:${c}`);
        await sleep(2000);
        serial = serialOf();
    }
    if (!serial) throw new Error('aucun appareil adb');
    ok(`appareil ${serial} (adb: ${path.basename(ADB)})`);

    const pid = adb('-s', serial, 'shell', 'pidof', PKG).trim().split(/\s+/)[0];
    if (!pid) throw new Error(`${PKG} n'est pas lancé`);
    ok(`pid ${pid}`);

    step('connexion CDP au WebView');
    adb('-s', serial, 'forward', '--remove-all');
    adb('-s', serial, 'forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
    await sleep(1500);
    const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const page = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl);
    if (!page) throw new Error('aucune page WebView');
    ok(`url ${page.url}`);

    const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
    let id = 0;
    const pending = new Map();
    const errors = [];
    const netFail = [];

    ws.on('message', raw => {
        const m = JSON.parse(raw);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
            const e = m.params.entry;
            errors.push(e.url ? `${e.text} <- ${e.url}` : e.text);
        }
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
        }
        if (m.method === 'Runtime.exceptionThrown') {
            errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
        }
        if (m.method === 'Network.loadingFailed') netFail.push(`${m.params.type}: ${m.params.errorText}`);
    });

    const send = (method, params = {}) => new Promise((res, rej) => {
        const mid = ++id;
        const t = setTimeout(() => { pending.delete(mid); rej(new Error('timeout ' + method)); }, 60000);
        pending.set(mid, m => { clearTimeout(t); res(m.result || {}); });
        ws.send(JSON.stringify({ id: mid, method, params }));
    });

    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');

    const ev = async expr => {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result?.value;
    };
    const J = async expr => JSON.parse(await ev(expr));

    step('DOM sur l\'appareil');
    const probe = await J(`JSON.stringify({
        platform: window.Platform && window.Platform.name,
        api: !!window.desktopAPI, app: !!window.App, quran: !!window.QuranModule,
        player: !!window.PlayerModule, adhkar: !!window.AdhkarModule,
        icons: document.querySelectorAll('svg.lucide').length,
        unrendered: document.querySelectorAll('i[data-lucide]').length,
        surahs: document.querySelectorAll('.surah-list-item').length,
        ayahs: document.querySelectorAll('.ayah-card').length,
        textLen: (document.getElementById('quranContent')||{}).textContent?.trim().length || 0,
        fontAmiri: document.fonts ? document.fonts.check('16px Amiri') : 'n/a',
        mobileCss: [...document.styleSheets].some(s => (s.href||'').includes('mobile.css')),
        scrim: !!document.getElementById('sidebarScrim'),
        w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio,
        online: navigator.onLine,
        ua: navigator.userAgent.replace(/^.*(Chrome\\/[^ ]+).*$/, '$1').slice(0, 40),
        ls: Object.keys(localStorage).length
    })`);
    for (const [k, v] of Object.entries(probe)) console.log(`  ${k.padEnd(11)} ${v}`);

    step('interactions réelles');
    const audio = await J(`(async()=>{
        try{ await window.PlayerModule.playSurah(1,'alafasy'); }catch(e){ return {error:String(e)}; }
        const a = window.PlayerModule.audio||{};
        return { src:a.src||'', remote:/^https:/.test(a.src||''), timings:(window.PlayerModule.ayahTimings||[]).length };
    })().then(JSON.stringify)`);
    console.log('  audio        ' + JSON.stringify(audio));

    const tafsir = await J(`(async()=>{
        try{ await window.TafsirModule.openTafsir(1,1); }catch(e){ return {error:String(e)}; }
        const b=document.querySelector('.tafsir-text-content');
        return { open:document.getElementById('tafsirDrawer').classList.contains('open'), len:b?b.textContent.trim().length:0 };
    })().then(JSON.stringify)`);
    console.log('  tafsir       ' + JSON.stringify(tafsir));

    const drawer = await J(`JSON.stringify((()=>{
        const isDrawer=window.App.isDrawerLayout();
        window.App.toggleSidebar();
        const open=document.body.classList.contains('sidebar-open');
        window.App.toggleSidebar();
        return { isDrawer:isDrawer, opens:open };
    })())`);
    console.log('  drawer       ' + JSON.stringify(drawer));

    const fonts = await J(`(async()=>{
        try { await document.fonts.ready; } catch(e) {}
        const names=[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+'/'+f.weight+'/'+f.style);
        return { loaded:names.length, unique:[...new Set(names.map(n=>n.split('/')[0]))].length, sample:names.slice(0,4) };
    })().then(JSON.stringify)`);
    console.log('  polices      ' + JSON.stringify(fonts));

    step('erreurs et réseau');
    // Capacitor's own SystemBars plugin injects --safe-area-inset-* with
    // document.documentElement, which is null until the document is parsed. It
    // is caught upstream, but it fires on every inset change during startup and
    // is not ours to fix; mobile.css falls back to env()/0 in that case.
    const BENIGN = /Error injecting safe area CSS/;
    const realErrors = errors.filter(e => !BENIGN.test(e));
    const benign = errors.length - realErrors.length;
    if (realErrors.length) realErrors.slice(0, 10).forEach(e => bad(e.slice(0, 180)));
    else ok('aucune erreur console');
    if (benign) console.log(`  (${benign} avertissement(s) connu(s) de Capacitor : injection safe-area)`);
    if (netFail.length) {
        [...new Set(netFail)].slice(0, 10).forEach(e => bad('requête échouée ' + e));
    } else ok('aucune requête réseau échouée');

    ws.close();
    console.log('');
    const bad2 = [];
    if (probe.platform !== 'android') bad2.push('plateforme non android');
    if (!probe.api || !probe.app) bad2.push('modules non initialisés');
    if (probe.surahs !== 114) bad2.push(`sourates = ${probe.surahs}`);
    if (!probe.ayahs) bad2.push('aucun ayah');
    if (probe.unrendered) bad2.push(`${probe.unrendered} icônes non rendues`);
    if (probe.fontAmiri === false) bad2.push('Amiri non chargée');
    if (!probe.mobileCss) bad2.push('mobile.css absent');
    if (!audio.remote) bad2.push('audio non distant');
    if (!audio.timings) bad2.push('pas de timestamps');
    if (!tafsir.open || !tafsir.len) bad2.push('tafsir vide');
    if (!drawer.isDrawer || !drawer.opens) bad2.push('drawer KO');
    if (realErrors.length) bad2.push(`${realErrors.length} erreur(s) console`);
    if (bad2.length) { console.error('❌ ' + bad2.join(' | ')); process.exitCode = 1; }
    else console.log('✅ DOM et interactions valides sur l\'appareil');
})().catch(e => { console.error('❌ ' + e.message); process.exitCode = 1; });
