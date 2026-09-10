package com.openchamber.app;

import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;

/** API-27-only implementation, loaded only after a runtime API check. */
final class MaterialYouApi27 implements WallpaperManager.OnColorsChangedListener {
    private final WallpaperManager wallpaperManager;
    private final MaterialYouPlugin plugin;

    private MaterialYouApi27(Context context, MaterialYouPlugin plugin) {
        this.wallpaperManager = WallpaperManager.getInstance(context);
        this.plugin = plugin;
    }

    static MaterialYouApi27 register(Context context, MaterialYouPlugin plugin) {
        MaterialYouApi27 delegate = new MaterialYouApi27(context, plugin);
        delegate.wallpaperManager.addOnColorsChangedListener(delegate, new Handler(Looper.getMainLooper()));
        return delegate;
    }

    static void unregister(Object delegate) {
        ((MaterialYouApi27) delegate).wallpaperManager.removeOnColorsChangedListener((MaterialYouApi27) delegate);
    }

    static JSObject currentResult(Object delegate) {
        MaterialYouApi27 api27 = (MaterialYouApi27) delegate;
        return api27.toResult(api27.wallpaperManager.getWallpaperColors(WallpaperManager.FLAG_SYSTEM));
    }

    @Override
    public void onColorsChanged(WallpaperColors colors, int which) {
        if ((which & WallpaperManager.FLAG_SYSTEM) != 0) {
            plugin.emitWallpaperColors(toResult(colors));
        }
    }

    private JSObject toResult(WallpaperColors colors) {
        JSObject result = new JSObject();
        result.put("supported", true);
        if (colors == null) return result;
        putColor(result, "primaryColor", colors.getPrimaryColor());
        putColor(result, "secondaryColor", colors.getSecondaryColor());
        putColor(result, "tertiaryColor", colors.getTertiaryColor());
        return result;
    }

    private static void putColor(JSObject result, String key, Color color) {
        if (color != null) result.put(key, String.format("#%06X", color.toArgb() & 0xFFFFFF));
    }
}
