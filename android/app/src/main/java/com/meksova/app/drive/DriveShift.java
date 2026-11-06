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
    /** After "Personal", stop asking about drives for this long. */
    private static final long PERSONAL_QUIET_MS = 3 * 60 * 60 * 1000;

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
        DriveNotify.cancel(c, DriveNotify.ID_DRIVE_ASK);
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

    /**
     * A drive just started with no shift on: is it work or personal? It doesn't
     * depend on recording having started, and only the day's first one makes a sound.
     */
    static void askAboutDrive(Context c) {
        SharedPreferences p = DrivePrefs.prefs(c);
        if (!DrivePrefs.rideshare(c) || on(c) || !p.getBoolean("shiftReminder", true)) return;
        if (System.currentTimeMillis() < p.getLong("personalUntil", 0)) return;
        String today = MilesLog.key(System.currentTimeMillis());
        boolean firstToday = !today.equals(p.getString("driveAskSoundDay", ""));
        p.edit().putString("driveAskSoundDay", today).apply();
        DriveNotify.driveAsk(c, !firstToday);
    }

    /** "Personal" as they drive: this drive won't count, and no more asking for a while. */
    static void markPersonal(Context c) {
        DrivePrefs.prefs(c).edit().putLong("personalUntil", System.currentTimeMillis() + PERSONAL_QUIET_MS).apply();
        DriveNotify.cancel(c, DriveNotify.ID_DRIVE_ASK);
        DriveRecorderService.markPersonal(c);
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
        DriveNotify.cancel(c, DriveNotify.ID_DRIVE_ASK);
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
