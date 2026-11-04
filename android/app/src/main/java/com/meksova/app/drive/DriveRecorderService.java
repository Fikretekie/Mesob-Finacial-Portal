package com.meksova.app.drive;

import android.annotation.SuppressLint;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Records one drive in the background (started when Android reports the user
 * got into a vehicle). Same accuracy / jitter filters as the Mileage Tracker.
 * The in-progress drive is persisted on every point so a killed process loses
 * nothing: the next drive end finishes it from storage.
 */
public class DriveRecorderService extends Service {

    private static final float MAX_ACCURACY_M = 50f;
    private static final float MIN_STEP_M = 8f;
    /** One saved point per this many meters — enough to split miles by state. */
    private static final float SAMPLE_EVERY_M = 400f;
    private static final float STATIONARY_RADIUS_M = 40f;
    /** Parked this long with no "left vehicle" event: treat the drive as over. */
    private static final long STATIONARY_END_MS = 12 * 60 * 1000;
    private static final double MIN_DRIVE_MILES = 0.5;
    private static final double METERS_PER_MILE = 1609.344;

    private static DriveRecorderService instance;

    private FusedLocationProviderClient client;
    private JSONObject active;
    private Location last;
    private Location lastSample;
    private Location anchor;
    private long anchorAt;
    private boolean fuelChecked;
    private double notifiedMiles;

    static void start(Context c) {
        ContextCompat.startForegroundService(c, new Intent(c, DriveRecorderService.class));
    }

    static boolean isRunning() {
        return instance != null;
    }

    /** Car left: save the drive. Also finishes a drive left over from a killed process. */
    static void finishCurrent(Context c) {
        if (instance != null) {
            instance.finish(true);
        } else {
            finalizeStored(c);
        }
    }

    /** "Personal, don't log" or a hand-started trip took over. */
    static void discardCurrent(Context c) {
        if (instance != null) {
            instance.finish(false);
        } else {
            DrivePrefs.prefs(c).edit().remove("active").apply();
        }
        DriveNotify.cancel(c, DriveNotify.ID_RECORDING);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        client = LocationServices.getFusedLocationProviderClient(this);
    }

    @SuppressLint("MissingPermission")
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(DriveNotify.ID_RECORDING, DriveNotify.recording(this, 0), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(DriveNotify.ID_RECORDING, DriveNotify.recording(this, 0));
            }
        } catch (Exception e) {
            // Not allowed to start from the background right now (or permission revoked).
            stopSelf();
            return START_NOT_STICKY;
        }
        if (active == null) begin();
        return START_NOT_STICKY;
    }

    @SuppressLint("MissingPermission")
    private void begin() {
        finalizeStored(this);
        active = new JSONObject();
        try {
            active.put("id", UUID.randomUUID().toString());
            active.put("startedAt", System.currentTimeMillis());
            active.put("miles", 0);
            active.put("points", new JSONArray());
        } catch (Exception ignored) {
            // put() on fresh keys can't fail.
        }
        persist();
        DriveWidget.refresh(this);
        if (!DrivePrefs.hasBackgroundLocation(this)) {
            finish(false);
            return;
        }
        // No minimum distance: updates must keep coming while parked so a
        // fuel stop (or the end of the drive) can be noticed.
        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000).build();
        client.requestLocationUpdates(req, callback, Looper.getMainLooper());
    }

    private final LocationCallback callback = new LocationCallback() {
        @Override
        public void onLocationResult(@NonNull LocationResult result) {
            for (Location loc : result.getLocations()) onLocation(loc);
        }
    };

    private void onLocation(Location loc) {
        if (active == null || !loc.hasAccuracy() || loc.getAccuracy() > MAX_ACCURACY_M) return;
        long now = System.currentTimeMillis();

        if (last != null) {
            float step = last.distanceTo(loc);
            if (step < MIN_STEP_M) {
                checkStationary(loc, now);
                return;
            }
            double miles = active.optDouble("miles", 0) + step / METERS_PER_MILE;
            try {
                active.put("miles", miles);
            } catch (Exception ignored) {
                // Unreachable for a double.
            }
            if (miles - notifiedMiles >= 0.5) {
                notifiedMiles = miles;
                DriveNotify.post(this, DriveNotify.ID_RECORDING, DriveNotify.recording(this, miles));
            }
        }
        last = loc;
        if (lastSample == null || lastSample.distanceTo(loc) >= SAMPLE_EVERY_M) {
            addPoint(loc);
            lastSample = loc;
        }
        checkStationary(loc, now);
        persist();
    }

    /** Fuel and store stops happen mid-drive too: 3 minutes parked in one spot gets a lookup. */
    private void checkStationary(Location loc, long now) {
        if (anchor == null || anchor.distanceTo(loc) > STATIONARY_RADIUS_M) {
            anchor = loc;
            anchorAt = now;
            fuelChecked = false;
            return;
        }
        long parked = now - anchorAt;
        if (!fuelChecked && parked >= FuelStops.DWELL_MS && DrivePrefs.stopChecks(this)) {
            fuelChecked = true;
            FuelStops.checkAsync(this, loc.getLatitude(), loc.getLongitude(), null);
        }
        if (parked >= STATIONARY_END_MS) finish(true);
    }

    private void addPoint(Location loc) {
        JSONArray points = active.optJSONArray("points");
        if (points == null) return;
        JSONArray p = new JSONArray();
        try {
            p.put(Math.round(loc.getLatitude() * 1e5) / 1e5);
            p.put(Math.round(loc.getLongitude() * 1e5) / 1e5);
        } catch (Exception ignored) {
            return;
        }
        points.put(p);
    }

    private void persist() {
        if (active != null) DrivePrefs.prefs(this).edit().putString("active", active.toString()).apply();
    }

    private void finish(boolean save) {
        if (client != null) client.removeLocationUpdates(callback);
        if (active != null && last != null && (lastSample == null || lastSample.distanceTo(last) > 0)) addPoint(last);
        if (save) {
            persist();
            finalizeStored(this);
        } else {
            DrivePrefs.prefs(this).edit().remove("active").apply();
        }
        active = null;
        stopForeground(true);
        stopSelf();
    }

    /** Moves the stored in-progress drive to the review list (or drops it if too short). */
    private static void finalizeStored(Context c) {
        String raw = DrivePrefs.prefs(c).getString("active", null);
        DrivePrefs.prefs(c).edit().remove("active").apply();
        if (raw == null) return;
        try {
            JSONObject drive = new JSONObject(raw);
            if (drive.optDouble("miles", 0) < MIN_DRIVE_MILES) return;
            drive.put("miles", Math.round(drive.optDouble("miles") * 100) / 100.0);
            drive.put("endedAt", System.currentTimeMillis());
            drive.put("type", JSONObject.NULL);
            String rule = DriveRules.match(c, drive);
            if (rule != null) {
                // A business rule matched: logged without asking, Personal still one tap away.
                drive.put("ruleNote", rule);
                DriveStore.add(c, drive);
                DriveStore.classify(c, drive.getString("id"), "business");
                DriveNotify.autoBusiness(c, drive, rule);
            } else {
                DriveStore.add(c, drive);
                DriveNotify.classify(c, drive);
            }
            JSONArray points = drive.optJSONArray("points");
            if (points != null && points.length() > 0 && DrivePrefs.stopChecks(c)) {
                JSONArray end = points.getJSONArray(points.length() - 1);
                FuelStops.scheduleCheck(c, end.getDouble(0), end.getDouble(1));
            }
        } catch (Exception ignored) {
            // Corrupt leftover — nothing worth saving.
        }
    }

    @Override
    public void onDestroy() {
        if (client != null) client.removeLocationUpdates(callback);
        instance = null;
        DriveWidget.refresh(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
