# Backend handoff — trial-ending emails (needed for the phone app)

## Why

The Android/iOS app sells nothing. Google Play and the App Store forbid
selling a subscription inside an app with our own Stripe/PayPal checkout, and
outside the US they also forbid telling users *in the app* to go pay on the
website. So inside the app, a user whose trial has ended only sees a neutral
"Your plan isn't active" screen, with no price and no link.

**Email is how those users find out how to pay.** Emails are outside the
stores' control in every country. Without these emails, app-only users whose
trial ends have no way to learn where to subscribe.

## What to build

A scheduled Lambda (EventBridge, once a day) that scans users and sends:

| When | Subject (suggested) | Link |
|---|---|---|
| `trialEndDate` − 3 days | Your Meksova trial ends on {date} | `https://app.meksova.com/customer/subscription` |
| `trialEndDate` (day of) | Your Meksova trial has ended | same |
| `trialEndDate` + 3 days (optional) | Keep your Meksova books going | same |

- **Skip** users who have an active subscription, are admins (role 1), or are
  team members (`isTeamMember`; their owner pays).
- **Send each message once.** Store a marker on the user record, e.g.
  `trialEmailsSent: ["minus3","day0","plus3"]`.
- Use the existing welcome-email sender (SES / `STAGING_API_URL` welcome-email
  API) and its from-address.
- The link opens the website, where sign-in plus the existing Subscribe page
  already work. Staging should use `https://staging.meksova.com/...`.

## Data the job reads

The frontend already gets these from `GET /User` (`response.data.user`):
`trialEndDate`, the subscription status, `role`, `email`, `name`.
The same "trial still active" rule the app uses is `now < trialEndDate`
**and** `scheduleCount < 4`; please keep the email logic consistent with it.

## Not needed

- No app changes are required. The app's neutral screen is already in place.
- The app never links to payment, in any country (no store enrollment or
  fees needed). Everyone relies on these emails to resubscribe.
