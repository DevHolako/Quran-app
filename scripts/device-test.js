// Installs and smoke-tests the release APK on a real device or emulator via adb.
//
//   node scripts/device-test.js                 # any connected device
//   node scripts/device-test.js --boot quran_api36   # boot an AVD first
//   node scripts/device-test.js --no-launch     # install only
//
// Verifies install, launch, absence of a native crash, absence of JavaScript
// console errors (Capacitor forwards them to logcat), and writes screenshots.
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const SDK_ROOT = process.env.ANDROID_HOME
    || process.env.ANDROID_SDK_ROOT
    || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');

const SDK_ADB = path.join(SDK_ROOT, 'platform-tools', 'adb.exe');
const EMULATOR = path.join(SDK_ROOT, 'emulator', 'emulator.exe');
const APK = path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const PKG = 'com.quran.creator';
const ACTIVITY = `${PKG}/.MainActivity`;
const SHOT_DIR = path.join(rootDir, 'test-artifacts');

const args = process.argv.slice(2);
const bootAvd = args.includes('--boot') ? args[args.indexOf('--boot') + 1] : null;
const noLaunch = args.includes('--no-launch');

// An adb client and the adb server it talks to must be the same build: a
// mismatch makes the client kill the server on every invocation. Vendor
// emulators ship their own (older) adb and keep their server running, so when
// one is present we must use *its* binary for the whole session, otherwise the
// two keep evicting each other and the device flaps in and out of the list.
function vendorAdbBinaries() {
    const roots = [];
    for (const env of ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA', 'ProgramData']) {
        if (process.env[env]) roots.push(process.env[env]);
    }
    // Vendors frequently install to a secondary drive.
    for (const d of (fs.existsSync('D:\\') ? ['D:\\'] : [])) roots.push(d + 'Program Files');

    const rel = [
        ['Nox', 'bin', 'nox_adb.exe'],
        ['Nox', 'bin', 'adb.exe'],
        ['Nox', 'bin', 'adb_server.exe'],
        ['ldplayer', 'LDPlayer9', 'adb.exe'],
        ['Netease', 'MuMuPlayerGlobal-12.0', 'shell', 'vemon', 'adb.exe'],
        ['Microvirt', 'MEmu', 'adb.exe'],
        ['Bignox', 'BigNoxVM', 'bin', 'nox_adb.exe']
    ];
    const out = [];
    for (const root of roots) {
        for (const parts of rel) {
            const p = path.join(root, ...parts);
            if (fs.existsSync(p)) out.push(p);
        }
    }
    return [...new Set(out)];
}

function hasVisibleDevice(bin) {
    const r = spawnSync(bin, ['devices'], { encoding: 'utf8' });
    return /^\S+\s+device/m.test(r.stdout || '');
}

const VENDOR_ADB = vendorAdbBinaries();
let ADB = process.env.ADB || SDK_ADB;
if (!process.env.ADB) {
    const running = VENDOR_ADB.find(hasVisibleDevice);
    if (running) ADB = running;
    else {
        // Still prefer a vendor binary that is up and running with an empty list.
        ADB = VENDOR_ADB[0] || SDK_ADB;
    }
}

function adb(...a) {
    const r = spawnSync(ADB, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// logcat through the selected adb binary, decoded leniently: device logs mix
// UTF-8 and raw bytes, and the default utf8 codec would throw on the latter.
function logcat(serial, ...extra) {
    const r = spawnSync(ADB, ['-s', serial, 'logcat', ...extra],
        { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 });
    return (r.stdout || Buffer.alloc(0)).toString('latin1');
}

function step(msg) { console.log(`\n▶ ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function bad(msg) { console.log(`  ✗ ${msg}`); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------- device ---

function listDevices() {
    // Each row is "<serial>\t<state> [key:value ...]" — the serial comes FIRST,
    // so matching on a leading "device" never matched anything.
    return adb('devices', '-l').out
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^\S+\s+device\b/.test(l))
        .map(l => {
            const [serial, state, ...rest] = l.split(/\s+/);
            return { serial, state, info: rest.join(' ') };
        });
}

function isEmulator(serial) { return /^emulator-/.test(serial) || /127\.0\.0\.1|localhost/.test(serial); }

// Third-party emulators don't register themselves with the SDK adb server, so
// they need an explicit `adb connect`. Ports per vendor:
//   NoxPlayer / MEmu      62001..62032   (62001 = first instance)
//   LDPlayer              5555, 5554
//   BlueStacks            5555, 5556
//   Genymotion            5555
//   Android Studio AVD    5554, 5556
const KNOWN_PORTS = [
    ...Array.from({ length: 32 }, (_, i) => 62001 + i),
    5555, 5554, 5556, 5557, 5037, 21503
];

function adbBinaries() {
    const home = process.env.LOCALAPPDATA || '';
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [
        ADB,
        path.join(pf, 'Nox', 'bin', 'nox_adb.exe'),
        path.join(pf, 'Nox', 'bin', 'adb.exe'),
        path.join(pf86, 'Nox', 'bin', 'nox_adb.exe'),
        path.join(pf, 'Netease', 'MuMuPlayerGlobal-12.0', 'shell', 'vemon', 'adb.exe'),
        path.join(pf, 'ldplayer', 'LDPlayer9', 'adb.exe')
    ].filter(p => fs.existsSync(p));
}

// Probes the well-known emulator ports. Stops at the first device that answers:
// Nox's adb server is an older build than the SDK one, so every extra probe
// risks restarting the server and dropping the connection we just established.
async function autodetect() {
    const found = [];
    const bin = adbBinaries();
    if (bin.length > 1) console.log(`  adb disponibles : ${bin.length}`);
    for (const port of KNOWN_PORTS) {
        const target = `127.0.0.1:${port}`;
        if (adb('connect', target).code !== 0) continue;
        await sleep(1200);
        const state = adb('-s', target, 'get-state').out;
        if (state === 'device') {
            console.log(`  ✓ ${target} répond`);
            found.push(target);
            break;
        }
        adb('disconnect', target);
    }
    return found;
}

// `listDevices()` can come back empty right after an adb server swap; give the
// transport a few seconds to settle instead of failing the whole run.
async function waitForDevice(timeoutMs = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const d = listDevices();
        if (d.length) return d;
        await sleep(2000);
    }
    return [];
}

async function bootDevice() {
    if (listDevices().length) {
        ok('appareil déjà connecté');
        return;
    }

    const explicit = args.includes('--connect') ? args[args.indexOf('--connect') + 1] : null;
    if (explicit) {
        const target = explicit.includes(':') ? explicit : `127.0.0.1:${explicit}`;
        const r = adb('connect', target);
        await sleep(1500);
        if ((await waitForDevice(15000)).length) {
            ok(`connecté à ${target}`);
            return;
        }
        throw new Error(`connexion impossible à ${target} : ${r.out || r.err}`);
    }

    step('recherche d\'un émulateur tiers (Nox, LDPlayer, MuMu, BlueStacks…)');
    const found = await autodetect();
    if (found.length && (await waitForDevice(15000)).length) {
        ok(`utilisé : ${found[0]}`);
        return;
    }
    console.log('  aucun émulateur détecté sur les ports connus');
    console.log('  → NoxPlayer : lance une instance puis active Débogage USB');
    console.log('    dans les paramètres Nox, et réessaie avec --connect 127.0.0.1:62001');

    if (!bootAvd) {
        throw new Error("aucun appareil. Branchez un téléphone (débogage USB) ou relancez avec --boot <nom-avd>.");
    }
    if (!fs.existsSync(EMULATOR)) throw new Error(`émulateur introuvable : ${EMULATOR}`);

    step(`démarrage de l'AVD ${bootAvd} (headless)`);
    const log = path.join(SHOT_DIR, `emulator-${Date.now()}.log`);
    fs.mkdirSync(SHOT_DIR, { recursive: true });

    // On a host without WHPX the emulator only survives with -gpu off and
    // 2 cores; the software GPU backends crash qemu with 0xC0000005. That boot
    // is pure software emulation, so it is slow — allow a long timeout.
    const accel = process.env.EMULATOR_ACCEL || 'off';
    const gpu = process.env.EMULATOR_GPU || 'off';
    const cores = process.env.EMULATOR_CORES || '2';
    const bootTimeout = Number(process.env.EMULATOR_BOOT_TIMEOUT || 3600000);

    const child = spawn(EMULATOR, [
        '-avd', bootAvd,
        '-accel', accel, '-gpu', gpu,
        '-cores', cores, '-memory', '2048',
        '-no-window', '-no-audio', '-no-boot-anim',
        '-no-snapshot', '-wipe-data'
    ], { detached: true, stdio: ['ignore', fs.openSync(log, 'a'), fs.openSync(log, 'a')] });
    child.unref();
    ok(`émulateur lancé (pid ${child.pid}, accel=${accel}, gpu=${gpu}, ${cores} cœurs)`);
    if (accel === 'off') {
        console.log('  ⚠ émulation logicielle : le boot peut prendre 30 à 90 min');
    }

    step(`attente du boot (jusqu'à ${Math.round(bootTimeout / 60000)} min)`);
    const started = Date.now();
    while (Date.now() - started < bootTimeout) {
        await sleep(15000);
        const d = listDevices();
        if (!d.length) { console.log('  … adb ne voit rien'); continue; }
        const b = adb('-s', d[0].serial, 'shell', 'getprop', 'sys.boot_completed').out;
        if (b === '1') {
            adb('-s', d[0].serial, 'shell', 'input', 'keyevent', '82');
            ok(`boot terminé en ${Math.round((Date.now() - started) / 1000)}s`);
            return;
        }
        const stage = adb('-s', d[0].serial, 'shell', 'getprop', 'dev.bootcomplete').out || '?';
        const anim = adb('-s', d[0].serial, 'shell', 'getprop', 'init.svc.bootanim').out || '?';
        const mins = Math.round((Date.now() - started) / 60000);
        console.log(`  … ${mins} min — bootanim=${anim} dev.bootcomplete=${stage}`);
    }
    throw new Error("délai de boot dépassé — voir le log de l'émulateur");
}

// ----------------------------------------------------------------- test ----

const problems = [];

async function main() {
    const dev = await waitForDevice(20000);
    if (!dev.length) throw new Error('aucun appareil après boot');
    const serial = dev[0].serial;
    const model = adb('-s', serial, 'shell', 'getprop', 'ro.product.model').out;
    const release = adb('-s', serial, 'shell', 'getprop', 'ro.build.version.release').out;
    const sdk = adb('-s', serial, 'shell', 'getprop', 'ro.build.version.sdk').out;
    ok(`${model} — Android ${release} (API ${sdk}) [${serial}]`);
    if (isEmulator(serial)) ok('type : émulateur');

    if (!fs.existsSync(APK)) throw new Error(`APK introuvable : ${APK} (npm run apk)`);
    const apkMb = (fs.statSync(APK).size / 1048576).toFixed(2);

    // ---- install ----
    step(`installation de ${apkMb} Mo`);
    adb('-s', serial, 'uninstall', PKG);
    const t0 = Date.now();
    const inst = adb('-s', serial, 'install', '-r', '-g', APK);
    if (inst.code !== 0 || !/Success|success|INSTALL_SUCCESS/.test(inst.out + inst.err)) {
        throw new Error(`échec installation : ${inst.out} ${inst.err}`);
    }
    ok(`installé en ${Math.round((Date.now() - t0) / 1000)}s`);

    const ver = adb('-s', serial, 'shell', 'dumpsys', 'package', PKG).out
        .match(/versionName=(\S+)/);
    ok(`version installée : ${ver ? ver[1] : '?'}`);
    const api = Number(sdk);
    const perms = [...adb('-s', serial, 'shell', 'dumpsys', 'package', PKG).out
        .matchAll(/android\.permission\.(\w+): granted=(true|false)/g)]
        .filter(m => m[2] === 'true')
        .map(m => m[1]);
    ok(`permissions accordées : ${perms.join(', ')}`);

    // POST_NOTIFICATIONS only exists from API 33; below that the permission is
    // implicit and is granted at install time, so asking for it is meaningless.
    if (api >= 33 && !perms.includes('POST_NOTIFICATIONS')) {
        problems.push('permission POST_NOTIFICATIONS non accordée (API 33+)');
    }
    if (api < 33 && !perms.includes('INTERNET')) {
        problems.push('permission INTERNET non accordée');
    }
    // REQUEST_INSTALL_PACKAGES was added in API 26; the updater needs it there.
    if (api >= 26 && !perms.includes('REQUEST_INSTALL_PACKAGES')) {
        problems.push('permission REQUEST_INSTALL_PACKAGES non accordée (API 26+)');
    }
    ok(`API ${api} — contrôles de permissions adaptés`);
    if (noLaunch) { console.log('\n(–no-launch : test terminé avant lancement)'); return; }
    // ---- launch ----
    step('lancement de l\'application');
    adb('-s', serial, 'logcat', '-c');
    adb('-s', serial, 'shell', 'am', 'force-stop', PKG);
    const monkey = adb('-s', serial, 'shell', 'am', 'start', '-n', ACTIVITY);
    if (/Error|Exception/.test(monkey.err + monkey.out)) {
        problems.push(`lancement refusé : ${monkey.out} ${monkey.err}`);
    }
    ok('activity démarrée');
    await sleep(12000);

    // ---- process alive ----
    step('vérification du processus');
    const pid = adb('-s', serial, 'shell', 'pidof', PKG).out;
    if (!pid) {
        problems.push("l'application a quitté (crash au démarrage)");
    } else {
        ok(`processus vivant (pid ${pid})`);
    }

    // ---- focused window ----
    const focus = adb('-s', serial, 'shell', 'dumpsys', 'window', 'displays')
        .out.match(/mCurrentFocus=.* (\S+)\/(\S+)/);
    if (focus) ok(`fenêtre active : ${focus[1]}/${focus[2]}`);

    // ---- native crash ----
    step('analyse des logs');
    const log = logcat(serial, '-d', '-v', 'time');
    const fatal = [...log.matchAll(/FATAL EXCEPTION:.*$/gm)].map(m => m[0]);
    const anr = [...log.matchAll(/ANR in ([\w.]+)/g)].map(m => m[1]);
    const crashNative = [...log.matchAll(/Abort message:|signal 11|libc.*Fatal signal/g)].map(m => m[0]);
    if (fatal.length) { problems.push(`${fatal.length} FATAL EXCEPTION`); fatal.slice(0, 3).forEach(f => bad(f)); }
    else ok('aucune FATAL EXCEPTION');
    if (anr.length) problems.push(`ANR : ${anr.join(', ')}`);

    // Capacitor forwards page console output to logcat under this tag.
    const consoleLines = log.split('\n').filter(l => l.includes('Capacitor/Console'));
    const consoleErrs = consoleLines.filter(l => /\b(ERROR|Error|error)\b/.test(l));
    if (consoleErrs.length) {
        problems.push(`${consoleErrs.length} erreur(s) console JS`);
        consoleErrs.slice(0, 8).forEach(l => bad(l.trim().slice(0, 200)));
    } else {
        ok(`console JS : ${consoleLines.length} message(s), aucune erreur`);
    }

    // The bundled data must have loaded, otherwise the UI is empty.
    const pageErrs = consoleLines.filter(l => /Uncaught|Unhandled|TypeError|ReferenceError/.test(l));
    if (pageErrs.length) problems.push(`${pageErrs.length} exception(s) JS`);

    const webviewErrs = log.split('\n')
        .filter(l => /chromium/.test(l) && /ERROR|Uncaught|Failed to load/.test(l));
    if (webviewErrs.length) {
        problems.push(`${webviewErrs.length} erreur(s) WebView`);
        webviewErrs.slice(0, 5).forEach(l => bad(l.trim().slice(0, 200)));
    } else ok('aucune erreur WebView');

    // ---- network reachability from inside the device ----
    // The audio URL is resolved from the quran.com API, which is why the device
    // actually plays download.quranicaudio.com and not cdn.islamic.network; that
    // mirror answers 403 to curl and is not what the app uses.
    step('test réseau depuis l\'appareil');
    for (const [name, url] of [
        ['api.quran.com (sourates)', 'https://api.quran.com/api/v4/chapters?language=fr'],
        ['api.alquran.cloud (versets)', 'https://api.alquran.cloud/v1/surah/1/ar.alafasy'],
        ['download.quranicaudio.com (audio)', 'https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/1.mp3']
    ]) {
        const r = adb('-s', serial, 'shell', 'curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '20', url);
        const code = (r.out || '').trim();
        if (code === '200') ok(`${name} → 200`);
        else problems.push(`${name} injoignable depuis l'appareil (code « ${code || r.err } »)`);
    }

    // ---- screenshots ----
    step('captures d\'écran');
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const shots = [];
    async function shoot(name) {
        const f = path.join(SHOT_DIR, `${name}.png`);
        const r = spawnSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'],
            { encoding: null, maxBuffer: 64 * 1024 * 1024 });
        if (r.status === 0 && r.stdout && r.stdout.length > 5000) {
            fs.writeFileSync(f, r.stdout);
            shots.push(f);
            ok(`${name}.png`);
            return true;
        }
        bad(`capture ${name} impossible`);
        return false;
    }

    await shoot('01-accueil');
    // Tap through to a surah to prove navigation + audio work on-device.
    adb('-s', serial, 'shell', 'input', 'tap', '200', '400');
    await sleep(6000);
    await shoot('02-sourate');

    // Open the sidebar (drawer) — a 412dp-wide phone must use the drawer layout.
    adb('-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_APP_SWITCH');
    await sleep(1000);
    adb('-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(3000);
    await shoot('03-navigation');

    // ---- disk usage ----
    const du = adb('-s', serial, 'shell', 'dumpsys', 'diskstats').out
        .match(new RegExp(`${PKG}[^\\n]*`, ''));
    step('occupation disque');
    if (du) console.log('  ' + du[0].trim().slice(0, 160));

    console.log('\n--- bilan ---');
    if (shots.length) console.log('captures : ' + shots.join('\n           '));
    if (problems.length) {
        console.error('\n❌ ' + problems.length + ' problème(s) :');
        problems.forEach(p => console.error('   - ' + p));
        process.exitCode = 1;
    } else {
        console.log('\n✅ Test sur appareil réussi');
    }
    console.log(`\napk     : ${APK}`);
    console.log(`captures: ${SHOT_DIR}`);
}

(async () => {
    try {
        await bootDevice();
        await main();
    } catch (e) {
        console.error('\n❌ ' + e.message);
        process.exitCode = 1;
    }
})();
