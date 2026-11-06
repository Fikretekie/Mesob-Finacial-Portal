package com.meksova.app.drive;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Notification buttons that act without opening the app. */
public class DriveActionReceiver extends BroadcastReceiver {

    static final String CLASSIFY_BUSINESS = "com.meksova.app.drive.BUSINESS";
    static final String CLASSIFY_PERSONAL = "com.meksova.app.drive.PERSONAL";
    /** Trucking: business miles, with or without a load. */
    static final String CLASSIFY_LOADED = "com.meksova.app.drive.LOADED";
    static final String CLASSIFY_EMPTY = "com.meksova.app.drive.EMPTY";
    static final String DISCARD_RECORDING = "com.meksova.app.drive.DISCARD";
    static final String DISMISS_ASK = "com.meksova.app.drive.DISMISS_ASK";
    static final String UNDO_PERSONAL = "com.meksova.app.drive.UNDO_PERSONAL";
    /** "Not now" on a fuel / store / repair stop reminder. */
    static final String DISMISS_STOP = "com.meksova.app.drive.DISMISS_STOP";
    /** Trucking, "Did you finish your trip?" */
    static final String TRIP_FINISHED = "com.meksova.app.drive.TRIP_FINISHED";
    static final String KEEP_RECORDING = "com.meksova.app.drive.KEEP_RECORDING";
    static final String SHIFT_START = "com.meksova.app.drive.SHIFT_START";
    static final String SHIFT_END = "com.meksova.app.drive.SHIFT_END";
    static final String SHIFT_AUTO_END = "com.meksova.app.drive.SHIFT_AUTO_END";
    /** Rideshare, on the notification as a drive starts. */
    static final String DRIVE_WORK = "com.meksova.app.drive.DRIVE_WORK";
    static final String DRIVE_PERSONAL = "com.meksova.app.drive.DRIVE_PERSONAL";
    /** Rideshare, on the notification after they've stopped. */
    static final String FINAL_WORK = "com.meksova.app.drive.FINAL_WORK";
    static final String FINAL_PERSONAL = "com.meksova.app.drive.FINAL_PERSONAL";
    /** Periodic: Android can drop driving detection, so ask for it again. */
    static final String RE_REGISTER = "com.meksova.app.drive.RE_REGISTER";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String id = intent.getStringExtra("id");
        if (CLASSIFY_BUSINESS.equals(action) || CLASSIFY_LOADED.equals(action) || CLASSIFY_EMPTY.equals(action)
            || CLASSIFY_PERSONAL.equals(action)) {
            if (id == null) return;
            if (!CLASSIFY_PERSONAL.equals(action)) {
                // Saved to the backend the next time the app opens.
                String load = CLASSIFY_LOADED.equals(action) ? "loaded" : CLASSIFY_EMPTY.equals(action) ? "empty" : null;
                DriveStore.classify(context, id, "business", load);
                DriveNotify.cancel(context, DriveNotify.classifyId(id));
            } else if (DriveStore.get(context, id) == null) {
                // Already sent to the books (app was open): say so instead of "not saved".
                DriveNotify.alreadySaved(context, id);
            } else {
                // Personal miles have no place in the books — but keep it
                // undoable for a while in case the tap was a slip.
                DriveStore.classify(context, id, "personal");
                DriveNotify.personalUndo(context, id);
            }
        } else if (UNDO_PERSONAL.equals(action)) {
            if (id == null) return;
            DriveStore.classify(context, id, null);
            org.json.JSONObject drive = DriveStore.get(context, id);
            if (drive != null && !DrivePrefs.dailyReview(context)) DriveNotify.classify(context, drive);
            else if (drive != null && DrivePrefs.rideshare(context)) {
                // Back to the question it came from.
                DriveNotify.cancel(context, DriveNotify.classifyId(id));
                DriveNotify.driveFinal(context);
            }
        } else if (DISCARD_RECORDING.equals(action)) {
            DriveRecorderService.discardCurrent(context);
        } else if (DISMISS_ASK.equals(action)) {
            DriveNotify.cancel(context, DriveNotify.ID_ASK);
        } else if (DISMISS_STOP.equals(action)) {
            DriveNotify.cancel(context, DriveNotify.ID_FUEL);
        } else if (SHIFT_START.equals(action)) {
            if (DrivePrefs.enabled(context)) DriveShift.start(context);
        } else if (DRIVE_WORK.equals(action)) {
            if (DrivePrefs.enabled(context)) DriveShift.start(context);
        } else if (DRIVE_PERSONAL.equals(action)) {
            DriveShift.markPersonal(context);
        } else if (FINAL_WORK.equals(action)) {
            if (id != null) DriveStore.classify(context, id, "business");
            DriveNotify.cancel(context, DriveNotify.ID_STOP_ASK);
        } else if (FINAL_PERSONAL.equals(action)) {
            DriveNotify.cancel(context, DriveNotify.ID_STOP_ASK);
            if (id != null) {
                DriveStore.classify(context, id, "personal");
                DriveNotify.personalUndo(context, id);
            }
        } else if (RE_REGISTER.equals(action)) {
            if (DrivePrefs.enabled(context)) DriveEvents.register(context);
        } else if (SHIFT_END.equals(action)) {
            DriveShift.end(context, false, false);
        } else if (SHIFT_AUTO_END.equals(action)) {
            // Still driving: this drive's end sets the next deadline.
            if (!DriveRecorderService.isRunning()) DriveShift.end(context, true, false);
        } else if (TRIP_FINISHED.equals(action)) {
            DriveNotify.cancel(context, DriveNotify.ID_STOP_ASK);
            // Rideshare: done means the drive home doesn't count as work.
            DriveShift.end(context, false, false);
        } else if (KEEP_RECORDING.equals(action)) {
            DriveNotify.cancel(context, DriveNotify.ID_STOP_ASK);
            DrivePrefs.prefs(context).edit().putBoolean("keepRecording", true).apply();
            try {
                if (!DriveRecorderService.isRunning()) DriveRecorderService.start(context);
            } catch (Exception e) {
                // Android refused: the next drive it detects still gets recorded.
            }
        }
    }
}
