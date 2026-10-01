package com.quran.creator;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the page tell native code which surface it is painting.
 *
 * With the window edge-to-edge, the status and navigation bar icons sit directly on
 * top of the app header. Android can only pick their colour from the system dark mode
 * setting, but this app has its own three themes, so on the dark (OLED) theme a
 * system-derived choice leaves dark icons on a near-black background. The renderer
 * reports the active theme here instead.
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setDarkSurface(PluginCall call) {
        Boolean dark = call.getBoolean("dark");
        Activity activity = getActivity();

        if (dark != null && activity instanceof MainActivity) {
            ((MainActivity) activity).setDarkSurface(dark);
        }

        JSObject result = new JSObject();
        result.put("applied", dark != null);
        call.resolve(result);
    }
}
