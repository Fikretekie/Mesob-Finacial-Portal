package com.meksova.app.drive;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import com.meksova.app.R;
import java.text.NumberFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Monday 9:00: "Last week: 142.0 business mi · ≈ $103 deduction · 2 drives to review". */
public class WeeklySummary extends BroadcastReceiver {

    static final int ID = 4105;

    static boolean enabled(Context c) {
        return DrivePrefs.enabled(c) && DrivePrefs.prefs(c).getBoolean("weeklySummary", true);
    }

    private static PendingIntent alarmIntent(Context c) {
        return PendingIntent.getBroadcast(c, ID, new Intent(c, WeeklySummary.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Next Monday 9:00 (or cancels when the summary is off). */
    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (!enabled(c)) {
            am.cancel(alarmIntent(c));
            return;
        }
        Calendar next = MilesLog.weekStart();
        next.set(Calendar.HOUR_OF_DAY, 9);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_MONTH, 7);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), alarmIntent(c));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (!enabled(c)) return;
        post(c);
        schedule(c);
    }

    static void post(Context c) {
        Calendar lastWeek = MilesLog.weekStart();
        lastWeek.add(Calendar.DAY_OF_MONTH, -7);
        double miles = MilesLog.sum(c, lastWeek, 7);
        int waiting = 0;
        JSONArray drives = DriveStore.all(c);
        for (int i = 0; i < drives.length(); i++) {
            JSONObject d = drives.optJSONObject(i);
            if (d != null && d.isNull("type")) waiting++;
        }
        if (miles < 0.05 && waiting == 0) return;

        double rate = DrivePrefs.prefs(c).getFloat("ratePerMile", 0f);
        NumberFormat money = NumberFormat.getCurrencyInstance(Locale.US);
        money.setMaximumFractionDigits(0);
        StringBuilder body = new StringBuilder();
        if (rate > 0 && miles >= 0.05) {
            body.append(DrivePrefs.str(c, "weeklyDeduction", "≈ {amount} deduction").replace("{amount}", money.format(miles * rate)));
        }
        if (waiting > 0) {
            if (body.length() > 0) body.append(" · ");
            body.append(DrivePrefs.str(c, "weeklyWaiting", "{count} drives to review").replace("{count}", String.valueOf(waiting)));
        }
        Notification n = new NotificationCompat.Builder(c, DriveNotify.CH_DRIVES)
            .setSmallIcon(R.drawable.ic_stat_drive)
            .setColor(0xFF2563EB)
            .setAutoCancel(true)
            .setContentTitle(DrivePrefs.str(c, "weeklyTitle", "Last week: {miles} business mi").replace("{miles}", DriveNotify.miles(miles)))
            .setContentText(body.toString())
            .setContentIntent(DriveNotify.openApp(c, waiting > 0 ? "drives" : "go/customer/trip-history", ID))
            .build();
        DriveNotify.ensureChannels(c);
        DriveNotify.post(c, ID, n);
    }
}
