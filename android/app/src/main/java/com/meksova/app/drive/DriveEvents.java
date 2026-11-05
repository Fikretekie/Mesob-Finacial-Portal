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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.json.JSONArray;

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
        List<ActivityTransition> transitions = new ArrayList<>(Arrays.asList(
            new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                .build(),
            new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                .build()
        ));
        if (DrivePrefs.trucking(c)) {
            transitions.add(new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.WALKING)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                .build());
        }
        ActivityTransitionRequest req = new ActivityTransitionRequest(transitions);
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
        if (DrivePrefs.dailyReview(c)) DriveDay.driveStarted(c);
        DriveShift.driveStarted(c);
        if (DrivePrefs.manualTrip(c)) return;
        // A shift means they're working, whatever the day.
        if (DrivePrefs.workdaysOnly(c) && DrivePrefs.isWeekend() && !DriveShift.on(c)) return;
        DriveShift.maybeRemind(c);
        if (DrivePrefs.autoRecord(c) && DrivePrefs.hasBackgroundLocation(c)) {
            if (!DriveRecorderService.isRunning()) DriveRecorderService.start(c);
        } else {
            DriveNotify.ask(c);
        }
    }

    /** A hand-started trip is running and they left the vehicle: a time the trip may really have ended. */
    private static void recordManualExit(Context c) {
        try {
            JSONArray exits = new JSONArray(DrivePrefs.prefs(c).getString("manualExits", "[]"));
            exits.put(System.currentTimeMillis());
            DrivePrefs.prefs(c).edit().putString("manualExits", exits.toString()).apply();
        } catch (Exception ignored) {
            // The Mileage Tracker still offers the long stops it noticed itself.
        }
    }

    /** Trucking: got out on foot, so a quick swap to another vehicle becomes a new piece. */
    static void onWalking(Context c) {
        if (DrivePrefs.enabled(c) && DrivePrefs.manualTrip(c)) recordManualExit(c);
        if (DrivePrefs.enabled(c) && DrivePrefs.trucking(c)) DriveRecorderService.splitIfStopped(c);
    }

    /** May finish asynchronously; calls pending.finish() when done (null = not from a receiver). */
    @SuppressLint("MissingPermission")
    static void onDriveEnd(Context c, BroadcastReceiver.PendingResult pending) {
        DriveNotify.cancel(c, DriveNotify.ID_ASK);
        if (!DrivePrefs.enabled(c)) {
            done(pending);
            return;
        }
        if (DrivePrefs.manualTrip(c)) {
            recordManualExit(c);
            DriveNotify.forgotTrip(c);
        }

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
