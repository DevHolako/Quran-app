// Thin wrapper around android/gradlew.bat that injects the JDK + Android SDK
// locations and runs Gradle from the android/ project root.
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const home = process.env.LOCALAPPDATA || process.env.USERPROFILE;

const javaHome = process.env.JAVA_HOME
    || (fs.existsSync(path.join(home, 'Android', 'jdk21')) ? path.join(home, 'Android', 'jdk21') : path.join(home, 'Android', 'jdk17'));
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(home, 'Android', 'Sdk');

const javaBin = path.join(javaHome, 'bin', 'java.exe');
if (!fs.existsSync(javaBin)) {
    console.error(`❌ JDK introuvable dans ${javaHome}. Installe JDK 21 ou définis JAVA_HOME.`);
    process.exit(1);
}
if (!fs.existsSync(sdk)) {
    console.error(`❌ Android SDK introuvable dans ${sdk}. Installe-le ou définis ANDROID_HOME.`);
    process.exit(1);
}

// Keep local.properties in sync with the detected SDK.
fs.writeFileSync(
    path.join(androidDir, 'local.properties'),
    `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`
);

const isWin = process.platform === 'win32';
const wrapper = isWin
    ? path.join(androidDir, 'gradlew.bat')
    : path.join(androidDir, 'gradlew');

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node scripts/gradle.js <gradle task> [...]');
    process.exit(1);
}

const result = spawnSync(isWin ? `"${wrapper}"` : wrapper, args, {
    cwd: androidDir,
    stdio: 'inherit',
    shell: isWin,
    env: {
        ...process.env,
        JAVA_HOME: javaHome,
        ANDROID_HOME: sdk,
        ANDROID_SDK_ROOT: sdk
    }
});

process.exit(result.status === null ? 1 : result.status);
