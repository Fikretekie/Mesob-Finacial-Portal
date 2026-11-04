package com.meksova.app.drive;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.DetectedActivity;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.util.Arrays;

/**
 * What happens when Android says the user started or stopped driving.
 * Detection itself is Google Play services' activity recognition — the OS
 * watches the motion sensors, so it costs almost no battery while idle.
 */
final class DriveEvents {

    private DriveEvents() {}

    @SuppressLint("MissingPermission")
    static void register(Context c) {
        if (!DrivePrefs.hasActivity(c)) return;
        ActivityTransitionRequest req = new ActivityTransitionRequest(Arrays.asList(
            new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                .build(),
            new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                .build()
        ));
        try {
            ActivityRecognition.getClient(c).requestActivityTransitionUpdates(req, transitionIntent(c));
        } catch (SecurityException ignored) {
            // Permission revoked since the check.
        }
    }

    @SuppressLint("MissingPermission")
    static void unregister(Context c) {
        try {
            ActivityRecognition.getClient(c).removeActivityTransitionUpdates(transitionIntent(c));
        } catch (SecurityException ignored) {
            // Never registered.
        }
    }

    private static PendingIntent transitionIntent(Context c) {
        // Mutable: Play services adds the transition result to it.
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(c, 4100, new Intent(c, DriveTransitionReceiver.class), flags);
    }

    static void onDriveStart(Context c) {
        if (!DrivePrefs.enabled(c)) return;
        DrivePrefs.prefs(c).edit().putLong("lastEnterAt", System.currentTimeMillis()).apply();
        if (DrivePrefs.manualTrip(c)) return;
        if (DrivePrefs.workdaysOnly(c) && DrivePrefs.isWeekend()) return;
        if (DrivePrefs.autoRecord(c) && DrivePrefs.hasBackgroundLocation(c)) {
            if (!DriveRecorderService.isRunning()) DriveRecorderService.start(c);
        } else {
            DriveNotify.ask(c);
        }
    }

    /** May finish asynchronously; calls pending.finish() when done (null = not from a receiver). */
    @SuppressLint("MissingPermission")
    static void onDriveEnd(Context c, BroadcastReceiver.PendingResult pending) {
        DriveNotify.cancel(c, DriveNotify.ID_ASK);
        if (!DrivePrefs.enabled(c)) {
            done(pending);
            return;
        }
        if (DrivePrefs.manualTrip(c)) DriveNotify.forgotTrip(c);

        boolean recorded = DriveRecorderService.isRunning() || DrivePrefs.prefs(c).contains("active");
        if (recorded) {
            // The recorder knows where the drive ended and schedules the fuel check itself.
            DriveRecorderService.finishCurrent(c);
            done(pending);
            return;
        }
        if (!DrivePrefs.stopChecks(c) || !DrivePrefs.hasBackgroundLocation(c)) {
            done(pending);
            return;
        }
        LocationServices.getFusedLocationProviderClient(c)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    FuelStops.scheduleCheck(c, task.getResult().getLatitude(), task.getResult().getLongitude());
                }
                done(pending);
            });
    }

    private static void done(BroadcastReceiver.PendingResult pending) {
        if (pending != null) pending.finish();
    }
}
