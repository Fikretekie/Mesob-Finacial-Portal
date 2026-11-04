package com.meksova.app.drive;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires shortly after the user leaves the car; checks for a fuel station or store. */
public class FuelCheckReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!DrivePrefs.enabled(context) || !DrivePrefs.stopChecks(context)) return;
        PendingResult result = goAsync();
        FuelStops.checkAsync(context, intent.getDoubleExtra("lat", 0), intent.getDoubleExtra("lng", 0), result::finish);
    }
}
