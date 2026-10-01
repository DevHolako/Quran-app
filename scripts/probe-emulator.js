// Runs the Android emulator under several configurations to find one that
// survives on a host without WHPX/Hyper-V, since the default launch can crash
// QEMU outright instead of merely running slowly.
//
//   node scripts/probe-emulator.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const TMP = process.env.TEMP;
const PROBE = path.join(TMP, 'probe-emulator.cmd');
const LOG = path.join(TMP, 'emu-probe.log');
const SDK = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');

const CONFIGS = [
    { accel: 'off', gpu: 'off', cores: 2 },
    { accel: 'off', gpu: 'off', cores: 4 },
    { accel: 'off', gpu: 'guest', cores: 2 },
    { accel: 'off', gpu: 'swiftshader_indirect', cores: 2 },
    { accel: 'whpx', gpu: 'off', cores: 2 }
];

function qemuAlive() {
    const r = require('child_process').spawnSync('tasklist',
        ['/FI', 'IMAGENAME eq qemu-system-x86_64-headless.exe', '/NH'], { encoding: 'utf8' });
    return /qemu-system/i.test(r.stdout || '');
}

function killQemu() {
    for (const img of ['qemu-system-x86_64.exe', 'qemu-system-x86_64-headless.exe', 'emulator.exe', 'netsimd.exe']) {
        require('child_process').spawnSync('taskkill', ['/f', '/im', img], { stdio: 'ignore' });
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    fs.copyFileSync(path.join(rootDir, 'scripts', 'probe-emulator.cmd'), PROBE);
    require('child_process').spawnSync(path.join(SDK, 'platform-tools', 'adb.exe'), ['start-server'], { stdio: 'ignore' });

    const results = [];
    for (const c of CONFIGS) {
        killQemu();
        await sleep(1500);
        console.log(`\n▶ accel=${c.accel} gpu=${c.gpu} cores=${c.cores}`);
        try { fs.unlinkSync(LOG); } catch (_) { /* fresh log */ }

        const child = spawn(`"${PROBE}" ${c.accel} ${c.gpu} ${c.cores}`,
            { detached: true, stdio: 'ignore', shell: true });
        child.unref();

        let survived = false;
        for (let i = 0; i < 12; i++) {
            await sleep(5000);
            if (qemuAlive()) { survived = true; console.log(`  qemu vivant après ${(i + 1) * 5}s`); break; }
        }

        let exit = null;
        if (!survived) {
            const txt = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
            exit = (txt.match(/EXITCODE=(-?\d+)/) || [])[1] || '?';
            const err = txt.split('\n').filter(l => /ERROR|Unable|fatal|assert/i.test(l)).slice(-2);
            console.log(`  ✗ qemu mort (EXITCODE=${exit})`);
            err.forEach(l => console.log('    ' + l.trim().slice(0, 160)));
        } else {
            const adb = path.join(SDK, 'platform-tools', 'adb.exe');
            const d = require('child_process').spawnSync(adb, ['devices'], { encoding: 'utf8' }).stdout || '';
            console.log(`  ✓ survit — adb: ${d.split('\n').filter(l => l.includes('device')).length} appareil(s)`);
        }
        results.push({ ...c, survived, exit });
    }

    killQemu();
    console.log('\n--- récapitulatif ---');
    for (const r of results) {
        console.log(`  ${r.survived ? '✓' : '✗'} accel=${r.accel.padEnd(5)} gpu=${r.gpu.padEnd(20)} cores=${r.cores}${r.survived ? '' : `  (exit ${r.exit})`}`);
    }
    const win = results.find(r => r.survived);
    console.log(win
        ? `\n✅ configuration viable : accel=${win.accel} gpu=${win.gpu} cores=${win.cores}`
        : "\n❌ aucune configuration ne survit — WHPX est requis (Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All, puis redémarrer)");
})();
