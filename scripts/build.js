const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distAppDir = path.join(rootDir, 'dist-app');

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
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

const { execSync } = require('child_process');

async function build() {
    console.log('🔍 Checking TypeScript types...');
    execSync('npx tsc --noEmit', { stdio: 'inherit', cwd: rootDir });

    console.log('🚀 Building Quran Desktop App with TypeScript & esbuild...');
    const startTime = Date.now();

    // Clean dist-app directory
    if (fs.existsSync(distAppDir)) {
        fs.rmSync(distAppDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distAppDir, { recursive: true });

    // 1. Build Main Process & Preload
    await esbuild.build({
        entryPoints: [
            path.join(rootDir, 'src/main/main.ts'),
            path.join(rootDir, 'src/main/preload.ts')
        ],
        outdir: path.join(distAppDir, 'main'),
        bundle: true,
        platform: 'node',
        target: 'node20',
        external: ['electron'],
        sourcemap: false
    });

    // 2. Build Renderer Bundle
    await esbuild.build({
        entryPoints: [
            path.join(rootDir, 'src/renderer/js/app.ts')
        ],
        outfile: path.join(distAppDir, 'renderer/js/app.js'),
        bundle: true,
        platform: 'browser',
        target: 'es2022',
        sourcemap: false
    });

    // 3. Copy Static Assets
    fs.mkdirSync(path.join(distAppDir, 'renderer'), { recursive: true });
    fs.copyFileSync(
        path.join(rootDir, 'src/renderer/index.html'),
        path.join(distAppDir, 'renderer/index.html')
    );

    copyDirRecursive(
        path.join(rootDir, 'src/renderer/css'),
        path.join(distAppDir, 'renderer/css')
    );

    copyDirRecursive(
        path.join(rootDir, 'src/renderer/assets'),
        path.join(distAppDir, 'renderer/assets')
    );

    copyDirRecursive(
        path.join(rootDir, 'src/renderer/js/libs'),
        path.join(distAppDir, 'renderer/js/libs')
    );

    console.log(`✅ Build completed successfully in ${Date.now() - startTime}ms!`);
}

build().catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
