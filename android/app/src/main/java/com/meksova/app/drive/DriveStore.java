package com.meksova.app.drive;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Recorded drives waiting for the web app to pick them up. A drive stays here
 * until the app has saved it to the backend (the app holds the sign-in, the
 * background pieces don't), then the app removes it.
 *
 * Drive: { id, startedAt, endedAt, miles, points: [[lat, lng], ...], type }
 * where type is null until the user picks "business" or "personal".
 * Personal drives are never saved to the books; they wait here for
 * UNDO_WINDOW_MS (so an accidental tap can be undone), then the app drops them.
 */
final class DriveStore {

    private static final String KEY = "drives";
    private static final int MAX_DRIVES = 200;
    static final long UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

    private DriveStore() {}

    static synchronized JSONArray all(Context c) {
        try {
            return new JSONArray(DrivePrefs.prefs(c).getString(KEY, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static void save(Context c, JSONArray drives) {
        DrivePrefs.prefs(c).edit().putString(KEY, drives.toString()).apply();
    }

    static synchronized void add(Context c, JSONObject drive) {
        JSONArray drives = all(c);
        drives.put(drive);
        // Never grow without bound if the app isn't opened for months.
        while (drives.length() > MAX_DRIVES) drives.remove(0);
        save(c, drives);
    }

    static synchronized JSONObject get(Context c, String id) {
        JSONArray drives = all(c);
        for (int i = 0; i < drives.length(); i++) {
            JSONObject d = drives.optJSONObject(i);
            if (d != null && id.equals(d.optString("id"))) return d;
        }
        return null;
    }

    /** type: "business", "personal", or null to put the drive back up for review (undo). */
    static boolean classify(Context c, String id, String type) {
        return classify(c, id, type, null);
    }

    /** load (trucking business drives): "loaded" or "empty" (deadhead); null for none. */
    static synchronized boolean classify(Context c, String id, String type, String load) {
        JSONArray drives = all(c);
        for (int i = 0; i < drives.length(); i++) {
            JSONObject d = drives.optJSONObject(i);
            if (d != null && id.equals(d.optString("id"))) {
                boolean wasBusiness = "business".equals(d.optString("type"));
                boolean isBusiness = "business".equals(type);
                if (wasBusiness != isBusiness) {
                    // Keep the widget / weekly summary totals in step.
                    MilesLog.add(c, MilesLog.key(d.optLong("endedAt")), (isBusiness ? 1 : -1) * d.optDouble("miles", 0));
                }
                try {
                    d.put("type", type == null ? JSONObject.NULL : type);
                    if ("personal".equals(type)) {
                        d.put("personalAt", System.currentTimeMillis());
                    } else {
                        d.remove("personalAt");
                    }
                    if (load != null) {
                        d.put("load", load);
                    } else {
                        d.remove("load");
                    }
                } catch (Exception ignored) {
                    return false;
                }
                save(c, drives);
                return true;
            }
        }
        return false;
    }

    static synchronized void remove(Context c, String id) {
        JSONArray drives = all(c);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < drives.length(); i++) {
            JSONObject d = drives.optJSONObject(i);
            if (d != null && !id.equals(d.optString("id"))) kept.put(d);
        }
        save(c, kept);
    }
}
