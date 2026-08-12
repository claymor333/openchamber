package com.openchamber.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugin: register before super.onCreate so the bridge picks it
        // up alongside the plugins listed in capacitor.plugins.json. Keeping the
        // registration here (and the class in this source set) means `cap sync`
        // can never wipe it — it only regenerates the JSON/gradle plugin files.
        registerPlugin(MaterialYouPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
