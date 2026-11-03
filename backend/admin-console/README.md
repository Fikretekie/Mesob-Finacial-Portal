# Owner console backend (`mesob-admin-<env>`)

The owner/staff console at `/admin/console` talks to one Lambda per environment
(`mesob-admin-staging`, `mesob-admin-production`) behind these API Gateway
routes on `iaqwrjhk4f/MesobFinancialSystem`:

| Route | Auth | Purpose |
|---|---|---|
| `GET /SiteConfig` | none | Banner, maintenance, feature switches, policies — read by the app and website |
| `PUT /SiteConfig` | Cognito | Publish site settings (owner, or staff with `site.manage`/`policies.publish`) |
| `ANY /AdminData/{proxy+}` | Cognito | `users`, `subscriptions`, `transactions`, crash reports (`errors`) and every console collection |
| `ANY /AdminStaff[/{id}]` | Cognito | Owner only — staff logins (Cognito) and permissions |
| `GET/POST /AdminMessages` | Cognito | Broadcasts (stored; emailed through SES when `SES_FROM` is set) |
| `GET/POST /AdminAudit` | Cognito | Activity log |

Permissions are enforced **in the Lambda** from the caller's Users record:
role `0` = owner (everything), role `3` = staff limited to `staffPermissions`.
The main `MesobFinance` Lambda is not modified.

The route definitions are shared by both API stages; the stage variable
`adminEnv` (`staging` / `production`) picks which Lambda answers. Each
environment has its own data table `MesobAdminData_<env>` (point-in-time
recovery on), its own Cognito pool and its own app tables (read from the
`MesobFinance:<env>` alias's settings).

## Deploy / update

1. `index.mjs` is the source. After editing it, rebuild the CloudShell script:
   `python -c "t=open('setup.template.sh').read(); c=open('index.mjs').read().rstrip(); open('setup.sh','w',newline='\n').write(t.replace('__LAMBDA_CODE__', c))"`
2. In AWS CloudShell (us-east-1): Actions → Upload file → `setup.sh`, then
   - `bash setup.sh staging your-login@email.com`
   - check the console on staging.meksova.com
   - `bash setup.sh production your-login@email.com` (refuses until staging exists, and asks you to type `production`)
3. Paste the output back. The smoke test should read 200 / 401 / 204.

Safe to re-run; each run creates what's missing and updates the rest.

## Not built yet (phase 2)

- Stripe/PayPal billing actions and invoice list (`AdminData/invoices`, `billing`)
- Revenue / usage / system-health metrics (`AdminData/revenue|usage|health`)
- Recycle bin: needs `MesobFinance` to soft-delete (flag) instead of erasing
- Push notifications (Firebase), SES sender verification for email
- Rules/automations/alerts *running* on a schedule (they're stored, not executed yet)
- Site editor content read by meksova.com (separate repo)
