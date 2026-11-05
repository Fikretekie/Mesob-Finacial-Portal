package com.meksova.app.drive;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.location.Address;
import android.location.Geocoder;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bridge for src/utils/driveMonitor.js. */
@CapacitorPlugin(
    name = "DriveMonitor",
    permissions = {
        @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "backgroundLocation", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }),
    }
)
public class DriveMonitorPlugin extends Plugin {

    /** { enabled, autoRecord, fuelStops, storeStops, workdaysOnly, strings } */
    @PluginMethod
    public void configure(PluginCall call) {
        Context c = getContext();
        JSObject strings = call.getObject("strings", new JSObject());
        DrivePrefs.prefs(c).edit()
            .putBoolean("enabled", call.getBoolean("enabled", false))
            .putBoolean("autoRecord", call.getBoolean("autoRecord", true))
            .putBoolean("fuelStops", call.getBoolean("fuelStops", true))
            .putBoolean("storeStops", call.getBoolean("storeStops", true))
            .putBoolean("trucking", call.getBoolean("trucking", false))
            .putBoolean("workdaysOnly", call.getBoolean("workdaysOnly", false))
            .putBoolean("weeklySummary", call.getBoolean("weeklySummary", true))
            .putFloat("ratePerMile", call.getFloat("ratePerMile", 0f))
            .putString("rules", call.getObject("rules", new JSObject()).toString())
            .putString("vehicles", call.getObject("vehicles", new JSObject()).toString())
            .putString("strings", strings.toString())
            .apply();
        DriveNotify.ensureChannels(c);
        if (DrivePrefs.enabled(c)) {
            DriveEvents.register(c);
        } else {
            DriveEvents.unregister(c);
            DriveRecorderService.discardCurrent(c);
        }
        WeeklySummary.schedule(c);
        DriveWidget.refresh(c);
        call.resolve(status());
    }

    /** Business miles per day from the server ({ "2026-10-30": 12.4 }), for the widget and weekly summary. */
    @PluginMethod
    public void setMilesLog(PluginCall call) {
        MilesLog.set(getContext(), call.getObject("log", new JSObject()));
        call.resolve();
    }

    /** A business trip was just saved from the app. */
    @PluginMethod
    public void logMiles(PluginCall call) {
        String dateKey = call.getString("dateKey");
        Double miles = call.getDouble("miles");
        if (dateKey != null && miles != null) MilesLog.add(getContext(), dateKey, miles);
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    private JSObject status() {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("enabled", DrivePrefs.enabled(c));
        r.put("recording", DriveRecorderService.isRunning());
        r.put("activity", DrivePrefs.hasActivity(c));
        r.put("notifications", NotificationManagerCompat.from(c).areNotificationsEnabled());
        r.put("location", DrivePrefs.has(c, Manifest.permission.ACCESS_FINE_LOCATION));
        r.put("backgroundLocation", DrivePrefs.hasBackgroundLocation(c));
        r.put("bluetooth", hasBluetooth(c));
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        // What actually happened on this phone, for the settings screen.
        SharedPreferences p = DrivePrefs.prefs(c);
        r.put("lastDriveAt", p.getLong("lastEnterAt", 0));
        r.put("lastCheckAt", p.getLong("lastCheckAt", 0));
        r.put("lastCheckResult", p.getString("lastCheckResult", ""));
        r.put("lastCheckName", p.getString("lastCheckName", ""));
        try {
            r.put("manualExits", new JSONArray(p.getString("manualExits", "[]")));
        } catch (Exception ignored) {
            // Corrupt: treated as none.
        }
        return r;
    }

    private static boolean hasBluetooth(Context c) {
        return Build.VERSION.SDK_INT < 31 || DrivePrefs.has(c, Manifest.permission.BLUETOOTH_CONNECT);
    }

    /** "Nearby devices", needed to see the phone's paired devices and when they connect. */
    @PluginMethod
    public void requestBluetooth(PluginCall call) {
        if (Build.VERSION.SDK_INT < 31) {
            call.resolve(status());
            return;
        }
        requestPermissionForAlias("bluetooth", call, "permissionsDone");
    }

    /** What the driver can link as their truck or car. */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        JSArray devices = new JSArray();
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter != null && hasBluetooth(getContext())) {
            for (BluetoothDevice d : adapter.getBondedDevices()) {
                JSObject o = new JSObject();
                o.put("address", d.getAddress());
                o.put("name", d.getName() == null ? d.getAddress() : d.getName());
                devices.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("devices", devices);
        call.resolve(r);
    }

    /** "Columbus, OH" for a point on a drive; blank when the phone can't tell. */
    @PluginMethod
    public void getPlaceName(PluginCall call) {
        double lat = call.getDouble("lat", 0.0);
        double lng = call.getDouble("lng", 0.0);
        new Thread(() -> {
            String name = "";
            try {
                List<Address> found = new Geocoder(getContext(), Locale.getDefault()).getFromLocation(lat, lng, 1);
                if (found != null && !found.isEmpty()) {
                    Address a = found.get(0);
                    String town = a.getLocality() != null ? a.getLocality() : a.getSubAdminArea();
                    String area = a.getAdminArea();
                    name = town != null && area != null ? town + ", " + area : town != null ? town : area != null ? area : "";
                }
            } catch (Exception ignored) {
                // No network or no geocoder on this phone: the time alone identifies it.
            }
            JSObject r = new JSObject();
            r.put("name", name);
            call.resolve(r);
        }).start();
    }

    /** This app's Android settings page, where Battery can be set to Unrestricted. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context c = getContext();
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
        getActivity().startActivity(i);
        call.resolve();
    }

    /** Activity, notifications and location — the dialogs Android shows in-app. */
    @PluginMethod
    public void requestDrivePermissions(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 29) aliases.add("activity");
        if (Build.VERSION.SDK_INT >= 33) aliases.add("notifications");
        aliases.add("location");
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permissionsDone");
    }

    /**
     * "Allow all the time". Android 11+ sends the user to the app's location
     * settings for this; it must be asked after foreground location.
     */
    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) {
            call.resolve(status());
            return;
        }
        requestPermissionForAlias("backgroundLocation", call, "permissionsDone");
    }

    @PermissionCallback
    private void permissionsDone(PluginCall call) {
        if (DrivePrefs.enabled(getContext())) DriveEvents.register(getContext());
        call.resolve(status());
    }

    /** Recorded drives not yet saved by the app. */
    @PluginMethod
    public void getDrives(PluginCall call) {
        JSONArray drives = DriveStore.all(getContext());
        JSArray out = new JSArray();
        for (int i = 0; i < drives.length(); i++) {
            JSONObject d = drives.optJSONObject(i);
            if (d != null) out.put(d);
        }
        JSObject r = new JSObject();
        r.put("drives", out);
        call.resolve(r);
    }

    @PluginMethod
    public void classifyDrive(PluginCall call) {
        String id = call.getString("id");
        String type = call.getString("type");
        if (id == null || !("business".equals(type) || "personal".equals(type))) {
            call.reject("id and type (business|personal) required");
            return;
        }
        String load = call.getString("load");
        if (!"loaded".equals(load) && !"empty".equals(load)) load = null;
        DriveStore.classify(getContext(), id, type, "business".equals(type) ? load : null);
        DriveNotify.cancel(getContext(), DriveNotify.classifyId(id));
        call.resolve();
    }

    /** Undo "personal": the drive goes back up for review. */
    @PluginMethod
    public void restoreDrive(PluginCall call) {
        String id = call.getString("id");
        if (id != null) DriveStore.classify(getContext(), id, null);
        call.resolve();
    }

    @PluginMethod
    public void removeDrive(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            DriveStore.remove(getContext(), id);
            DriveNotify.cancel(getContext(), DriveNotify.classifyId(id));
        }
        call.resolve();
    }

    /** The Mileage Tracker started/stopped a hand-run trip: don't double-record it. */
    @PluginMethod
    public void setManualTrip(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        DrivePrefs.prefs(getContext()).edit().putBoolean("manualTrip", active).apply();
        if (active) DrivePrefs.prefs(getContext()).edit().remove("manualExits").apply();
        if (active) {
            DriveRecorderService.discardCurrent(getContext());
            DriveNotify.cancel(getContext(), DriveNotify.ID_ASK);
        }
        DriveNotify.cancel(getContext(), DriveNotify.ID_FORGOT);
        DriveWidget.refresh(getContext());
        call.resolve();
    }

    /**
     * Debug builds only: fake "started / stopped driving" (the emulator has no
     * motion sensors), or a fuel-station lookup at a given point.
     */
    @PluginMethod
    public void simulate(PluginCall call) {
        Context c = getContext();
        if ((c.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            call.reject("debug builds only");
            return;
        }
        String event = call.getString("event", "");
        if ("start".equals(event)) {
            DriveEvents.onDriveStart(c);
        } else if ("end".equals(event)) {
            DriveEvents.onDriveEnd(c, null);
        } else if ("fuel".equals(event)) {
            FuelStops.checkAsync(c, call.getDouble("lat", 0.0), call.getDouble("lng", 0.0), null);
        } else if ("pinWidget".equals(event) && Build.VERSION.SDK_INT >= 26) {
            android.appwidget.AppWidgetManager.getInstance(c)
                .requestPinAppWidget(new android.content.ComponentName(c, DriveWidget.class), null, null);
        } else if ("weekly".equals(event)) {
            WeeklySummary.post(c);
        } else if ("fuelNotify".equals(event)) {
            DriveNotify.fuel(c, call.getString("station", ""), call.getDouble("lat", 0.0), call.getDouble("lng", 0.0));
        } else if ("storeNotify".equals(event)) {
            DriveNotify.store(c, call.getString("station", ""), call.getString("kind", FuelStops.STORE), call.getDouble("lat", 0.0), call.getDouble("lng", 0.0));
        } else if ("fuelDelayed".equals(event)) {
            FuelStops.scheduleCheck(c, call.getDouble("lat", 0.0), call.getDouble("lng", 0.0));
        } else if ("piece".equals(event)) {
            // A finished drive, as if the recorder had just saved it.
            try {
                double lat = call.getDouble("lat", 39.95);
                double lng = call.getDouble("lng", -82.8);
                JSONObject a = new JSONObject();
                a.put("id", UUID.randomUUID().toString());
                a.put("startedAt", System.currentTimeMillis() - call.getDouble("minutes", 30.0).longValue() * 60000);
                a.put("miles", call.getDouble("miles", 10.0));
                a.put("points", new JSONArray("[[" + lat + "," + lng + "],[" + (lat + 0.1) + "," + lng + "]]"));
                DrivePrefs.prefs(c).edit().putString("active", a.toString()).apply();
                DriveRecorderService.finishCurrent(c);
            } catch (Exception e) {
                call.reject(e.getMessage());
                return;
            }
        } else if ("markFuel".equals(event)) {
            DriveStore.markFuelStop(c, call.getDouble("lat", 0.0), call.getDouble("lng", 0.0));
        } else if ("dayAsk".equals(event)) {
            DriveDay.fire(c, DriveDay.ASK);
        } else if ("dayReview".equals(event)) {
            DriveDay.fire(c, DriveDay.REVIEW);
        } else if ("walking".equals(event)) {
            DriveEvents.onWalking(c);
        } else if ("btOn".equals(event) || "btOff".equals(event)) {
            DriveVehicle.connectionChanged(c, call.getString("address", ""), "btOn".equals(event));
        }
        call.resolve(status());
    }
}
