package com.meksova.app.drive;

import android.content.Context;
import java.util.Calendar;
import java.util.Iterator;
import java.util.Locale;
import org.json.JSONObject;

/**
 * Business miles per day ({ "2026-10-30": 12.4, ... }) for the widget and the
 * weekly summary, which run while the app is closed and can't ask the backend.
 * The app replaces it with the server's numbers whenever it opens (set) and
 * adds trips it saves in between (add).
 */
final class MilesLog {

    private static final String KEY = "milesLog";
    private static final int KEEP_DAYS = 21;

    private MilesLog() {}

    static String key(Calendar cal) {
        return String.format(Locale.US, "%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    static String key(long ms) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(ms);
        return key(cal);
    }

    private static synchronized JSONObject read(Context c) {
        try {
            return new JSONObject(DrivePrefs.prefs(c).getString(KEY, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static void write(Context c, JSONObject log) {
        // Drop old days so the log stays small.
        Calendar cutoff = Calendar.getInstance();
        cutoff.add(Calendar.DAY_OF_MONTH, -KEEP_DAYS);
        String min = key(cutoff);
        Iterator<String> it = log.keys();
        while (it.hasNext()) {
            if (it.next().compareTo(min) < 0) it.remove();
        }
        DrivePrefs.prefs(c).edit().putString(KEY, log.toString()).apply();
        DriveWidget.refresh(c);
    }

    static synchronized void set(Context c, JSONObject log) {
        write(c, log);
    }

    static synchronized void add(Context c, String dateKey, double miles) {
        JSONObject log = read(c);
        try {
            log.put(dateKey, Math.max(0, log.optDouble(dateKey, 0) + miles));
        } catch (Exception ignored) {
            return;
        }
        write(c, log);
    }

    /** Miles from `from` (inclusive) for `days` days. */
    static double sum(Context c, Calendar from, int days) {
        JSONObject log = read(c);
        Calendar day = (Calendar) from.clone();
        double total = 0;
        for (int i = 0; i < days; i++) {
            total += log.optDouble(key(day), 0);
            day.add(Calendar.DAY_OF_MONTH, 1);
        }
        return total;
    }

    static double today(Context c) {
        return read(c).optDouble(key(Calendar.getInstance()), 0);
    }

    /** Monday 00:00 of the current week. */
    static Calendar weekStart() {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        int back = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7; // Mon=0 … Sun=6
        cal.add(Calendar.DAY_OF_MONTH, -back);
        return cal;
    }
}
