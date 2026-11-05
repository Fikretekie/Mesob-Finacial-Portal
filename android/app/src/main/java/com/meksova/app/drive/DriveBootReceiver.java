package com.meksova.app.drive;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Activity-transition registrations don't survive a reboot or app update. */
public class DriveBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(a)) DriveVehicle.clearConnections(context);
        if (DrivePrefs.enabled(context)) DriveEvents.register(context);
        WeeklySummary.schedule(context);
    }
}
