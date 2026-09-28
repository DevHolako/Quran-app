const fs = require('fs');
const path = require('path');
const { drive, auth } = require('@googleapis/drive');

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1FPlrhNXbhK48Cwor-PLCC5sPUZb6sZL0';

// 1. Parse Credentials (supports raw JSON or base64 encoded JSON)
function getCredentials() {
    let raw = process.env.GDRIVE_CREDENTIALS;
    if (!raw || !raw.trim()) {
        throw new Error('GDRIVE_CREDENTIALS secret is not set! Please add it in your repository Settings > Secrets and variables > Actions.');
    }

    raw = raw.trim();
    // Strip surrounding quotes if present
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        raw = raw.slice(1, -1).trim();
    }

    // Try parsing as JSON directly
    try {
        const parsed = JSON.parse(raw);
        if (parsed.client_email && (parsed.private_key || parsed.private_key_id)) {
            console.log(`[Auth] Loaded Google Service Account credentials for: ${parsed.client_email}`);
            return parsed;
        }
    } catch (e) {
        // Not direct JSON, attempt base64 decode
    }

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

// 2. Upload or update a file in Google Drive
async function uploadOrUpdateFile(driveClient, folderId, filePath, customFileName, mimeType) {
    const fileName = customFileName || path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;
    const fileSizeMb = (fileSize / (1024 * 1024)).toFixed(2);

    console.log(`\n[Upload] Processing ${fileName} (${fileSizeMb} MB)...`);

    // Search for existing file in the target folder
    const listRes = await driveClient.files.list({
        q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
        fields: 'files(id, name, webViewLink, webContentLink)'
    });

    const existingFiles = listRes.data.files || [];
    let fileId = null;
    let webViewLink = null;

    if (existingFiles.length > 0) {
        // Update in-place to preserve permanent file ID and link
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
        // Create new file
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

    // Ensure public read permission (anyone with link can download)
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

    // Locate artifacts
    const rootDir = process.cwd();
    const distDir = path.join(rootDir, 'dist');

    // 1. Locate Installer
    let installerPath = null;
    if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        const setupFile = files.find(f => f.startsWith('Quran_App_Setup') && f.endsWith('.exe'));
        if (setupFile) {
            installerPath = path.join(distDir, setupFile);
        } else {
            const anyExe = files.find(f => f.endsWith('.exe'));
            if (anyExe) installerPath = path.join(distDir, anyExe);
        }
    }

    if (!installerPath || !fs.existsSync(installerPath)) {
        throw new Error(`Could not find setup installer in ${distDir}!`);
    }

    console.log(`[Installer] Found: ${path.basename(installerPath)}`);

    // Upload Installer to Google Drive
    const installerUpload = await uploadOrUpdateFile(
        driveClient,
        FOLDER_ID,
        installerPath,
        path.basename(installerPath),
        'application/vnd.microsoft.portable-executable'
    );

    // 2. Locate and Update version.json
    let versionJsonPath = path.join(rootDir, 'version.json');
    if (!fs.existsSync(versionJsonPath) && fs.existsSync(path.join(distDir, 'version.json'))) {
        versionJsonPath = path.join(distDir, 'version.json');
    }

    if (!fs.existsSync(versionJsonPath)) {
        throw new Error(`version.json not found in root or dist directory!`);
    }

    const versionContent = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    const downloadDirectUrl = `https://drive.google.com/file/d/${installerUpload.fileId}/view?usp=drive_link`;
    versionContent.downloadUrl = downloadDirectUrl;
    versionContent.releaseDate = new Date().toISOString().split('T')[0];

    // Write updated version.json to disk
    fs.writeFileSync(versionJsonPath, JSON.stringify(versionContent, null, 2), 'utf8');
    if (fs.existsSync(path.join(distDir, 'version.json'))) {
        fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify(versionContent, null, 2), 'utf8');
    }
    console.log(`\n[version.json] Updated downloadUrl to: ${downloadDirectUrl}`);

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
