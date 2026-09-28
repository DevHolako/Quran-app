const http = require('http');
const url = require('url');
const { exec } = require('child_process');
const { auth } = require('@googleapis/drive');

// Usage: node scripts/get-refresh-token.js <CLIENT_ID> <CLIENT_SECRET>
const clientId = process.argv[2];
const clientSecret = process.argv[3];

if (!clientId || !clientSecret) {
    console.error('\n❌ Error: Missing Client ID or Client Secret!');
    console.log('\nUsage:');
    console.log('  node scripts/get-refresh-token.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET\n');
    process.exit(1);
}

const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}`;

const oauth2Client = new auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent'
});

const server = http.createServer(async (req, res) => {
    try {
        const parsedUrl = new URL(req.url, REDIRECT_URI);
        const code = parsedUrl.searchParams.get('code');

        if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    <h2 style="color: #10b981;">✅ تم ربط حساب Google Drive بنجاح!</h2>
                    <p>يمكنك الآن إغلاق هذه الصفحة والعودة إلى شاشة الأوامر.</p>
                </div>
            `);

            console.log('\n[OAuth] Code received, exchanging for refresh token...');
            const { tokens } = await oauth2Client.getToken(code);

            console.log('\n========================================================');
            console.log('🎉 SUCCESS! Here are your credentials for GitHub Secrets:');
            console.log('========================================================\n');
            console.log(`GDRIVE_CLIENT_ID:`);
            console.log(clientId);
            console.log('\nGDRIVE_CLIENT_SECRET:');
            console.log(clientSecret);
            console.log('\nGDRIVE_REFRESH_TOKEN:');
            console.log(tokens.refresh_token);
            console.log('\n========================================================\n');

            server.close(() => {
                process.exit(0);
            });
        }
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error retrieving token: ' + err.message);
        console.error('\n❌ Token exchange error:', err.message);
        server.close(() => process.exit(1));
    }
});

server.listen(PORT, () => {
    console.log(`\n========================================================`);
    console.log(`🔑 Google Drive OAuth Token Generator`);
    console.log(`========================================================`);
    console.log(`\nOpening your browser to authorize access to Google Drive...`);
    console.log(`If it doesn't open automatically, visit this URL:\n\n${authUrl}\n`);

    // Open browser on Windows
    exec(`start "" "${authUrl.replace(/&/g, '^&')}"`, (err) => {
        if (err) {
            console.log(`Please copy and paste the URL above into your browser.`);
        }
    });
});
