const fs = require('fs');
const path = require('path');
const { drive, auth } = require('@googleapis/drive');

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1FPlrhNXbhK48Cwor-PLCC5sPUZb6sZL0';

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

// 2. Parse Credentials (supports raw JSON or base64 encoded JSON)
function getCredentials() {
    let raw = process.env.GDRIVE_CREDENTIALS;
    if (!raw || !raw.trim()) {
        throw new Error('GDRIVE_CREDENTIALS secret is not set! Please add it in your repository Settings > Environments > main > Environment secrets or Repository Secrets.');
    }

    raw = raw.trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        raw = raw.slice(1, -1).trim();
    }

    // Try direct JSON parse
    try {
        const parsed = JSON.parse(raw);
        if (parsed.client_email && (parsed.private_key || parsed.private_key_id)) {
            console.log(`[Auth] Loaded Google Service Account credentials for: ${parsed.client_email}`);
            return parsed;
        }
    } catch (e) {}

    // Try base64 decode
    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (parsed.client_email) {
            console.log(`[Auth] Loaded base64-decoded Google Service Account for: ${parsed.client_email}`);
            return parsed;
        }
    } catch (e) {
        throw new Error(`Failed to parse GDRIVE_CREDENTIALS as JSON or Base64-encoded JSON: ${e.message}`);
    }

    throw new Error('Invalid GDRIVE_CREDENTIALS format. Expected Google Service Account JSON key.');
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
        fields: 'files(id, name, webViewLink, webContentLink)'
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
            fields: 'id, name, webViewLink, webContentLink'
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
            fields: 'id, name, webViewLink, webContentLink'
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
            }
        });
        console.log(`[Permissions] Public download access enabled for ${fileName}.`);
    } catch (permErr) {
        console.log(`[Permissions] Note: ${permErr.message}`);
    }

    return { fileId, webViewLink };
}

async function main() {
    console.log('====================================================');
    console.log('🚀 Quran App Auto-Deploy & Google Drive Synchronizer');
    console.log('====================================================');

    const credentials = getCredentials();
    const authClient = new auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive']
    });
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
    versionContent.downloadUrl = downloadDirectUrl;
    versionContent.version = pkg.version;
    versionContent.releaseDate = new Date().toISOString().split('T')[0];

    // Synchronize all discovered version.json copies
    for (const vFile of allVersionFiles) {
        fs.writeFileSync(vFile, JSON.stringify(versionContent, null, 2), 'utf8');
        console.log(`[version.json] Updated local copy at ${path.relative(rootDir, vFile)}`);
    }

    // Upload version.json to Google Drive
    const targetVersionId = process.env.VERSION_FILE_ID || '1VGk5RhhFpr5mftqdp8bYUvxzRgr5ldij';
    let versionUpload = null;

    try {
        console.log(`\n[version.json] Attempting direct update of target file ID: ${targetVersionId}...`);
        const updateRes = await driveClient.files.update({
            fileId: targetVersionId,
            media: {
                mimeType: 'application/json',
                body: fs.createReadStream(versionJsonPath)
            },
            fields: 'id, name, webViewLink'
        });
        versionUpload = { fileId: updateRes.data.id, webViewLink: updateRes.data.webViewLink };
        console.log(`[version.json] Successfully updated known version.json file directly!`);
    } catch (err) {
        console.log(`[version.json] Direct update fallback (${err.message}). Searching folder ${FOLDER_ID}...`);
        versionUpload = await uploadOrUpdateFile(
            driveClient,
            FOLDER_ID,
            versionJsonPath,
            'version.json',
            'application/json'
        );
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
