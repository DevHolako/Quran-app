// Generates version-android.json, the Android update manifest, from version.json.
//
// Usage:
//   node scripts/gen-android-manifest.js <url-de-l-apk>
//
// The desktop upload script (upload-to-drive.js) overwrites version.json's
// downloadUrl with the freshly uploaded Windows installer on every publish. That is
// why the APK URL has to be passed in explicitly here: copying downloadUrl from
// version.json would publish a manifest that offers an .exe to Android, which the
// package installer would then refuse — or worse, a user would be prompted for it.
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const apkUrl = String(process.argv[2] || '').trim();

function fail(msg) {
    console.error('ERREUR : ' + msg);
    process.exit(1);
}

if (!apkUrl) {
    fail(
        "URL de l'APK manquante.\n" +
        'Usage : node scripts/gen-android-manifest.js <url-de-l-apk>\n' +
        'Exemple : node scripts/gen-android-manifest.js ' +
        'https://drive.google.com/file/d/<ID>/view?usp=drive_link\n\n' +
        "Ne reprenez pas downloadUrl de version.json : c'est l'installeur Windows."
    );
}

const isDrive = /drive\.google\.com|usercontent\.google\.com/i.test(apkUrl);
const noQuery = apkUrl.split('?')[0].split('#')[0];
if (!isDrive && !/\.apk$/i.test(noQuery)) {
    fail(`cette URL n'est ni un lien Drive ni un .apk : ${apkUrl}`);
}
if (/\.(exe|msi|bat|cmd|com|scr|dmg)$/i.test(noQuery)) {
    fail(`cette URL ressemble a un installeur Windows : ${apkUrl}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const desktop = JSON.parse(fs.readFileSync(path.join(rootDir, 'version.json'), 'utf8'));

// versionCode is derived from package.json (1.0.5 -> 10005). A manifest at or below
// the version already installed would download and then be rejected by
// ApkUpdaterPlugin, because Android requires a strictly higher versionCode.
const [maj, min, pat] = String(pkg.version).split(/[.\-+]/).map(n => parseInt(n, 10) || 0);
const versionCode = maj * 10000 + min * 100 + pat;
const INSTALLED_VERSION_CODE = 10004;
if (versionCode <= INSTALLED_VERSION_CODE) {
    fail(
        `versionCode ${versionCode} (${pkg.version}) n'est pas strictement superieur a ` +
        `${INSTALLED_VERSION_CODE} (1.0.4, version deja installee sur les appareils).`
    );
}

const manifest = {
    platform: 'android',
    version: pkg.version,
    releaseDate: desktop.releaseDate,
    downloadUrl: apkUrl,
    changelog: desktop.changelog
};

const outFile = path.join(rootDir, 'version-android.json');
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('version-android.json genere : ' + outFile);
console.log('  platform    : ' + manifest.platform);
console.log('  version     : ' + manifest.version + ' (versionCode ' + versionCode + ')');
console.log('  releaseDate : ' + manifest.releaseDate);
console.log('  downloadUrl : ' + manifest.downloadUrl);
console.log('');
console.log('A TELEVERSER SUR DRIVE : version-android.json');
