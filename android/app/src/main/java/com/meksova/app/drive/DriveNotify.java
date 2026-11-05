package com.meksova.app.drive;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.meksova.app.R;
import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/** Builds and posts every drive-related notification. */
final class DriveNotify {

    static final String CH_DRIVES = "drives";
    static final String CH_RECORDING = "drive_recording";

    static final int ID_ASK = 4101;
    static final int ID_RECORDING = 4102;
    static final int ID_FORGOT = 4103;
    static final int ID_FUEL = 4104;
    static final int ID_STOP_ASK = 4122;
    static final int ID_DAY_REVIEW = 4125;

    private static final int BRAND = 0xFF2563EB;

    private DriveNotify() {}

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel drives = new NotificationChannel(
            CH_DRIVES,
            DrivePrefs.str(c, "channelDrives", "Drives and fuel stops"),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        NotificationChannel recording = new NotificationChannel(
            CH_RECORDING,
            DrivePrefs.str(c, "channelRecording", "Drive recording"),
            NotificationManager.IMPORTANCE_LOW
        );
        recording.setShowBadge(false);
        nm.createNotificationChannel(drives);
        nm.createNotificationChannel(recording);
    }

    /** Opens the app on meksova://action/{action} (handled by NativeShortcuts.js). */
    static PendingIntent openApp(Context c, String action, int requestCode) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("meksova://action/" + action));
        i.setPackage(c.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent broadcast(Context c, String action, String driveId, int requestCode) {
        Intent i = new Intent(c, DriveActionReceiver.class).setAction(action);
        if (driveId != null) i.putExtra("id", driveId);
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static NotificationCompat.Builder base(Context c, String channel) {
        ensureChannels(c);
        return new NotificationCompat.Builder(c, channel)
            .setSmallIcon(R.drawable.ic_stat_drive)
            .setColor(BRAND)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);
    }

    static void post(Context c, int id, Notification n) {
        try {
            NotificationManagerCompat.from(c).notify(id, n);
        } catch (SecurityException e) {
            // Notifications permission not granted — nothing to show.
        }
    }

    static void cancel(Context c, int id) {
        NotificationManagerCompat.from(c).cancel(id);
    }

    static String miles(double miles) {
        return String.format(Locale.getDefault(), "%.1f", miles);
    }

    /** "Driving? Start a business trip" — used when automatic recording is off. */
    static void ask(Context c) {
        Notification n = base(c, CH_DRIVES)
            .setContentTitle(DrivePrefs.str(c, "askTitle", "Driving for business?"))
            .setContentText(DrivePrefs.str(c, "askBody", "Start a trip so these miles count toward your deduction."))
            .setContentIntent(openApp(c, "trip-start", ID_ASK))
            .addAction(0, DrivePrefs.str(c, "askStart", "Start trip"), openApp(c, "trip-start", ID_ASK + 1))
            .addAction(0, DrivePrefs.str(c, "askDismiss", "Not now"), broadcast(c, DriveActionReceiver.DISMISS_ASK, null, ID_ASK + 2))
            .setTimeoutAfter(10 * 60 * 1000)
            .build();
        post(c, ID_ASK, n);
    }

    /** Ongoing notification of the recorder service. */
    static Notification recording(Context c, double milesSoFar) {
        String title = DrivePrefs.str(c, "recordingTitle", "Recording your drive");
        String body = DrivePrefs.str(c, "recordingBody", "{miles} mi so far").replace("{miles}", miles(milesSoFar));
        return base(c, CH_RECORDING)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openApp(c, "drives", ID_RECORDING))
            .addAction(0, DrivePrefs.str(c, "recordingPersonal", "Personal, don't log"), broadcast(c, DriveActionReceiver.DISCARD_RECORDING, null, ID_RECORDING + 1))
            .build();
    }

    /** "12.4 mi drive · Business or personal?" after an automatically recorded drive. */
    static void classify(Context c, JSONObject drive) {
        String id = drive.optString("id");
        int nid = classifyId(id);
        DateFormat tf = DateFormat.getTimeInstance(DateFormat.SHORT);
        String range = tf.format(new Date(drive.optLong("startedAt"))) + " – " + tf.format(new Date(drive.optLong("endedAt")));
        NotificationCompat.Builder n = base(c, CH_DRIVES)
            .setContentTitle(DrivePrefs.str(c, "classifyTitle", "{miles} mi drive").replace("{miles}", miles(drive.optDouble("miles"))))
            .setContentText(DrivePrefs.str(c, "classifyBody", "{time} · Business or personal?").replace("{time}", range))
            // Our buttons replace or cancel it themselves; auto-cancel would race the
            // replacement (Personal → "not saved · Undo", Undo → back to this).
            .setAutoCancel(false)
            .setContentIntent(openApp(c, "drives", nid));
        if (DrivePrefs.trucking(c)) {
            // Loaded and empty (deadhead) are both business miles; the label goes on the trip.
            n.addAction(0, DrivePrefs.str(c, "loaded", "Loaded"), broadcast(c, DriveActionReceiver.CLASSIFY_LOADED, id, nid + 1))
                .addAction(0, DrivePrefs.str(c, "empty", "Empty"), broadcast(c, DriveActionReceiver.CLASSIFY_EMPTY, id, nid + 3));
        } else {
            n.addAction(0, DrivePrefs.str(c, "business", "Business"), broadcast(c, DriveActionReceiver.CLASSIFY_BUSINESS, id, nid + 1));
        }
        n.addAction(0, DrivePrefs.str(c, "personal", "Personal"), broadcast(c, DriveActionReceiver.CLASSIFY_PERSONAL, id, nid + 2));
        post(c, nid, n.build());
    }

    /** Trucking: parked for a while. Either answer is fine to ignore: the piece is already saved. */
    static void stopAsk(Context c) {
        Notification n = base(c, CH_DRIVES)
            .setContentTitle(DrivePrefs.str(c, "stopAskTitle", "Did you finish your trip?"))
            .setContentText(DrivePrefs.str(c, "stopAskBody", "You've been stopped for 10 minutes."))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(DrivePrefs.str(c, "stopAskBody", "You've been stopped for 10 minutes.")))
            .setContentIntent(openApp(c, "drives", ID_STOP_ASK))
            .addAction(0, DrivePrefs.str(c, "stopAskFinished", "Finished"), broadcast(c, DriveActionReceiver.TRIP_FINISHED, null, ID_STOP_ASK + 1))
            .addAction(0, DrivePrefs.str(c, "stopAskKeep", "Keep recording"), broadcast(c, DriveActionReceiver.KEEP_RECORDING, null, ID_STOP_ASK + 2))
            .build();
        post(c, ID_STOP_ASK, n);
    }

    /** Trucking: no movement for hours, so the day's drives are ready to confirm. */
    static void dayReview(Context c, int count, double totalMiles) {
        String body = DrivePrefs.str(c, "dayReviewBody", "{count} waiting, {miles} mi. Only confirmed truck drives count for IFTA.")
            .replace("{count}", String.valueOf(count))
            .replace("{miles}", miles(totalMiles));
        Notification n = base(c, CH_DRIVES)
            .setContentTitle(DrivePrefs.str(c, "dayReviewTitle", "Review your drives"))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(openApp(c, "drives", ID_DAY_REVIEW))
            .build();
        post(c, ID_DAY_REVIEW, n);
    }

    /** Replaces the drive's notification after "Personal": nothing saved, with Undo. */
    static void personalUndo(Context c, String driveId) {
        int nid = classifyId(driveId);
        Notification n = base(c, CH_DRIVES)
            .setContentTitle(DrivePrefs.str(c, "personalTitle", "Drive not saved"))
            .setContentText(DrivePrefs.str(c, "personalBody", "Marked personal. Tap Undo if that was a mistake."))
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setAutoCancel(false)
            .setContentIntent(openApp(c, "drives", nid))
            .addAction(0, DrivePrefs.str(c, "undo", "Undo"), broadcast(c, DriveActionReceiver.UNDO_PERSONAL, driveId, nid + 2))
            .setTimeoutAfter(DriveStore.UNDO_WINDOW_MS)
            .build();
        post(c, nid, n);
    }

    /** The scan screen uses where/when the stop was (IFTA state + date), not where the user is later. */
    private static String fuelAction(String station, double lat, double lng) {
        return "fuel?lat=" + lat + "&lng=" + lng + "&at=" + System.currentTimeMillis()
            + "&station=" + Uri.encode(station == null ? "" : station);
    }

    /** kind: FuelStops.STORE or FuelStops.REPAIR (the scan screen files repairs as maintenance). */
    private static String storeAction(String store, String kind, double lat, double lng) {
        return "store?kind=" + kind + "&lat=" + lat + "&lng=" + lng + "&at=" + System.currentTimeMillis()
            + "&station=" + Uri.encode(store == null ? "" : store);
    }

    static void alreadySaved(Context c, String driveId) {
        Notification n = base(c, CH_DRIVES)
            .setContentTitle(DrivePrefs.str(c, "alreadyTitle", "This drive is already saved"))
            .setContentText(DrivePrefs.str(c, "alreadyBody", "Open Trip History to delete it."))
            .setSilent(true)
            .setContentIntent(openApp(c, "go/customer/trip-history", classifyId(driveId)))
            .build();
        post(c, classifyId(driveId), n);
    }

    static int classifyId(String driveId) {
        // Stable per drive, clear of the fixed ids above; x3 leaves room for the action codes.
        return 5000 + (Math.abs(driveId.hashCode()) % 100000) * 3;
    }

    /** A hand-started trip is still running after the car stopped. */
    static void forgotTrip(Context c) {
        Notification n = base(c, CH_DRIVES)
            .setContentTitle(DrivePrefs.str(c, "forgotTitle", "Trip still recording"))
            .setContentText(DrivePrefs.str(c, "forgotBody", "Looks like you've stopped driving. Tap to end the trip."))
            .setContentIntent(openApp(c, "trip", ID_FORGOT))
            .build();
        post(c, ID_FORGOT, n);
    }

    /** A business rule matched: "12.4 mi business drive logged · Depot" with Personal to undo. */
    static void autoBusiness(Context c, JSONObject drive, String rule) {
        String id = drive.optString("id");
        int nid = classifyId(id);
        String body = DrivePrefs.str(c, "autoBody", "{rule} · Not business? Tap Personal.").replace("{rule}", rule);
        Notification n = base(c, CH_DRIVES)
            .setContentTitle(DrivePrefs.str(c, "autoTitle", "{miles} mi business drive logged").replace("{miles}", miles(drive.optDouble("miles"))))
            .setContentText(body)
            .setAutoCancel(false)
            .setContentIntent(openApp(c, "go/customer/trip-history", nid))
            .addAction(0, DrivePrefs.str(c, "personal", "Personal"), broadcast(c, DriveActionReceiver.CLASSIFY_PERSONAL, id, nid + 2))
            .build();
        post(c, nid, n);
    }

    static void fuel(Context c, String station, double lat, double lng) {
        String title = station == null || station.isEmpty()
            ? DrivePrefs.str(c, "fuelTitleGeneric", "Fuel stop")
            : DrivePrefs.str(c, "fuelTitle", "Fuel stop at {station}").replace("{station}", station);
        String action = fuelAction(station, lat, lng);
        NotificationCompat.Builder n = base(c, CH_DRIVES)
            .setContentTitle("\u26FD " + title)
            .setContentText(DrivePrefs.str(c, "fuelBody", "Scan your receipt now so it's in your IFTA records."))
            .setContentIntent(openApp(c, action, ID_FUEL))
            .setTimeoutAfter(2 * 60 * 60 * 1000);
        post(c, ID_FUEL, receiptActions(c, n, action).build());
    }

    /** Scan (camera now) · Upload (photo picker now) · Not now. Tapping the body asks which. */
    private static NotificationCompat.Builder receiptActions(Context c, NotificationCompat.Builder n, String action) {
        return n
            .addAction(0, DrivePrefs.str(c, "fuelScan", "Scan"), openApp(c, action + "&mode=camera", ID_FUEL + 1))
            .addAction(0, DrivePrefs.str(c, "fuelUpload", "Upload"), openApp(c, action + "&mode=upload", ID_FUEL + 2))
            .addAction(0, DrivePrefs.str(c, "askDismiss", "Not now"), broadcast(c, DriveActionReceiver.DISMISS_STOP, null, ID_FUEL + 3));
    }

    /** Same slot as the fuel reminder: only the latest stop's receipt is worth a nudge. */
    static void store(Context c, String store, String kind, double lat, double lng) {
        boolean repair = FuelStops.REPAIR.equals(kind);
        String title = store == null || store.isEmpty()
            ? DrivePrefs.str(c, repair ? "repairTitleGeneric" : "storeTitleGeneric", repair ? "Repair shop stop" : "Store stop")
            : DrivePrefs.str(c, "storeTitle", "At {station}?").replace("{station}", store);
        String action = storeAction(store, kind, lat, lng);
        NotificationCompat.Builder n = base(c, CH_DRIVES)
            .setContentTitle((repair ? "\uD83D\uDD27 " : "\uD83D\uDED2 ") + title)
            .setContentText(DrivePrefs.str(c, repair ? "repairBody" : "storeBody",
                repair ? "Scan the receipt so the maintenance cost is recorded." : "Scan the receipt so the expense is recorded."))
            .setContentIntent(openApp(c, action, ID_FUEL))
            .setTimeoutAfter(2 * 60 * 60 * 1000);
        post(c, ID_FUEL, receiptActions(c, n, action).build());
    }
}
