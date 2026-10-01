const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;
const releaseDate = new Date().toISOString().split('T')[0];

const repo = process.env.GITHUB_REPOSITORY || 'DevHolako/Quran-app';
const releaseAssetsDir = path.join(rootDir, 'release-assets');

// Find setup executable name
let setupExe = `Quran_App_Setup_${version}.exe`;
if (fs.existsSync(releaseAssetsDir)) {
    const files = fs.readdirSync(releaseAssetsDir);
    const foundExe = files.find(f => f.startsWith('Quran_App_Setup') && f.endsWith('.exe'));
    if (foundExe) setupExe = foundExe;
}

const apkName = `Quran_App_${version}.apk`;

// Read changelogs
let desktopChangelog = `الإصدار ${version}:\n- تحديثات وتحسينات عامة`;
let androidChangelog = `الإصدار ${version}:\n- تحديثات وتحسينات عامة`;

const versionJsonPath = path.join(rootDir, 'version.json');
if (fs.existsSync(versionJsonPath)) {
    try {
        const v = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
        if (v.changelog) desktopChangelog = v.changelog;
    } catch (_) {}
}

const versionAndroidPath = path.join(rootDir, 'version-android.json');
if (fs.existsSync(versionAndroidPath)) {
    try {
        const va = JSON.parse(fs.readFileSync(versionAndroidPath, 'utf8'));
        if (va.changelog) androidChangelog = va.changelog;
    } catch (_) {}
}

const desktopManifest = {
    platform: 'desktop',
    version,
    releaseDate,
    downloadUrl: `https://github.com/${repo}/releases/download/v${version}/${setupExe}`,
    changelog: desktopChangelog
};

const androidManifest = {
    platform: 'android',
    version,
    releaseDate,
    downloadUrl: `https://github.com/${repo}/releases/download/v${version}/${apkName}`,
    changelog: androidChangelog
};

fs.writeFileSync(versionJsonPath, JSON.stringify(desktopManifest, null, 2) + '\n', 'utf8');
fs.writeFileSync(versionAndroidPath, JSON.stringify(androidManifest, null, 2) + '\n', 'utf8');

if (fs.existsSync(releaseAssetsDir)) {
    fs.writeFileSync(path.join(releaseAssetsDir, 'version.json'), JSON.stringify(desktopManifest, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(releaseAssetsDir, 'version-android.json'), JSON.stringify(androidManifest, null, 2) + '\n', 'utf8');
}

console.log(`✅ Generated release manifests for v${version}:`);
console.log(`   Desktop: ${desktopManifest.downloadUrl}`);
console.log(`   Android: ${androidManifest.downloadUrl}`);
