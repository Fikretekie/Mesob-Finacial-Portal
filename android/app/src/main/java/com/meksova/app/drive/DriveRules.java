package com.meksova.app.drive;

import android.content.Context;
import android.location.Location;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Always business" rules the user sets in the app, so most drives never need
 * a tap: drives starting or ending at a saved place (depot, a main client), or
 * drives starting within work hours on a weekday.
 *
 * rules: { hours: { on, start, end }, places: [ { name, lat, lng } ] }
 * (start/end are hours of the day, 0–24).
 */
final class DriveRules {

    private static final float PLACE_RADIUS_M = 250f;

    private DriveRules() {}

    private static JSONObject rules(Context c) {
        try {
            return new JSONObject(DrivePrefs.prefs(c).getString("rules", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** Why this drive is business (place name, or the hours label), or null if no rule matches. */
    static String match(Context c, JSONObject drive) {
        JSONObject r = rules(c);
        JSONArray points = drive.optJSONArray("points");
        JSONArray places = r.optJSONArray("places");
        if (points != null && points.length() > 0 && places != null) {
            JSONArray first = points.optJSONArray(0);
            JSONArray last = points.optJSONArray(points.length() - 1);
            for (int i = 0; i < places.length(); i++) {
                JSONObject p = places.optJSONObject(i);
                if (p == null) continue;
                if (near(first, p) || near(last, p)) return p.optString("name", "");
            }
        }
        JSONObject hours = r.optJSONObject("hours");
        if (hours != null && hours.optBoolean("on", false)) {
            Calendar cal = Calendar.getInstance();
            cal.setTimeInMillis(drive.optLong("startedAt"));
            int dow = cal.get(Calendar.DAY_OF_WEEK);
            double h = cal.get(Calendar.HOUR_OF_DAY) + cal.get(Calendar.MINUTE) / 60.0;
            boolean weekday = dow != Calendar.SATURDAY && dow != Calendar.SUNDAY;
            if (weekday && h >= hours.optDouble("start", 8) && h < hours.optDouble("end", 18)) {
                return DrivePrefs.str(c, "ruleHours", "Work hours");
            }
        }
        return null;
    }

    private static boolean near(JSONArray point, JSONObject place) {
        if (point == null || point.length() < 2) return false;
        float[] d = new float[1];
        Location.distanceBetween(point.optDouble(0), point.optDouble(1), place.optDouble("lat"), place.optDouble("lng"), d);
        return d[0] <= PLACE_RADIUS_M;
    }
}
