package com.meksova.app.drive;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.tasks.Tasks;
import com.google.android.libraries.places.api.Places;
import com.google.android.libraries.places.api.model.CircularBounds;
import com.google.android.libraries.places.api.model.Place;
import com.google.android.libraries.places.api.net.SearchNearbyRequest;
import com.google.android.libraries.places.api.net.SearchNearbyResponse;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Did the user just stop somewhere with a receipt worth scanning?" — a gas
 * station, a business-supply store or a repair shop. Google Places when a key
 * is configured (see app/build.gradle), else OpenStreetMap's public Overpass API.
 * Runs only after a 3-minute stop, so a few lookups per driver per day.
 */
final class FuelStops {

    /** How long a stop must last before it counts as a fill-up. */
    static final long DWELL_MS = 3 * 60 * 1000;

    private static final String TAG = "MeksovaStops";
    private static final int RADIUS_M = 80;
    private static final long REPEAT_WINDOW_MS = 60 * 60 * 1000;
    /** Google answered "nothing here" — don't second-guess it with the fallback. */
    private static final Stop NONE = new Stop("", "");

    static final String FUEL = "fuel";
    static final String STORE = "store";
    static final String REPAIR = "repair";

    // Places API (New) types. Groceries are left out on purpose: mostly personal.
    private static final String[] STORE_TYPES = {
        "hardware_store", "home_improvement_store", "auto_parts_store", "electronics_store",
        "furniture_store", "department_store", "warehouse_store", "wholesaler", "discount_store",
    };
    private static final String[] REPAIR_TYPES = { "car_repair", "car_wash" };

    /** What was found: a display name ("" when unnamed) and FUEL / STORE / REPAIR. */
    static final class Stop {
        final String name;
        final String kind;

        Stop(String name, String kind) {
            this.name = name;
            this.kind = kind;
        }
    }
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private FuelStops() {}

    /**
     * Car stopped at (lat, lng) without the recorder running: check again
     * after the dwell time, and only if the user hasn't driven off by then.
     */
    static void scheduleCheck(Context c, double lat, double lng) {
        long exitAt = System.currentTimeMillis();
        DrivePrefs.prefs(c).edit().putLong("lastExitAt", exitAt).apply();
        Intent i = new Intent(c, FuelCheckReceiver.class)
            .putExtra("lat", lat)
            .putExtra("lng", lng)
            .putExtra("exitAt", exitAt);
        PendingIntent pi = PendingIntent.getBroadcast(c, 4110, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, exitAt + DWELL_MS, pi);
    }

    /** Looks up (lat, lng) off the main thread and notifies if it's a fuel station, store or repair shop. */
    static void checkAsync(Context c, double lat, double lng, Runnable done) {
        Context app = c.getApplicationContext();
        IO.execute(() -> {
            try {
                if (!recentlyNotifiedNear(app, lat, lng)) {
                    Stop stop = lookup(app, lat, lng, DrivePrefs.fuelStops(app), DrivePrefs.storeStops(app));
                    if (stop != null) {
                        DrivePrefs.prefs(app).edit()
                            .putLong("fuelAt", System.currentTimeMillis())
                            .putString("fuelLat", String.valueOf(lat))
                            .putString("fuelLng", String.valueOf(lng))
                            .apply();
                        if (FUEL.equals(stop.kind)) DriveNotify.fuel(app, stop.name, lat, lng);
                        else DriveNotify.store(app, stop.name, stop.kind, lat, lng);
                    }
                }
            } finally {
                if (done != null) done.run();
            }
        });
    }

    private static boolean recentlyNotifiedNear(Context c, double lat, double lng) {
        SharedPreferences p = DrivePrefs.prefs(c);
        if (System.currentTimeMillis() - p.getLong("fuelAt", 0) > REPEAT_WINDOW_MS) return false;
        float[] d = new float[1];
        try {
            Location.distanceBetween(lat, lng, Double.parseDouble(p.getString("fuelLat", "0")), Double.parseDouble(p.getString("fuelLng", "0")), d);
        } catch (NumberFormatException e) {
            return false;
        }
        return d[0] < 300;
    }

    /** The nearest place of the wanted kinds, or null for none / lookup failed. */
    static Stop lookup(Context c, double lat, double lng, boolean fuel, boolean stores) {
        if (!fuel && !stores) return null;
        String key = placesKey(c);
        if (!key.isEmpty()) {
            Stop r = lookupGoogle(c, key, lat, lng, fuel, stores);
            if (r == NONE) return null;
            if (r != null) return r;
        }
        return lookupOsm(lat, lng, fuel, stores);
    }

    private static boolean has(List<String> types, String[] wanted) {
        if (types == null) return false;
        for (String w : wanted) if (types.contains(w)) return true;
        return false;
    }

    private static String placesKey(Context c) {
        try {
            ApplicationInfo ai = c.getPackageManager().getApplicationInfo(c.getPackageName(), PackageManager.GET_META_DATA);
            String k = ai.metaData == null ? null : ai.metaData.getString("com.meksova.PLACES_KEY");
            return k == null ? "" : k.trim();
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Places API (New) Nearby Search through the Places SDK, which identifies
     * the app itself to the Android-restricted key. Called on the IO thread.
     */
    private static Stop lookupGoogle(Context c, String key, double lat, double lng, boolean fuel, boolean stores) {
        try {
            Context app = c.getApplicationContext();
            if (!Places.isInitialized()) Places.initializeWithNewPlacesApiEnabled(app, key);
            List<String> types = new ArrayList<>();
            if (fuel) types.add("gas_station");
            if (stores) {
                Collections.addAll(types, STORE_TYPES);
                Collections.addAll(types, REPAIR_TYPES);
            }
            SearchNearbyRequest request = SearchNearbyRequest.builder(
                    CircularBounds.newInstance(new LatLng(lat, lng), RADIUS_M),
                    Arrays.asList(Place.Field.DISPLAY_NAME, Place.Field.TYPES))
                .setIncludedTypes(types)
                .setMaxResultCount(1)
                .setRankPreference(SearchNearbyRequest.RankPreference.DISTANCE)
                .build();
            SearchNearbyResponse response = Tasks.await(Places.createClient(app).searchNearby(request), 20, TimeUnit.SECONDS);
            List<Place> places = response.getPlaces();
            if (places == null || places.isEmpty()) return NONE;
            Place place = places.get(0);
            List<String> placeTypes = place.getPlaceTypes();
            // A gas station with a car wash is still a fuel stop.
            String kind = fuel && has(placeTypes, new String[] { "gas_station" }) ? FUEL
                : has(placeTypes, REPAIR_TYPES) ? REPAIR : STORE;
            String name = place.getDisplayName();
            return new Stop(name == null ? "" : name, kind);
        } catch (Exception e) {
            // Key / billing / network trouble: say why in logcat, then try the fallback.
            Log.w(TAG, "Places lookup failed: " + e.getMessage());
            return null;
        }
    }

    /** OpenStreetMap fallback. Public Overpass servers are often overloaded; fine for development only. */
    private static Stop lookupOsm(double lat, double lng, boolean fuel, boolean stores) {
        String around = "(around:" + RADIUS_M + "," + lat + "," + lng + ")";
        StringBuilder q = new StringBuilder("[out:json][timeout:10];(");
        if (fuel) q.append("nwr").append(around).append("[amenity=fuel];");
        if (stores) {
            q.append("nwr").append(around).append("[shop~\"^(hardware|doityourself|trade|car_parts|tyres|car_repair|electronics|furniture|department_store|wholesale)$\"];");
            q.append("nwr").append(around).append("[amenity=car_wash];");
        }
        q.append(");out tags 1;");
        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://overpass-api.de/api/interpreter?data=" + URLEncoder.encode(q.toString(), "UTF-8"));
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("User-Agent", "Meksova/1.0 (com.meksova.app)");
            if (conn.getResponseCode() != 200) return null;
            JSONArray els = new JSONObject(read(conn)).optJSONArray("elements");
            if (els == null || els.length() == 0) return null;
            JSONObject tags = els.getJSONObject(0).optJSONObject("tags");
            if (tags == null) return new Stop("", fuel ? FUEL : STORE);
            String shop = tags.optString("shop", "");
            String kind = "fuel".equals(tags.optString("amenity")) ? FUEL
                : "car_wash".equals(tags.optString("amenity")) || "car_repair".equals(shop) || "tyres".equals(shop) ? REPAIR : STORE;
            String brand = tags.optString("brand", "");
            return new Stop(brand.isEmpty() ? tags.optString("name", "") : brand, kind);
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String read(HttpURLConnection conn) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }
}
