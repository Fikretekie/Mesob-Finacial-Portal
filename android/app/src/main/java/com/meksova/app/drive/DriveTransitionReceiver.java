package com.meksova.app.drive;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionEvent;
import com.google.android.gms.location.ActivityTransitionResult;
import com.google.android.gms.location.DetectedActivity;

/** Receives "entered / left a vehicle" from Play services. */
public class DriveTransitionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ActivityTransitionResult.hasResult(intent)) return;
        ActivityTransitionResult result = ActivityTransitionResult.extractResult(intent);
        if (result == null) return;
        ActivityTransitionEvent latest = null;
        for (ActivityTransitionEvent e : result.getTransitionEvents()) {
            if (e.getActivityType() == DetectedActivity.IN_VEHICLE) latest = e;
        }
        if (latest == null) return;
        if (latest.getTransitionType() == ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
            DriveEvents.onDriveStart(context);
        } else {
            DriveEvents.onDriveEnd(context, goAsync());
        }
    }
}
