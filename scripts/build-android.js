// Android build: bundles the renderer into ./www (Capacitor webDir) and syncs
// the native Android project. Kept separate from the Electron build so neither
// platform has to carry the other's artefacts.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readAndroidUpdateUrl, esbuildDefines } = require('./update-channel');

const rootDir = path.resolve(__dirname, '..');
const wwwDir = path.join(rootDir, 'www');
const androidDir = path.join(rootDir, 'android');

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`⚠️  source directory not found, skipping: ${src}`);
        return;
    }
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        if (fs.statSync(srcPath).isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function getAndroidEnv() {
    const home = process.env.LOCALAPPDATA || process.env.USERPROFILE;
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(home, 'Android', 'Sdk');
    // Capacitor 8 / AGP 8.x need JDK 21.
    const jdk = process.env.JAVA_HOME || path.join(home, 'Android', 'jdk21');

    if (!fs.existsSync(path.join(jdk, 'bin', 'java.exe'))) {
        throw new Error(`JDK 21 introuvable dans ${jdk}. Défini JAVA_HOME.`);
    }
    if (!fs.existsSync(sdk)) {
        throw new Error(`Android SDK introuvable dans ${sdk}. Défini ANDROID_HOME.`);
    }
    return { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
}

// WebView devtools are how scripts/device-dom.js inspects a running app, but
// leaving them on in a shipped APK lets anyone with adb read the app's DOM and
// evaluate JavaScript in it. Off by default; opt in with `npm run apk -- --inspect`
// or ANDROID_INSPECT=1.
function applyInspectConfig() {
    const inspect = process.argv.includes('--inspect') || process.env.ANDROID_INSPECT === '1';
    const file = path.join(rootDir, 'capacitor.config.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const want = inspect ? 'development' : 'none';
    if (cfg.loggingBehavior === want && cfg.android.webContentsDebuggingEnabled === inspect) return;

    cfg.loggingBehavior = want;
    cfg.android.webContentsDebuggingEnabled = inspect;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
    console.log(`🔍 mode inspection ${inspect ? 'ACTIVÉ (logging development)' : 'désactivé (logging none)'}`);
}

async function buildWeb() {
    console.log('🔍 Checking TypeScript types...');
    execSync('npx tsc --noEmit', { stdio: 'inherit', cwd: rootDir });

    const pkg = require(path.join(rootDir, 'package.json'));
    const androidUpdateUrl = readAndroidUpdateUrl(rootDir);

    console.log('📦 Building renderer bundle for Android...');
    const start = Date.now();

    if (fs.existsSync(wwwDir)) fs.rmSync(wwwDir, { recursive: true, force: true });
    fs.mkdirSync(wwwDir, { recursive: true });

    console.log(
        androidUpdateUrl
            ? `📡 Canal de mise à jour Android (source prioritaire) : ${androidUpdateUrl}`
            : '📡 Canal de mise à jour Android : découvert à l\'exécution ' +
              '(version-android.json sur la branche principale). Aucun lien dans l\'APK.'
    );

    await esbuild.build({
        entryPoints: [path.join(rootDir, 'src/renderer/js/app.ts')],
        outfile: path.join(wwwDir, 'js/app.js'),
        bundle: true,
        platform: 'browser',
        target: 'es2020',
        minify: true,
        legalComments: 'none',
        define: esbuildDefines(rootDir),
        banner: {
            js: `window.__APP_VERSION__=${JSON.stringify(pkg.version)};`
        }
    });

    fs.copyFileSync(path.join(rootDir, 'src/renderer/index.html'), path.join(wwwDir, 'index.html'));
    copyDirRecursive(path.join(rootDir, 'src/renderer/css'), path.join(wwwDir, 'css'));
    copyDirRecursive(path.join(rootDir, 'src/renderer/assets'), path.join(wwwDir, 'assets'));
    copyDirRecursive(path.join(rootDir, 'src/renderer/fonts'), path.join(wwwDir, 'fonts'));
    copyDirRecursive(path.join(rootDir, 'src/renderer/js/libs'), path.join(wwwDir, 'js/libs'));

    const sizeKb = (fs.statSync(path.join(wwwDir, 'js/app.js')).size / 1024).toFixed(1);
    console.log(`✅ Web bundle ready in ${Date.now() - start}ms (app.js = ${sizeKb} KB)`);
}

async function syncAndroid() {
    if (!fs.existsSync(androidDir)) {
        console.log('📱 First run — creating the Android project (this takes a minute)...');
        execSync('npx cap add android', { stdio: 'inherit', cwd: rootDir, env: getAndroidEnv() });
    }
    execSync('npx cap sync android', { stdio: 'inherit', cwd: rootDir, env: getAndroidEnv() });
}

async function main() {
    await buildWeb();
    applyInspectConfig();
    await syncAndroid();
    console.log('✅ Android project ready. Next: npm run apk');
}

main().catch((err) => {
    console.error('❌ Android build failed:', err);
    process.exit(1);
});
