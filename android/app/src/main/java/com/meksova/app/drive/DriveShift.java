package com.meksova.app.drive;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * Rideshare "Start shift": while it's on, every recorded drive is logged as
 * work with no question. It can't tell a rider from an errand, but it works on
 * any phone and for any mix of gig apps, because it doesn't need to see them.
 */
final class DriveShift {

    /** No movement this long and a forgotten shift ends itself. */
    static final long AUTO_END_MS = 4 * 60 * 60 * 1000;
    private static final int ALARM_REQUEST = 4136;
    /** The "Driving for work?" reminder: enough to catch a forgotten shift without nagging. */
    private static final int REMINDERS_PER_DAY = 2;
    private static final long REMINDER_GAP_MS = 3 * 60 * 60 * 1000;

    private DriveShift() {}

    static boolean on(Context c) {
        return DrivePrefs.prefs(c).getBoolean("shiftOn", false);
    }

    static void start(Context c) {
        if (on(c)) return;
        DrivePrefs.prefs(c).edit()
            .putBoolean("shiftOn", true)
            .putLong("shiftAt", System.currentTimeMillis())
            .putInt("shiftDrives", 0)
            .putFloat("shiftMiles", 0f)
            .apply();
        DriveNotify.cancel(c, DriveNotify.ID_SHIFT_ENDED);
        DriveNotify.cancel(c, DriveNotify.ID_SHIFT_ASK);
        stopAsking(c);
        DriveNotify.shiftOn(c);
        scheduleAutoEnd(c);
        DriveWidget.refresh(c);
    }

    /** @param auto ended by itself, so say why; quiet: nothing to tell (signing out). */
    static void end(Context c, boolean auto, boolean quiet) {
        if (!on(c)) return;
        SharedPreferences p = DrivePrefs.prefs(c);
        int drives = p.getInt("shiftDrives", 0);
        double miles = p.getFloat("shiftMiles", 0f);
        p.edit().putBoolean("shiftOn", false).apply();
        alarm(c).cancel(pending(c));
        DriveNotify.cancel(c, DriveNotify.ID_SHIFT);
        if (!quiet) DriveNotify.shiftEnded(c, auto, drives, miles);
        DriveWidget.refresh(c);
    }

    /** A drive just started with no shift on: maybe remind them, quietly. */
    static void maybeRemind(Context c) {
        SharedPreferences p = DrivePrefs.prefs(c);
        if (!DrivePrefs.rideshare(c) || on(c) || !p.getBoolean("shiftReminder", true)) return;
        String today = MilesLog.key(System.currentTimeMillis());
        if (today.equals(p.getString("shiftMutedDay", ""))) return;
        boolean sameDay = today.equals(p.getString("shiftReminderDay", ""));
        int shown = sameDay ? p.getInt("shiftReminderCount", 0) : 0;
        if (shown >= REMINDERS_PER_DAY) return;
        if (sameDay && System.currentTimeMillis() - p.getLong("shiftReminderAt", 0) < REMINDER_GAP_MS) return;
        p.edit()
            .putString("shiftReminderDay", today)
            .putInt("shiftReminderCount", shown + 1)
            .putLong("shiftReminderAt", System.currentTimeMillis())
            .apply();
        if (DrivePrefs.autoRecord(c) && DrivePrefs.hasBackgroundLocation(c)) {
            // Android stacks an app's silent notifications and hides their buttons, so
            // while recording the buttons go on that one notification instead of a second.
            p.edit().putBoolean("shiftAskOnRecording", true).apply();
            DriveRecorderService.refreshNotification(c);
        } else {
            DriveNotify.shiftAsk(c);
        }
    }

    static boolean askingOnRecording(Context c) {
        return DrivePrefs.rideshare(c) && !on(c) && DrivePrefs.prefs(c).getBoolean("shiftAskOnRecording", false);
    }

    private static void stopAsking(Context c) {
        DrivePrefs.prefs(c).edit().remove("shiftAskOnRecording").apply();
        DriveRecorderService.refreshNotification(c);
    }

    /** "Not today": no more reminders until tomorrow. */
    static void muteToday(Context c) {
        DrivePrefs.prefs(c).edit().putString("shiftMutedDay", MilesLog.key(System.currentTimeMillis())).apply();
        DriveNotify.cancel(c, DriveNotify.ID_SHIFT_ASK);
        stopAsking(c);
    }

    static void driveCounted(Context c, double miles) {
        SharedPreferences p = DrivePrefs.prefs(c);
        p.edit()
            .putInt("shiftDrives", p.getInt("shiftDrives", 0) + 1)
            .putFloat("shiftMiles", p.getFloat("shiftMiles", 0f) + (float) miles)
            .apply();
    }

    static void driveStarted(Context c) {
        if (on(c)) alarm(c).cancel(pending(c));
    }

    static void driveEnded(Context c) {
        DrivePrefs.prefs(c).edit().remove("shiftAskOnRecording").apply();
        if (on(c)) scheduleAutoEnd(c);
    }

    private static void scheduleAutoEnd(Context c) {
        alarm(c).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + AUTO_END_MS, pending(c));
    }

    private static AlarmManager alarm(Context c) {
        return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    }

    private static PendingIntent pending(Context c) {
        Intent i = new Intent(c, DriveActionReceiver.class).setAction(DriveActionReceiver.SHIFT_AUTO_END);
        return PendingIntent.getBroadcast(c, ALARM_REQUEST, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
