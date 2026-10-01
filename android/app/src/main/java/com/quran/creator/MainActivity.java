package com.quran.creator;

import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "QuranInsets";

    /** Last inset values written to the log, so only changes are reported. */
    private String lastReportedInsets = null;

    /**
     * Set by {@link SystemBarsPlugin} when the page switches between the light and
     * dark themes. System dark mode alone cannot decide this: the in-app theme is a
     * user choice independent of the OS setting, and the status bar icons have to
     * contrast with whatever the header is painting.
     */
    private volatile Boolean darkSurfaceOverride = null;

    private Insets systemBars = Insets.NONE;
    private Insets displayCutout = Insets.NONE;
    private Insets ime = Insets.NONE;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
        installEdgeToEdge();
        restrictNavigation();
    }

    @Override
    public void onResume() {
        super.onResume();
        // The theme can change while we are away, and rotating re-creates the bars.
        applyBarIconTheme(isDarkSurface());
        publishInsets();
    }

    /**
     * Draws the WebView behind the status and navigation bars.
     *
     * Android 15 (API 35) forces this for anything targeting SDK 35+, and the opt-out
     * was removed in SDK 36, so on a current device this geometry is already the
     * default whether we ask for it or not. Stating it explicitly makes older
     * releases match, which means one set of CSS inset rules is correct from API 24
     * up instead of two divergent layouts.
     *
     * The measured insets are then forwarded to the page as {@code --safe-area-inset-*}.
     * {@code env()} is not dependable for this on Android: it reports nothing unless
     * the window actually extends into the cutout, and its value is inconsistent
     * across WebView versions. Reading {@link WindowInsetsCompat} is the supported
     * path, and CSS keeps {@code env()} only as the fallback for the first paint.
     */
    private void installEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Let the background run into the cutout so there is no black strip, then keep
        // the content clear of it with the insets published below. Only meaningful
        // from API 28, where display cutouts arrived.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }

        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, windowInsets) -> {
            systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            displayCutout = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout());
            ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            publishInsets();
            // Not consumed: Capacitor and the WebView still need the raw insets.
            return windowInsets;
        });

        applyBarIconTheme(isDarkSurface());
    }

    /**
     * Pushes the current insets into CSS custom properties on {@code <html>}.
     *
     * The cutout is merged with the system bars because a notch can eat into the bar
     * area: on a landscape phone the left and right insets are the only thing keeping
     * content clear of the camera.
     */
    private void publishInsets() {
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        int topPx = Math.max(systemBars.top, displayCutout.top);
        int bottomPx = Math.max(systemBars.bottom, displayCutout.bottom);
        int leftPx = Math.max(systemBars.left, displayCutout.left);
        int rightPx = Math.max(systemBars.right, displayCutout.right);

        // WindowInsets are in physical pixels, but the custom properties are consumed
        // by the stylesheet as CSS pixels. The WebView maps one CSS pixel to one dp,
        // which is physical pixels / density, so handing over the raw px doubles the
        // padding on a 2x or 3x screen: a 48px status bar became 48 CSS px, i.e. 96
        // physical px of dead space. Convert here, and round rather than truncate so
        // the content is never clipped by a fraction of a pixel.
        final float density = getResources().getDisplayMetrics().density;
        final float scale = density > 0f ? density : 1f;
        final int top = Math.round(topPx / scale);
        final int bottom = Math.round(bottomPx / scale);
        final int left = Math.round(leftPx / scale);
        final int right = Math.round(rightPx / scale);
        final int keyboard = Math.round(ime.bottom / scale);

        final String js = "(function(){var s=document.documentElement.style;"
                + "s.setProperty('--safe-area-inset-top','" + top + "px');"
                + "s.setProperty('--safe-area-inset-bottom','" + bottom + "px');"
                + "s.setProperty('--safe-area-inset-left','" + left + "px');"
                + "s.setProperty('--safe-area-inset-right','" + right + "px');"
                + "s.setProperty('--keyboard-inset','" + keyboard + "px');"
                + "})();";

        // Logged whenever the numbers change: the sequence is the only way to tell
        // "no notch" apart from "the listener never ran". The first dispatch can
        // legitimately carry zeros before the window has been measured.
        final String reported = "density=" + scale + " top=" + top + " right=" + right
                + " bottom=" + bottom + " left=" + left + " ime=" + keyboard
                + " (css px, from " + topPx + "/" + bottomPx + " raw px)";
        if (!reported.equals(lastReportedInsets)) {
            lastReportedInsets = reported;
            Log.i(TAG, "insets -> " + reported);
        }

        // evaluateJavascript is main-thread only, same as the window flags above.
        // The string is built here so the inset fields are read on the thread that
        // wrote them, then only the call itself is posted.
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(js, null);
            }
        });
    }

    /**
     * Colors the status and navigation bar icons so they stay legible against the
     * app's own surface. Dark icons on the dark theme would otherwise be invisible.
     *
     * Posted rather than run inline: Capacitor dispatches plugin methods on its own
     * HandlerThread, and setting a window flag from there throws
     * CalledFromWrongThreadException because only the thread that built the view
     * hierarchy may touch it. Posting unconditionally keeps this safe from either.
     */
    void applyBarIconTheme(final boolean darkSurface) {
        final View decor = getWindow().getDecorView();
        decor.post(new Runnable() {
            @Override
            public void run() {
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(getWindow(), decor);
                controller.setAppearanceLightStatusBars(!darkSurface);
                controller.setAppearanceLightNavigationBars(!darkSurface);
            }
        });
    }

    void setDarkSurface(boolean darkSurface) {
        darkSurfaceOverride = darkSurface;
        applyBarIconTheme(darkSurface);
    }

    private boolean isDarkSurface() {
        if (darkSurfaceOverride != null) {
            return darkSurfaceOverride;
        }
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    /**
     * Capacitor's default WebViewClient hands *every* navigation to
     * {@code bridge.launchIntent()}, which fires an ACTION_VIEW intent with whatever URL
     * the page asked for. Any attacker-controlled string that reaches a link or an
     * iframe can therefore pick which app handles it: {@code intent://}, {@code file://},
     * a {@code market://} link, or a custom scheme belonging to another app. Handing a
     * foreign scheme to the system resolver is the classic intent-hijack vector, and on
     * this app it would run with the app's own permissions.
     *
     * So navigation is pinned: only the bridge's own origin stays inside the WebView, a
     * plain http(s) link to anywhere else is handed to the browser the user actually
     * uses, and every other scheme is dropped before it reaches the system.
     */
    private void restrictNavigation() {
        final BridgeWebViewClient delegate = getBridge().getWebViewClient();

        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url == null) {
                    return true;
                }

                String bridgeHost = getBridge().getHost();
                String host = url.getHost();
                if (bridgeHost != null && bridgeHost.equalsIgnoreCase(host)) {
                    return delegate.shouldOverrideUrlLoading(view, request);
                }

                String scheme = url.getScheme();
                if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
                    try {
                        Intent browser = new Intent(Intent.ACTION_VIEW, url);
                        browser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getApplicationContext().startActivity(browser);
                    } catch (Exception ignored) {
                        // No browser installed; nothing to do but stay put.
                    }
                }

                // Consumed either way: never let a foreign scheme reach the resolver.
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // A reload or a navigation resets inline styles, so re-publish.
                publishInsets();
                applyBarIconTheme(isDarkSurface());
            }
        });
    }
}
