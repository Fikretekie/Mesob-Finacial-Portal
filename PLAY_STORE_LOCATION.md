# Google Play: background location + Data safety (Meksova Android)

Copy-paste answers for Play Console. Check each against the app before
submitting — they describe the build of 2026-10-30.

Privacy policy URL: https://meksova.com/privacy-policy (section 3 covers the
app's location, motion and device data — deploy the website first).

## 1. Permissions declaration → Location (background)

**Which feature needs background location?**
Automatic mileage logging. Meksova detects when the user starts driving,
records the drive (miles, and miles per US state for IFTA fuel-tax reporting)
and notices stops at gas stations, supply stores and repair shops to remind
the user to scan the receipt. Drives start without the user opening the app, so location must be
available while the app is in the background.

**Why can't it work with foreground-only location?**
A drive starts when the user gets in the car, not when they open the app.
With foreground-only location the drive would be missed or cut short as soon
as the phone is locked or another app (navigation) is in front. Users who do
not grant "Allow all the time" can still log trips by starting them by hand;
the app then only asks "Start a trip?" when it notices driving.

**Is it core to the app?** Yes — mileage logging for business tax deductions
and IFTA reporting is one of the app's main features for rideshare drivers,
delivery drivers and truckers.

**Prominent disclosure (in-app, before the permission prompt):**
Account → Drives & reminders → "Detect my drives" opens a sheet titled
"Log business miles automatically":
> Meksova collects location data to detect your drives, record business
> miles and notice fuel stops for IFTA, even when the app is closed or not
> in use.
with Continue / Not now. The system permission prompts follow only after
Continue.

**Video (≤ 30 s, unlisted YouTube link):** see section 3 below.

## 2. Data safety form

Answers reflect what leaves the device. Data processed only on the phone
(route points, motion data, business places) is not "collected" per Play's
definitions.

| Data type | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Location → Precise | Yes (miles per state saved with business trips; stop coordinates (gas station / store / repair shop check) sent to Google Places / OpenStreetMap as service providers) | No | App functionality | Yes (feature is opt-in) |
| Location → Approximate | Yes (country from IP via ipapi.co) | No | App functionality | No |
| Personal info → Name, Email, Phone | Yes | No | Account management | No (name/email) |
| Financial info → Purchase history / Other financial info | Yes (transactions, receipts, reports) | No | App functionality | No |
| Photos | Yes (receipt photos the user chooses to save) | No | App functionality | Yes |
| Files and docs | Yes (documents the user uploads) | No | App functionality | Yes |

- Data encrypted in transit: **Yes** (HTTPS only).
- Users can request deletion: **Yes** — in the app, Account → Data
  Management → Delete Account. Play also asks for a **web link** where
  people can request deletion without the app: point it at the website's
  account page or a support-email page that explains the steps.
- Physical activity / motion: **not collected** (used on device only).

Notes:
- "Service providers" processing data on our behalf (Google Places, AWS) is
  not "sharing" in Play's definitions.
- If push notifications (Firebase) ship later, add **Device or other IDs**
  (FCM token) → collected, App functionality.

## 3. Demo video shot list (record on a phone or the emulator, ≤ 30 s)

1. Account → Drives & reminders → tap **Detect my drives**.
2. The disclosure sheet appears → tap **Continue**.
3. System prompts: location "While using the app" → physical activity
   **Allow** → settings page **Allow all the time** → back.
4. Start driving → the **Recording your drive** notification appears.
5. Park → **"0.8 mi drive · Business or personal?"** → tap Business.
6. Optional: a fuel stop → **Fuel stop at Shell · Scan receipt**.

Upload as an unlisted YouTube video and paste the link in the declaration.
