package com.meksova.app.drive;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;
import com.meksova.app.R;

/**
 * Home-screen widget: today's and this week's business miles, and a
 * one-tap Start trip (or "Recording drive…" while the recorder runs).
 */
public class DriveWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(c));
    }

    static void refresh(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, DriveWidget.class));
        if (ids.length == 0) return;
        RemoteViews v = views(c);
        for (int id : ids) mgr.updateAppWidget(id, v);
    }

    private static RemoteViews views(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_drive);
        double today = MilesLog.today(c);
        double week = MilesLog.sum(c, MilesLog.weekStart(), 7);
        boolean recording = DriveRecorderService.isRunning() || DrivePrefs.manualTrip(c);

        v.setTextViewText(R.id.widget_today, DriveNotify.miles(today));
        v.setTextViewText(R.id.widget_today_label, DrivePrefs.str(c, "widgetToday", "business mi today"));
        v.setTextViewText(R.id.widget_week, DrivePrefs.str(c, "widgetWeek", "{miles} mi this week").replace("{miles}", DriveNotify.miles(week)));
        v.setTextViewText(R.id.widget_action, recording
            ? DrivePrefs.str(c, "widgetRecording", "Recording…")
            : DrivePrefs.str(c, "askStart", "Start trip"));
        v.setOnClickPendingIntent(R.id.widget_root, DriveNotify.openApp(c, "go/customer/trip-history", 4120));
        v.setOnClickPendingIntent(R.id.widget_action, DriveNotify.openApp(c, recording ? "trip" : "trip-start", 4121));
        if (DrivePrefs.rideshare(c)) {
            boolean shift = DriveShift.on(c);
            v.setTextViewText(R.id.widget_action, DrivePrefs.str(c, shift ? "shiftEnd" : "shiftStart", shift ? "End shift" : "Start shift"));
            v.setOnClickPendingIntent(R.id.widget_action,
                DriveNotify.broadcast(c, shift ? DriveActionReceiver.SHIFT_END : DriveActionReceiver.SHIFT_START, null, 4134));
        }
        return v;
    }
}
