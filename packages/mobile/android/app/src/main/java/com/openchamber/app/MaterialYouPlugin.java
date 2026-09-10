package com.openchamber.app;

import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges the system wallpaper seed palette (Material You) to the WebView.
 *
 * <p>API-27 Android classes live in {@link MaterialYouApi27}, not in this
 * plugin's class signature. This keeps Capacitor plugin discovery safe on the
 * app's API-24 minimum while still enabling wallpaper listeners on newer
 * devices.
 */
@CapacitorPlugin(name = "MaterialYou")
public class MaterialYouPlugin extends Plugin {

    private static final String EVENT_WALLPAPER_COLORS = "wallpaperColors";

    private boolean wallpaperColorsSupported;
    private Object api27Delegate;

    @Override
    public void load() {
        super.load();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            wallpaperColorsSupported = true;
            api27Delegate = MaterialYouApi27.register(getContext(), this);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (api27Delegate != null) {
            MaterialYouApi27.unregister(api27Delegate);
            api27Delegate = null;
        }
        super.handleOnDestroy();
    }

    /** Resolves the current system wallpaper seed colors (primary/secondary/tertiary). */
    @PluginMethod
    public void getWallpaperColors(PluginCall call) {
        if (!wallpaperColorsSupported || api27Delegate == null) {
            JSObject result = new JSObject();
            result.put("supported", false);
            call.resolve(result);
            return;
        }
        call.resolve(MaterialYouApi27.currentResult(api27Delegate));
    }

    void emitWallpaperColors(JSObject result) {
        notifyListeners(EVENT_WALLPAPER_COLORS, result);
    }
}
