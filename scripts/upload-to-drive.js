const fs = require('fs');
const path = require('path');
const { drive, auth } = require('@googleapis/drive');
const { readAndroidUpdateUrl, writeAndroidUpdateUrl } = require('./update-channel');

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1FPlrhNXbhK48Cwor-PLCC5sPUZb6sZL0';

// Android gets its own manifest, on its own Drive file.
//
// The single shared version.json cannot serve both platforms: this script overwrites
// its downloadUrl with the freshly uploaded Windows installer, so Android reads a
// manifest pointing at a .exe and platform.ts rejects it with 'android-requires-apk'.
// The result is that Android can never self-update no matter how often the desktop
// build is published. Two channels, two files.
const ANDROID_MANIFEST_NAME = 'version-android.json';

// 1. Recursive file search
function findFiles(dir, pattern, maxDepth = 4, currentDepth = 0) {
    let results = [];
    if (currentDepth > maxDepth || !fs.existsSync(dir)) return results;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (['node_modules', '.git', '.github'].includes(entry.name)) continue;
                results = results.concat(findFiles(fullPath, pattern, maxDepth, currentDepth + 1));
            } else if (entry.isFile() && pattern.test(entry.name)) {
                results.push(fullPath);
            }
        }
    } catch (e) {
        console.warn(`[Search] Warning accessing ${dir}: ${e.message}`);
    }
    return results;
}

// 2. Authentication: OAuth 2.0 User (Preferred, personal quota) OR Service Account
function getAuthClient() {
    // Check for OAuth 2.0 User Tokens (Personal Google Account Quota)
    const clientId = process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
    const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;

    if (clientId && clientSecret && refreshToken) {
        console.log('[Auth] Authenticating via OAuth 2.0 User Credentials (Personal Quota Enabled).');
        const oauth2Client = new auth.OAuth2(
            clientId.trim(),
            clientSecret.trim(),
            'http://localhost:8085'
        );
        oauth2Client.setCredentials({
            refresh_token: refreshToken.trim()
        });
        return oauth2Client;
    }

    // Fallback: Service Account JSON or Base64
    let raw = process.env.GDRIVE_CREDENTIALS;
    if (raw && raw.trim()) {
        raw = raw.trim();
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            raw = raw.slice(1, -1).trim();
        }

        let parsedCreds = null;
        try {
            parsedCreds = JSON.parse(raw);
        } catch (e) {
            try {
                const decoded = Buffer.from(raw, 'base64').toString('utf8');
                parsedCreds = JSON.parse(decoded);
            } catch (err) {}
        }

        if (parsedCreds && parsedCreds.client_email) {
            console.log(`[Auth] Authenticating via Service Account: ${parsedCreds.client_email}`);
            return new auth.GoogleAuth({
                credentials: parsedCreds,
                scopes: ['https://www.googleapis.com/auth/drive']
            });
        }
    }

    throw new Error('No valid Google Drive credentials found! Please configure GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, and GDRIVE_REFRESH_TOKEN in GitHub Secrets.');
}

// 3. Upload or update a file in Google Drive
async function uploadOrUpdateFile(driveClient, folderId, filePath, customFileName, mimeType) {
    const fileName = customFileName || path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;
    const fileSizeMb = (fileSize / (1024 * 1024)).toFixed(2);

    console.log(`\n[Upload] Processing ${fileName} (${fileSizeMb} MB)...`);

    // Search for existing file in target folder
    const listRes = await driveClient.files.list({
        q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
        fields: 'files(id, name, webViewLink, webContentLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });

    const existingFiles = listRes.data.files || [];
    let fileId = null;
    let webViewLink = null;

    if (existingFiles.length > 0) {
        fileId = existingFiles[0].id;
        console.log(`[Upload] File already exists in Drive (ID: ${fileId}). Updating content...`);

        const updateRes = await driveClient.files.update({
            fileId: fileId,
            media: {
                mimeType: mimeType || 'application/octet-stream',
                body: fs.createReadStream(filePath)
            },
            fields: 'id, name, webViewLink, webContentLink',
            supportsAllDrives: true
        });

        fileId = updateRes.data.id;
        webViewLink = updateRes.data.webViewLink;
        console.log(`[Upload] Updated existing file successfully.`);
    } else {
        console.log(`[Upload] Uploading new file to folder ID: ${folderId}...`);

        const createRes = await driveClient.files.create({
            requestBody: {
                name: fileName,
                parents: [folderId]
            },
            media: {
                mimeType: mimeType || 'application/octet-stream',
                body: fs.createReadStream(filePath)
            },
            fields: 'id, name, webViewLink, webContentLink',
            supportsAllDrives: true
        });

        fileId = createRes.data.id;
        webViewLink = createRes.data.webViewLink;
        console.log(`[Upload] Created new file successfully (ID: ${fileId}).`);
    }

    // Ensure public read permission
    try {
        await driveClient.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            },
            supportsAllDrives: true
        });
        console.log(`[Permissions] Public download access enabled for ${fileName}.`);
    } catch (permErr) {
        console.log(`[Permissions] Note: ${permErr.message}`);
    }

    return { fileId, webViewLink };
}

async function publishAndroid(driveClient) {
    const rootDir = process.cwd();
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

    console.log('====================================================');
    console.log('📱 Quran App — publication du canal Android');
    console.log('====================================================');
    console.log(`[Project] version package.json : ${pkg.version}`);

    // 1. Locate the release APK.
    const apkCandidates = [
        path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
    ];
    const apkPath = apkCandidates.find(p => fs.existsSync(p));
    if (!apkPath) {
        throw new Error(
            'APK release introuvable. Construisez-le d\'abord :\n' +
            '  npm run android:sync   puis   gradlew assembleRelease\n' +
            'Cherché : ' + apkCandidates.join(', ')
        );
    }
    console.log(`[APK] ${path.relative(rootDir, apkPath)} (${(fs.statSync(apkPath).size / 1048576).toFixed(2)} Mo)`);

    // 2. Upload the APK.
    console.log(`\n[APK] Envoi vers Drive (dossier ${FOLDER_ID})...`);
    const apkUpload = await uploadOrUpdateFile(
        driveClient,
        FOLDER_ID,
        apkPath,
        `Quran_App_${pkg.version}.apk`,
        'application/vnd.android.package-archive'
    );
    const apkUrl = `https://drive.google.com/file/d/${apkUpload.fileId}/view?usp=drive_link`;

    // 3. Build the Android manifest, reusing the changelog authored in version.json.
    const desktopManifestPath = path.join(rootDir, 'version.json');
    let changelog = '';
    if (fs.existsSync(desktopManifestPath)) {
        try {
            changelog = JSON.parse(fs.readFileSync(desktopManifestPath, 'utf8')).changelog || '';
        } catch (err) {
            console.log(`[version-android.json] version.json illisible, changelog ignoré : ${err.message}`);
        }
    }

    const androidManifest = {
        platform: 'android',
        version: pkg.version,
        releaseDate: new Date().toISOString().split('T')[0],
        downloadUrl: apkUrl,
        changelog
    };

    const androidManifestPath = path.join(rootDir, ANDROID_MANIFEST_NAME);
    fs.writeFileSync(androidManifestPath, JSON.stringify(androidManifest, null, 2) + '\n', 'utf8');
    console.log(`\n[${ANDROID_MANIFEST_NAME}] écrit :`, androidManifestPath);
    console.log(`   version=${androidManifest.version}  downloadUrl=${androidManifest.downloadUrl}`);

    // 4. Publish it, reusing a stable file ID when one already exists so the baked-in
    //    URL keeps resolving across releases instead of changing every time.
    const existingUrl = readAndroidUpdateUrl(rootDir);
    const existingIdMatch = existingUrl.match(/file\/d\/([\w-]+)/);
    const pinnedId = process.env.GDRIVE_ANDROID_VERSION_FILE_ID || (existingIdMatch && existingIdMatch[1]) || null;

    let manifestUrl;
    if (pinnedId) {
        console.log(`[${ANDROID_MANIFEST_NAME}] Mise à jour du fichier Drive existant ${pinnedId}...`);
        await driveClient.files.update({
            fileId: pinnedId,
            media: {
                mimeType: 'application/json',
                body: fs.createReadStream(androidManifestPath)
            },
            fields: 'id, name',
            supportsAllDrives: true
        });
        manifestUrl = `https://drive.google.com/file/d/${pinnedId}/view?usp=drive_link`;
    } else {
        console.log(`[${ANDROID_MANIFEST_NAME}] Premier publication — création du fichier Drive...`);
        const uploaded = await uploadOrUpdateFile(
            driveClient,
            FOLDER_ID,
            androidManifestPath,
            ANDROID_MANIFEST_NAME,
            'application/json'
        );
        manifestUrl = `https://drive.google.com/file/d/${uploaded.fileId}/view?usp=drive_link`;
    }

    // 5. Record it so the next build bakes it in.
    writeAndroidUpdateUrl(rootDir, manifestUrl);

    console.log('\n====================================================');
    console.log('🎉 Canal Android publié');
    console.log(`APK ID      : ${apkUpload.fileId}`);
    console.log(`APK Link    : ${apkUrl}`);
    console.log(`Manifeste   : ${manifestUrl}`);
    console.log('====================================================');
    console.log('\n⚠  L\'URL du manifeste est maintenant enregistrée dans update-channel.json.');
    console.log('   Elle n\'est pourtant PAS encore dans l\'APK : elle est figée au build.');
    console.log('   Pour que les installations actuelles reçoivent cette version :');
    console.log('     1. npm run android:sync');
    console.log('     2. gradlew assembleRelease  (puis publier cet APK-là à la prochaine release)');
    console.log('   Les versions suivantes se mettent à jour seules, sans cette étape.');
}

async function main() {
    if (process.argv.includes('--android')) {
        const authClient = getAuthClient();
        await publishAndroid(drive({ version: 'v3', auth: authClient }));
        return;
    }

    console.log('====================================================');
    console.log('🚀 Quran App Auto-Deploy & Google Drive Synchronizer');
    console.log('====================================================');

    const authClient = getAuthClient();
    const driveClient = drive({ version: 'v3', auth: authClient });

    const rootDir = process.cwd();
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    console.log(`[Project] Package version: ${pkg.version}`);

    // 1. Locate Installer using recursive search
    const allExeFiles = findFiles(rootDir, /\.exe$/i).filter(p => !p.includes('win-unpacked'));
    console.log(`[Search] Found executable files:`, allExeFiles.map(p => path.relative(rootDir, p)));

    const expectedSetupName = `Quran_App_Setup_${pkg.version}.exe`;
    let installerPath = allExeFiles.find(p => path.basename(p) === expectedSetupName)
        || allExeFiles.find(p => path.basename(p).startsWith('Quran_App_Setup') && p.endsWith('.exe'))
        || allExeFiles.find(p => path.basename(p).toLowerCase().includes('setup'))
        || allExeFiles[0];

    if (!installerPath || !fs.existsSync(installerPath)) {
        throw new Error(`Could not find setup installer in ${rootDir}! Searched files: ${JSON.stringify(allExeFiles)}`);
    }

    console.log(`[Installer] Selected for upload: ${path.basename(installerPath)} (${installerPath})`);

    // Upload Installer to Google Drive
    const installerUpload = await uploadOrUpdateFile(
        driveClient,
        FOLDER_ID,
        installerPath,
        path.basename(installerPath),
        'application/vnd.microsoft.portable-executable'
    );

    // 2. Locate and Update version.json
    const allVersionFiles = findFiles(rootDir, /^version\.json$/i);
    console.log(`[version.json] Found files:`, allVersionFiles.map(p => path.relative(rootDir, p)));

    let versionJsonPath = allVersionFiles[0] || path.join(rootDir, 'version.json');
    if (!fs.existsSync(versionJsonPath)) {
        throw new Error(`version.json not found in workspace!`);
    }

    const versionContent = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    const downloadDirectUrl = `https://drive.google.com/file/d/${installerUpload.fileId}/view?usp=drive_link`;
    versionContent.platform = 'desktop';
    versionContent.downloadUrl = downloadDirectUrl;
    versionContent.version = pkg.version;
    versionContent.releaseDate = new Date().toISOString().split('T')[0];

    // Synchronize all discovered version.json copies
    for (const vFile of allVersionFiles) {
        fs.writeFileSync(vFile, JSON.stringify(versionContent, null, 2), 'utf8');
        console.log(`[version.json] Updated local copy at ${path.relative(rootDir, vFile)}`);
    }

    // Upload/sync version.json directly inside FOLDER_ID (so it appears directly in Quran_App folder)
    console.log(`\n[version.json] Uploading/updating version.json in target folder ID: ${FOLDER_ID}...`);
    const versionUpload = await uploadOrUpdateFile(
        driveClient,
        FOLDER_ID,
        versionJsonPath,
        'version.json',
        'application/json'
    );

    // Also update known target version ID if configured and different (ensures backward compatibility)
    const targetVersionId = process.env.VERSION_FILE_ID || '1VGk5RhhFpr5mftqdp8bYUvxzRgr5ldij';
    if (targetVersionId && targetVersionId !== versionUpload.fileId) {
        try {
            console.log(`\n[version.json] Updating secondary target version file (${targetVersionId})...`);
            await driveClient.files.update({
                fileId: targetVersionId,
                media: {
                    mimeType: 'application/json',
                    body: fs.createReadStream(versionJsonPath)
                },
                fields: 'id, name, webViewLink',
                supportsAllDrives: true
            });
            console.log(`[version.json] Successfully updated secondary target version file directly!`);
        } catch (err) {
            console.log(`[version.json] Secondary update note: ${err.message}`);
        }
    }

    console.log('\n====================================================');
    console.log('🎉 All files deployed successfully to Google Drive!');
    console.log(`Installer ID  : ${installerUpload.fileId}`);
    console.log(`Installer Link: https://drive.google.com/file/d/${installerUpload.fileId}/view`);
    console.log(`version.json ID  : ${versionUpload.fileId}`);
    console.log(`version.json Link: https://drive.google.com/file/d/${versionUpload.fileId}/view`);
    console.log('====================================================');
}

main().catch(err => {
    console.error('\n❌ Deployment failed:', err.message);
    process.exit(1);
});
