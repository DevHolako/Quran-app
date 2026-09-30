// Reads and writes update-channel.json, the single source of truth for where the
// app looks for a new version.
//
// Why a separate file: the manifest URL has to be baked into the bundle at build
// time, and it changes only when a release is published. Keeping it in a small
// committed JSON lets `upload-to-drive.js --android` write the value automatically
// after a publish instead of a developer hand-editing a constant in the renderer.
//
// The file lives at the repo root rather than under src/ because tsconfig pins
// rootDir to src, so a JSON import would sit outside the project; esbuild injects it
// as a define constant instead.
const fs = require('fs');
const path = require('path');

const CHANNEL_FILE = 'update-channel.json';

/**
 * Returns the Android manifest URL, or '' when no channel is configured.
 * Never throws: a missing or malformed file must degrade to "no auto-update",
 * not break the build.
 */
function readAndroidUpdateUrl(rootDir) {
    try {
        const raw = fs.readFileSync(path.join(rootDir, CHANNEL_FILE), 'utf8');
        const parsed = JSON.parse(raw);
        return typeof parsed.android === 'string' ? parsed.android.trim() : '';
    } catch (_) {
        return '';
    }
}

/** Persists the Android manifest URL, preserving the other keys and the comment. */
function writeAndroidUpdateUrl(rootDir, url) {
    const file = path.join(rootDir, CHANNEL_FILE);
    let parsed = {};
    try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
        parsed = {};
    }
    parsed.android = String(url || '').trim();
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    return parsed.android;
}

/** The define pair both bundlers must supply, so the renderer never sees a bare identifier. */
function esbuildDefines(rootDir) {
    return { __ANDROID_UPDATE_URL__: JSON.stringify(readAndroidUpdateUrl(rootDir)) };
}

module.exports = { CHANNEL_FILE, readAndroidUpdateUrl, writeAndroidUpdateUrl, esbuildDefines };
