package com.meksova.app.drive;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Trucking: a day of driving is a list of pieces, split at each stop. Nothing
 * counts toward IFTA until the driver confirms a piece was the truck, because a
 * phone can't tell the truck from their own car. This asks "Did you finish your
 * trip?" after a long stop, and points them at the list once they've stopped
 * moving for a while.
 */
public class DriveDay extends BroadcastReceiver {

    /** Stopped this long: the piece ends and the driver gets asked. */
    static final long STOP_ASK_MS = 10 * 60 * 1000;
    /** No movement this long: the day's pieces are ready to review. */
    static final long REVIEW_AFTER_MS = 4 * 60 * 60 * 1000;

    static final String ASK = "com.meksova.app.drive.DAY_ASK";
    static final String REVIEW = "com.meksova.app.drive.DAY_REVIEW";

    private static final int ASK_REQUEST = 4120;
    private static final int REVIEW_REQUEST = 4121;

    /**
     * A piece just ended.
     * @param stoppedFor how long the truck had already been parked, or -1 not to ask
     *                   (the recorder is still running, or this is a leftover drive).
     * @param kept       false when the piece was too short to keep.
     */
    static void pieceEnded(Context c, long stoppedFor, boolean kept) {
        if (!DrivePrefs.trucking(c)) return;
        schedule(c, REVIEW, REVIEW_REQUEST, REVIEW_AFTER_MS);
        if (kept && stoppedFor >= 0) schedule(c, ASK, ASK_REQUEST, Math.max(1000, STOP_ASK_MS - stoppedFor));
    }

    /** Moving again: there's no finished trip to ask about, and the day isn't over. */
    static void driveStarted(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.cancel(pending(c, ASK, ASK_REQUEST));
        am.cancel(pending(c, REVIEW, REVIEW_REQUEST));
        DriveNotify.cancel(c, DriveNotify.ID_STOP_ASK);
    }

    private static void schedule(Context c, String action, int request, long delayMs) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + delayMs, pending(c, action, request));
    }

    private static PendingIntent pending(Context c, String action, int request) {
        Intent i = new Intent(c, DriveDay.class).setAction(action);
        return PendingIntent.getBroadcast(c, request, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Pieces still waiting for an answer. A piece on the driver's own car doesn't need one. */
    private static boolean waiting(JSONObject d) {
        return d != null && d.isNull("type") && !"car".equals(d.optString("vehicle"));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        fire(context, intent.getAction());
    }

    static void fire(Context c, String action) {
        if (!DrivePrefs.enabled(c) || !DrivePrefs.trucking(c) || DriveRecorderService.isRunning()) return;
        if (ASK.equals(action)) {
            DriveNotify.stopAsk(c);
        } else if (REVIEW.equals(action)) {
            JSONArray drives = DriveStore.all(c);
            int count = 0;
            double miles = 0;
            for (int i = 0; i < drives.length(); i++) {
                JSONObject d = drives.optJSONObject(i);
                if (waiting(d)) {
                    count++;
                    miles += d.optDouble("miles", 0);
                }
            }
            if (count > 0) DriveNotify.dayReview(c, count, miles);
        }
    }
}
