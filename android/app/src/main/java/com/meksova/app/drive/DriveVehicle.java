package com.meksova.app.drive;

import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Which vehicle a piece of driving was in, from the Bluetooth devices the driver
 * linked as their truck and their car. Only connection times are kept, on the
 * phone. No match or both matching means we don't know, so the driver gets asked.
 */
public class DriveVehicle extends BroadcastReceiver {

    static final String TRUCK = "truck";
    static final String CAR = "car";

    private static boolean linked(Context c, String kind, String address) {
        JSONArray list = devices(c, kind);
        for (int i = 0; i < list.length(); i++) {
            JSONObject d = list.optJSONObject(i);
            if (d != null && address.equalsIgnoreCase(d.optString("address"))) return true;
        }
        return false;
    }

    private static JSONArray devices(Context c, String kind) {
        try {
            JSONArray list = new JSONObject(DrivePrefs.prefs(c).getString("vehicles", "{}")).optJSONArray(kind);
            return list == null ? new JSONArray() : list;
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** "truck", "car", or null when it can't be told. */
    static String during(Context c, long start, long end) {
        boolean truck = anyConnected(c, TRUCK, start, end);
        boolean car = anyConnected(c, CAR, start, end);
        if (truck == car) return null;
        return truck ? TRUCK : CAR;
    }

    private static boolean anyConnected(Context c, String kind, long start, long end) {
        SharedPreferences p = DrivePrefs.prefs(c);
        JSONArray list = devices(c, kind);
        for (int i = 0; i < list.length(); i++) {
            JSONObject d = list.optJSONObject(i);
            if (d == null) continue;
            String address = d.optString("address");
            long on = p.getLong("btOn_" + address, 0);
            long off = p.getLong("btOff_" + address, 0);
            if (on > 0 && on <= end && (off < on || off >= start)) return true;
        }
        return false;
    }

    static void connectionChanged(Context c, String address, boolean connected) {
        boolean truck = linked(c, TRUCK, address);
        boolean car = linked(c, CAR, address);
        if (!truck && !car) return;
        DrivePrefs.prefs(c).edit().putLong((connected ? "btOn_" : "btOff_") + address, System.currentTimeMillis()).apply();
        // Truck switched off, or the car came on: whatever comes next is a new piece.
        if (connected ? car : truck) DriveRecorderService.splitIfStopped(c);
    }

    /** After a reboot, connections recorded before it may never have reported ending. */
    static void clearConnections(Context c) {
        SharedPreferences p = DrivePrefs.prefs(c);
        SharedPreferences.Editor e = p.edit();
        for (String key : p.getAll().keySet()) {
            if (key.startsWith("btOn_") || key.startsWith("btOff_")) e.remove(key);
        }
        e.apply();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        boolean connected = BluetoothDevice.ACTION_ACL_CONNECTED.equals(action);
        if (!connected && !BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) return;
        if (!DrivePrefs.enabled(context) || !DrivePrefs.trucking(context)) return;
        BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
        if (device != null) connectionChanged(context, device.getAddress(), connected);
    }
}
