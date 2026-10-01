// Creates the Android virtual device used by `npm run android:emulator`.
//
// Requires Windows Hypervisor Platform for the emulator to actually run:
//   emulator -accel-check        -> must print accel: 1 or 2
//   Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
//
// Usage: node scripts/create-avd.js [name] [device-profile]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SDK = process.env.ANDROID_HOME
    || process.env.ANDROID_SDK_ROOT
    || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');

// sdkmanager/avdmanager are Java programs, so they need a JDK on the path even
// though the emulator itself does not.
const home = process.env.LOCALAPPDATA || process.env.USERPROFILE || '';
const javaHome = process.env.JAVA_HOME
    || (fs.existsSync(path.join(home, 'Android', 'jdk21')) ? path.join(home, 'Android', 'jdk21') : null);
if (!process.env.JAVA_HOME && javaHome) process.env.JAVA_HOME = javaHome;
if (javaHome && !process.env.PATH.includes(path.join(javaHome, 'bin'))) {
    process.env.PATH = path.join(javaHome, 'bin') + ';' + process.env.PATH;
}

const AVD_NAME = process.argv[2] || 'quran_api36';
const PROFILE = process.argv[3] || 'pixel_7';
const IMAGE = 'system-images;android-36;google_apis;x86_64';
const API = '36';

const sdkmanager = path.join(SDK, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
const avdmanager = path.join(SDK, 'cmdline-tools', 'latest', 'bin', 'avdmanager.bat');
const emulator = path.join(SDK, 'emulator', 'emulator.exe');

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
    if (r.error) throw r.error;
    return r;
}

function step(m) { console.log(`\n▶ ${m}`); }
function ok(m) { console.log(`  ✓ ${m}`); }
function bad(m) { console.log(`  ✗ ${m}`); }

for (const [label, p] of [['sdkmanager', sdkmanager], ['avdmanager', avdmanager], ['emulator', emulator]]) {
    if (!fs.existsSync(p)) throw new Error(`${label} introuvable : ${p}\nInstalle-le avec : sdkmanager "${label === 'emulator' ? 'emulator' : 'cmdline-tools;latest'}"`);
}

const props = (key) => {
    const r = run(emulator, ['-accel-check']);
    return (r.stdout || '') + (r.stderr || '');
};

step('vérification de l\'accélération matérielle');
const accel = props();
console.log('  ' + accel.split('\n').slice(0, 3).join('\n  ').trim());
if (/accel:\s*[12]\b/.test(accel)) {
    ok('accélération disponible (WHPX ou Hyper-V actif)');
} else {
    bad("pas d'accélération — l'émulateur sera inutilisable");
    console.log('    Activez WHPX dans une PowerShell administrateur, puis redémarrez :');
    console.log('      Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All');
}

step(`image système ${IMAGE}`);
if (fs.existsSync(path.join(SDK, 'system-images', `android-${API}`, 'google_apis', 'x86_64', 'package.xml'))) {
    ok('déjà installée');
} else {
    bad('installation (~1,1 Go)…');
    const r = run(sdkmanager, [IMAGE], { stdio: 'inherit', shell: true });
    if (r.status !== 0) throw new Error('sdkmanager a échoué — voir le message ci-dessus');
    ok('installée');
}

step(`création de l'AVD ${AVD_NAME} (profil ${PROFILE})`);
const existing = run(avdmanager, ['list', 'avd'], { shell: true });
if ((existing.stdout || '').includes(`Name: ${AVD_NAME}`)) {
    ok('existe déjà');
} else {
    const r = run(avdmanager, ['create', 'avd', '-n', AVD_NAME, '-k', IMAGE, '-d', PROFILE, '--force'],
        { input: 'no\n', stdio: ['pipe', 'pipe', 'pipe'], shell: true });
    if (r.status !== 0) throw new Error(`avdmanager a échoué : ${r.stderr || r.stdout}`);
    ok('créé');
}

const avdDir = path.join(process.env.USERPROFILE || '', '.android', 'avd', `${AVD_NAME}.avd`);
const cfg = path.join(avdDir, 'config.ini');
if (fs.existsSync(cfg)) {
    const text = fs.readFileSync(cfg, 'utf8');
    const ram = text.match(/^hw\.ramSize=(\d+)/m);
    const cores = text.match(/^hw\.cpu\.ncore=(\d+)/m);
    ok(`config : ${ram ? ram[1] + ' Mo' : 'RAM par défaut'}, ${cores ? cores[1] : '?'} cœur(s)`);
}

console.log(`\n${/accel:\s*[12]\b/.test(accel) ? '✅' : '⚠️ '} AVD prêt : ${AVD_NAME}`);
console.log(`   ${avdDir}`);
console.log('\nLancer les tests :\n  npm run apk          (reconstruit l\'APK release)\n  npm run android:emulator');
