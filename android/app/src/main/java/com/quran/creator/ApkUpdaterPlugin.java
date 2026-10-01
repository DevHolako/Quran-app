package com.quran.creator;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * In-app APK updater.
 *
 * The desktop app shipped its installer on Google Drive, so this plugin keeps the
 * same behaviour: rewrite the Drive viewer link to a direct download, follow the
 * "virus scan" interstitial when Drive inserts one, then hand the file to the
 * system package installer through a FileProvider.
 *
 * The URL the user configures is untrusted input, and so is everything behind it.
 * A compromised or spoofed host could otherwise serve an arbitrary payload that this
 * app would happily push into the system installer. The download is therefore treated
 * as hostile until it proves otherwise:
 *
 *   - the URL and every redirect hop must stay on https, so a hop cannot downgrade
 *     the connection and swap the body in transit;
 *   - the body has to be a ZIP/APK and must stay under {@link #MAX_APK_BYTES};
 *   - the archive must declare *this* package name, so it can only be an update of
 *     this app and never a second app smuggled in;
 *   - the archive must be signed by the certificate of *this* installation, which is
 *     what actually stops a third party from shipping code under our package name;
 *   - its versionCode must be strictly greater than the running one, so an attacker
 *     (or a stale link) cannot force a downgrade to a vulnerable build.
 *
 * Any failed check deletes the file and never reaches the installer.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final int MAX_REDIRECTS = 10;
    private static final int BUFFER_SIZE = 64 * 1024;

    /** 200 MB. The real APK is a few MB; this only exists to stop a zip bomb. */
    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;

    /** Refuse to even start reading a body the server already says is this big. */
    private static final long MAX_CONTENT_LENGTH = MAX_APK_BYTES;

    private final Map<String, String> cookieJar = new HashMap<>();

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Missing url");
            return;
        }

        String directUrl;
        try {
            directUrl = requireHttps(toDirectDownloadUrl(url.trim()));
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }

        final String downloadUrl = directUrl;

        new Thread(new Runnable() {
            @Override
            public void run() {
                File apk = null;
                try {
                    apk = download(downloadUrl);
                    verifyArchive(apk);
                    notifyListeners("apkUpdaterProgress", progress(100, apk.length(), apk.length()));
                    install(call, apk);
                    return;
                } catch (Exception e) {
                    if (apk != null) apk.delete();
                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("error", String.valueOf(e.getMessage()));
                    call.resolve(ret);
                }
            }
        }, "apk-updater").start();
    }

    // ------------------------------------------------------------------ download

    private File download(String url) throws Exception {
        String current = url;
        HttpURLConnection conn = null;

        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
            // Re-checked on every hop: a redirect is attacker-controlled too.
            current = requireHttps(current);

            conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36");
            conn.setRequestProperty("Accept", "*/*");

            if (!cookieJar.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                for (Map.Entry<String, String> e : cookieJar.entrySet()) {
                    if (sb.length() > 0) sb.append("; ");
                    sb.append(e.getKey()).append("=").append(e.getValue());
                }
                conn.setRequestProperty("Cookie", sb.toString());
            }

            int status = conn.getResponseCode();
            storeCookies(conn);

            if (isRedirect(status)) {
                String location = conn.getHeaderField("Location");
                if (location == null) {
                    conn.disconnect();
                    throw new Exception("Redirect without a Location header");
                }
                current = resolve(current, location);
                conn.disconnect();
                continue;
            }

            if (status < 200 || status >= 300) {
                conn.disconnect();
                throw new Exception("HTTP " + status);
            }

            String contentType = conn.getContentType();
            if (contentType != null && contentType.toLowerCase().contains("text/html")) {
                // Google Drive serves an HTML confirmation page for large files.
                String html = readAll(conn.getInputStream(), MAX_CONTENT_LENGTH);
                String direct = extractDriveDirectLink(html);
                conn.disconnect();
                if (direct == null || direct.equals(current)) {
                    throw new Exception("Could not resolve the real download link");
                }
                current = direct;
                continue;
            }

            long total = conn.getContentLengthLong();
            if (total > MAX_CONTENT_LENGTH) {
                conn.disconnect();
                throw new Exception("Update is too large (" + total + " bytes)");
            }

            File dir = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates");
            if (!dir.exists() && !dir.mkdirs()) {
                throw new Exception("Cannot create " + dir.getAbsolutePath());
            }
            File out = new File(dir, "quran-app-update.apk");

            long received = 0;
            int lastPercent = -1;
            byte[] buffer = new byte[BUFFER_SIZE];

            try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                int read;
                while ((read = in.read(buffer)) != -1) {
                    received += read;
                    // Enforced while streaming: a lying or absent Content-Length must not
                    // let an unbounded body fill the user's storage.
                    if (received > MAX_APK_BYTES) {
                        throw new Exception("Update exceeded the maximum allowed size");
                    }
                    fos.write(buffer, 0, read);
                    if (total > 0) {
                        int percent = (int) (received * 100 / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            notifyListeners("apkUpdaterProgress", progress(percent, received, total));
                        }
                    } else {
                        notifyListeners("apkUpdaterProgress", progress(0, received, 0));
                    }
                }
                fos.flush();
            }

            if (out.length() < 4 * 1024) {
                throw new Exception("Downloaded file is too small (" + out.length() + " bytes)");
            }
            return out;
        }

        throw new Exception("Too many redirects");
    }

    // ----------------------------------------------------------------- verify

    /**
     * Proves the downloaded file is a newer build of this exact app, signed by the same
     * certificate, before the system installer is ever allowed to see it.
     */
    private void verifyArchive(File apk) throws Exception {
        PackageManager pm = getContext().getPackageManager();

        int archiveFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), archiveFlags);
        if (archive == null) {
            throw new Exception("The download is not a valid Android package");
        }

        String self = getContext().getPackageName();
        if (!self.equals(archive.packageName)) {
            throw new Exception("Package mismatch: expected " + self + " but got " + archive.packageName);
        }

        Signature[] archiveSigs = extractSignatures(archive);
        if (archiveSigs == null || archiveSigs.length == 0) {
            throw new Exception("The downloaded package is not signed");
        }

        PackageInfo installed = pm.getPackageInfo(self, archiveFlags);
        Signature[] installedSigs = extractSignatures(installed);
        if (installedSigs == null || installedSigs.length == 0) {
            throw new Exception("Cannot read the signature of the running app");
        }

        if (!sharesCertificate(archiveSigs, installedSigs)) {
            throw new Exception("The update is signed by a different certificate than this app");
        }

        long archiveVersion = versionCode(archive);
        long installedVersion = versionCode(installed);
        if (archiveVersion <= installedVersion) {
            throw new Exception("The downloaded build is not newer than the running one ("
                + archiveVersion + " <= " + installedVersion + ")");
        }
    }

    private static Signature[] extractSignatures(PackageInfo info) {
        if (info == null) return null;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            SigningInfo signingInfo = info.signingInfo;
            if (signingInfo == null) return null;
            if (signingInfo.hasMultipleSigners()) {
                return signingInfo.getApkContentsSigners();
            }
            // Covers key rotation: the history still contains the cert that signed us.
            return signingInfo.getSigningCertificateHistory();
        }

        return info.signatures;
    }

    /**
     * True when any certificate of {@code archive} is also present in the running app's
     * signing certificate history.
     */
    private static boolean sharesCertificate(Signature[] archive, Signature[] installed) {
        for (Signature a : archive) {
            if (a == null) continue;
            for (Signature b : installed) {
                if (b != null && Arrays.equals(a.toByteArray(), b.toByteArray())) {
                    return true;
                }
            }
        }
        return false;
    }

    private static long versionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return info.getLongVersionCode();
        }
        return info.versionCode;
    }

    // ------------------------------------------------------------------- install

    private void install(PluginCall call, File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            apk.delete();
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", String.valueOf(e.getMessage()));
            call.resolve(ret);
        }
    }

    /** Sends the user to the system screen that allows installing unknown apps. */
    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    // -------------------------------------------------------------------- helpers

    /** Rejects anything that is not plain https, including javascript:/file:/content: URIs. */
    private static String requireHttps(String url) throws Exception {
        URL parsed = new URL(url);
        String protocol = parsed.getProtocol();
        if (!"https".equalsIgnoreCase(protocol)) {
            throw new Exception("The update URL must use https (got " + protocol + "://)");
        }
        if (parsed.getHost() == null || parsed.getHost().isEmpty()) {
            throw new Exception("The update URL has no host");
        }
        return url;
    }

    private JSObject progress(int percent, long received, long total) {
        JSObject o = new JSObject();
        o.put("percent", percent);
        o.put("receivedBytes", received);
        o.put("totalBytes", total);
        return o;
    }

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    private static String resolve(String base, String location) throws Exception {
        return new URL(new URL(base), location).toString();
    }

    private void storeCookies(HttpURLConnection conn) {
        Map<String, List<String>> headers = conn.getHeaderFields();
        if (headers == null) return;
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if (entry.getKey() == null || !entry.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String value : entry.getValue()) {
                int eq = value.indexOf('=');
                int semi = value.indexOf(';');
                if (eq > 0) {
                    String name = value.substring(0, eq).trim();
                    String val = value.substring(eq + 1, semi > eq ? semi : value.length()).trim();
                    cookieJar.put(name, val);
                }
            }
        }
    }

    private static String readAll(InputStream in, long limit) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[BUFFER_SIZE];
        long total = 0;
        int read;
        while ((read = in.read(buf)) != -1) {
            total += read;
            if (total > limit) {
                throw new Exception("Response exceeded the maximum allowed size");
            }
            out.write(buf, 0, read);
        }
        return out.toString("UTF-8");
    }

    /** `drive.google.com/file/d/<id>/view` -> direct usercontent download link. */
    static String toDirectDownloadUrl(String url) {
        String id = extractDriveId(url);
        if (id == null) return url;
        return "https://drive.usercontent.google.com/download?id=" + id + "&export=download&confirm=t";
    }

    private static String extractDriveId(String url) {
        Pattern p1 = Pattern.compile("drive\\.google\\.com/file/d/([a-zA-Z0-9_-]{10,})");
        Matcher m1 = p1.matcher(url);
        if (m1.find()) return m1.group(1);

        Pattern p2 = Pattern.compile("[?&]id=([a-zA-Z0-9_-]{10,})");
        Matcher m2 = p2.matcher(url);
        if (m2.find()) return m2.group(1);

        return null;
    }

    /** Scrapes the real link out of Drive's HTML confirmation page. */
    private static String extractDriveDirectLink(String html) {
        Pattern[] patterns = new Pattern[] {
            Pattern.compile("id=\"uc-download-link\"[^>]*href=\"([^\"]+)\""),
            Pattern.compile("href=\"(/uc\\?export=download[^\"]*)\""),
            Pattern.compile("action=\"([^\"]*uc\\?export=download[^\"]*)\""),
            Pattern.compile("name=\"confirm\" value=\"([^\"]+)\""),
            Pattern.compile("name=\"id\" value=\"([^\"]+)\"")
        };
        for (Pattern p : patterns) {
            Matcher m = p.matcher(html);
            if (!m.find()) continue;
            String value = m.group(1).replace("&amp;", "&");
            if (value.startsWith("/")) return "https://drive.usercontent.google.com" + value;
            if (value.startsWith("http")) return value;
        }
        return null;
    }
}
