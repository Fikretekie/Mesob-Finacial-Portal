import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

// Deadline reminders the phone schedules itself — no server needed. Each fires
// 7 days before the due date at 9:00. Rescheduled whenever settings or the
// language change, so the text always matches the app's language.
const FIRST_ID = 7100;
const LAST_ID = 7199;
const DAYS_BEFORE = 7;

// Month is 0-based. Quarterly federal estimated tax (Form 1040-ES).
const ESTIMATED_TAX = [
  [0, 15],
  [3, 15],
  [5, 15],
  [8, 15],
];
// IFTA quarterly returns.
const IFTA = [
  [0, 31],
  [3, 30],
  [6, 31],
  [9, 31],
];

function upcoming(deadlines, count) {
  const now = new Date();
  const out = [];
  for (let year = now.getFullYear(); out.length < count && year <= now.getFullYear() + 2; year++) {
    for (const [month, day] of deadlines) {
      const due = new Date(year, month, day, 9, 0, 0);
      const remindAt = new Date(due);
      remindAt.setDate(remindAt.getDate() - DAYS_BEFORE);
      if (remindAt > now && out.length < count) out.push({ due, remindAt });
    }
  }
  return out;
}

export async function scheduleTaxReminders(t, { enabled, trucking }) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { notifications } = await LocalNotifications.getPending();
    const ours = notifications.filter((n) => n.id >= FIRST_ID && n.id <= LAST_ID);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    if (!enabled) return;
    // Never pop the permission dialog from here (this runs at app start);
    // the Account switch asks for it with context.
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") return;

    const fmt = (d) => d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
    const list = [];
    let id = FIRST_ID;
    upcoming(ESTIMATED_TAX, 4).forEach(({ due, remindAt }) => {
      list.push({
        id: id++,
        title: t("drives.reminders.estTaxTitle"),
        body: t("drives.reminders.estTaxBody", { date: fmt(due) }),
        schedule: { at: remindAt, allowWhileIdle: true },
        isExactNotification: false,
        smallIcon: "ic_stat_reminder",
        extra: { route: "/customer/dashboard" },
      });
    });
    if (trucking) {
      upcoming(IFTA, 4).forEach(({ due, remindAt }) => {
        list.push({
          id: id++,
          title: t("drives.reminders.iftaTitle"),
          body: t("drives.reminders.iftaBody", { date: fmt(due) }),
          schedule: { at: remindAt, allowWhileIdle: true },
          isExactNotification: false,
          smallIcon: "ic_stat_reminder",
          extra: { route: "/customer/ifta-report" },
        });
      });
    }
    await LocalNotifications.schedule({ notifications: list });
  } catch (e) {
    // Notifications not permitted — reminders simply don't appear.
  }
}
