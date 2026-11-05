package com.meksova.app.drive;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import java.util.Calendar;
import org.json.JSONObject;

/**
 * Settings the web app pushes down (DriveMonitor.configure) plus the small bits
 * of state the background pieces share. Everything lives in one
 * SharedPreferences file so receivers work while the app is closed.
 */
final class DrivePrefs {

    private static final String FILE = "mksv_drive";

    private DrivePrefs() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean("enabled", false);
    }

    static boolean autoRecord(Context c) {
        return prefs(c).getBoolean("autoRecord", true);
    }

    static boolean fuelStops(Context c) {
        return prefs(c).getBoolean("fuelStops", true);
    }

    /** Stores and repair shops (supplies, parts, maintenance receipts). */
    static boolean storeStops(Context c) {
        return prefs(c).getBoolean("storeStops", true);
    }

    /** Trucking accounts: drives are reviewed in a daily list, and only confirmed truck drives count for IFTA. */
    static boolean trucking(Context c) {
        return prefs(c).getBoolean("trucking", false);
    }

    /** Rideshare / gig accounts: one car for every app, so drives are sorted work or personal in a daily list. */
    static boolean rideshare(Context c) {
        return prefs(c).getBoolean("rideshare", false);
    }

    /** No alert per drive: they wait in a list that's reviewed when the day looks over. */
    static boolean dailyReview(Context c) {
        return trucking(c) || rideshare(c);
    }

    /** Any kind of stop worth a receipt lookup. */
    static boolean stopChecks(Context c) {
        return fuelStops(c) || storeStops(c);
    }

    static boolean workdaysOnly(Context c) {
        return prefs(c).getBoolean("workdaysOnly", false);
    }

    /** A trip started by hand in the Mileage Tracker is running. */
    static boolean manualTrip(Context c) {
        return prefs(c).getBoolean("manualTrip", false);
    }

    static boolean isWeekend() {
        int d = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
        return d == Calendar.SATURDAY || d == Calendar.SUNDAY;
    }

    static boolean has(Context c, String permission) {
        return ContextCompat.checkSelfPermission(c, permission) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasActivity(Context c) {
        // Before Android 10 activity recognition is an install-time permission.
        return Build.VERSION.SDK_INT < 29 || has(c, Manifest.permission.ACTIVITY_RECOGNITION);
    }

    static boolean hasBackgroundLocation(Context c) {
        if (!has(c, Manifest.permission.ACCESS_FINE_LOCATION)) return false;
        return Build.VERSION.SDK_INT < 29 || has(c, Manifest.permission.ACCESS_BACKGROUND_LOCATION);
    }

    /**
     * Notification text in the language the user picked in the app (the web
     * side sends it), falling back to English.
     */
    static String str(Context c, String key, String fallback) {
        try {
            JSONObject s = new JSONObject(prefs(c).getString("strings", "{}"));
            String v = s.optString(key, "");
            return v.isEmpty() ? fallback : v;
        } catch (Exception e) {
            return fallback;
        }
    }
}
