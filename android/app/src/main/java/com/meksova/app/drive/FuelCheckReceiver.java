package com.meksova.app.drive;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires DWELL_MS after a stop; checks for a fuel station or store if the car is still parked. */
public class FuelCheckReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!DrivePrefs.enabled(context) || !DrivePrefs.stopChecks(context)) return;
        long exitAt = intent.getLongExtra("exitAt", 0);
        // Drove off again within the dwell time: a red light or drive-through, not a fill-up.
        if (DrivePrefs.prefs(context).getLong("lastEnterAt", 0) > exitAt) return;
        PendingResult result = goAsync();
        FuelStops.checkAsync(context, intent.getDoubleExtra("lat", 0), intent.getDoubleExtra("lng", 0), result::finish);
    }
}
