package com.openchamber.app;

import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges the system wallpaper seed palette (Material You) to the WebView.
 *
 * <p>{@link WallpaperManager#getWallpaperColors(int)} and
 * {@link WallpaperManager.OnColorsChangedListener} require Android 8.1 (API 27).
 * On older devices the plugin still registers and answers {@code supported: false}
 * so the web side falls back to a fixed brand seed.
 */
@CapacitorPlugin(name = "MaterialYou")
public class MaterialYouPlugin extends Plugin implements WallpaperManager.OnColorsChangedListener {

    private static final String EVENT_WALLPAPER_COLORS = "wallpaperColors";

    private boolean wallpaperColorsSupported;

    @Override
    public void load() {
        super.load();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            wallpaperColorsSupported = true;
            WallpaperManager.getInstance(getContext())
                .addOnColorsChangedListener(this, new Handler(Looper.getMainLooper()));
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (wallpaperColorsSupported) {
            WallpaperManager.getInstance(getContext()).removeOnColorsChangedListener(this);
        }
        super.handleOnDestroy();
    }

    /** Resolves the current system wallpaper seed colors (primary/secondary/tertiary). */
    @PluginMethod
    public void getWallpaperColors(PluginCall call) {
        call.resolve(toResult(currentWallpaperColors()));
    }

    @Override
    public void onColorsChanged(WallpaperColors colors, int which) {
        if ((which & WallpaperManager.FLAG_SYSTEM) != 0) {
            notifyListeners(EVENT_WALLPAPER_COLORS, toResult(colors));
        }
    }

    private WallpaperColors currentWallpaperColors() {
        if (!wallpaperColorsSupported) {
            return null;
        }
        return WallpaperManager.getInstance(getContext())
            .getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
    }

    private JSObject toResult(WallpaperColors colors) {
        JSObject result = new JSObject();
        result.put("supported", wallpaperColorsSupported);
        if (colors == null) {
            return result;
        }
        Color primary = colors.getPrimaryColor();
        if (primary != null) {
            result.put("primaryColor", toHex(primary));
        }
        Color secondary = colors.getSecondaryColor();
        if (secondary != null) {
            result.put("secondaryColor", toHex(secondary));
        }
        Color tertiary = colors.getTertiaryColor();
        if (tertiary != null) {
            result.put("tertiaryColor", toHex(tertiary));
        }
        return result;
    }

    private static String toHex(Color color) {
        return String.format("#%06X", color.toArgb() & 0xFFFFFF);
    }
}
