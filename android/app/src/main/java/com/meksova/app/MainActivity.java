package com.meksova.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.meksova.app.drive.DriveMonitorPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DriveMonitorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
