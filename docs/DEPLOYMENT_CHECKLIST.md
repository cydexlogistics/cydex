# Deployment Checklist

Everything to set up before Cydex takes real orders and real money: accounts, environment variables, Supabase settings, Squad, emails, hosting and the launch test. Up to date as of 19 October 2026.

Work top to bottom and tick each item (`[x]`) as it's done. Steps marked **(new project only)** are only needed if production gets its own Supabase project. The current (test) project already has them. The production project's ref is in `.env.production` (gitignored) and in its Supabase dashboard address; below it's written as `<prod-ref>`.

Feature work that isn't a launch blocker stays in [APP_TODO.md](APP_TODO.md).

> **Run the Supabase CLI as** `npx -y supabase@2.118.0 …`. The unpinned `npx supabase` fails on this Mac. The commands below write `supabase` for short.
>
> **Typing secrets:** paste the value directly, e.g. `KEY=abc123`. Don't wrap it in `< >`, because zsh reads that as a file.

---

## 1. Accounts to create

| Service | What it's for | Plan | Notes |
|---|---|---|---|
| [ ] **Domain registrar** (e.g. Namecheap, Whogohost) | The app's web address, and the email sending domain | Yearly | You'll add DNS records for Vercel and Brevo |
| [ ] **Supabase** | Database, logins, file storage, Edge Functions | **Pro** (about $25/month) | Free projects pause after a week of no activity and have no backups |
| [ ] **Vercel** | Hosts the web app | Hobby is fine to start; Pro for a team | Connect it to the GitHub repo |
| [ ] **GitHub** | The code | Free | Already set up: `cybersmithstudios/cydex` and `Tibesti/cydex` |
| [ ] **Squad** (GTBank) | Card payments, virtual accounts, payouts to banks | Live account | Needs **KYC** (business documents) before live keys and payouts work |
| [ ] **Brevo** | Sends the app's emails (API) and the login emails (SMTP) | Free plan to start; check its daily sending limit on Brevo's pricing page | Needs the domain verified |
| [ ] **Google Cloud** | Maps, address search and the distance for delivery fees | Pay as you go, with a free monthly credit | Must be **Cydex's own** account. The current key belongs to Faramove |

Keep the logins for all of these in a password manager the team can access.

---

## 2. Code clean-up (before the production build)

- [x] **Squad secret keys out of the browser.** Done (October 2026): virtual accounts are created by the `squad-virtual-account` Edge Function, and the browser code that held Squad and Paystack keys has been deleted. Squad now runs only in Edge Functions.
- [ ] **Remove the old Squad and app variables from Vercel:** `VITE_SQUAD_SECRET_KEY`, `VITE_SQUAD_PROD_SECRET_KEY`, `VITE_SQUAD_PUBLIC_KEY`, `VITE_SQUAD_PROD_PUBLIC_KEY`, `VITE_SQUAD_MERCHANT_ID`, `VITE_SQUAD_API_URL`, `VITE_SQUAD_VIRTUAL_ACCOUNT_PREFIX`, `VITE_SQUAD_WEBHOOK_SECRET`, `VITE_PAYSTACK_WEBHOOK_SECRET`, `VITE_APP_URL` and `VITE_NODE_ENV`. The app no longer reads any of them.
- [ ] **Rotate both Squad secret keys** (sandbox and live) in the Squad dashboard, then put the new ones in the Supabase function secrets (`SQUAD_SECRET_KEY`, section 3.4). The old keys were in the website's code and are in the git history, so treat them as public.
- [ ] **Roll the old Paystack test keys** in the Paystack dashboard, if that account still exists. They're in the git history too.
- [ ] **Use Cydex's own Google Maps key** (section 6).

---

## 3. Supabase

### 3.1 Project

- [ ] **Decide which project is production.**
  - **Recommended:** create a fresh project for production and keep the current project for testing.
  - **Or keep the current one:** delete the test orders, wallets, transactions, payout requests and notifications, and remove test accounts under Authentication → Users.
- [ ] **(new project only)** Create it in the region closest to Nigeria (e.g. `eu-west`, London). Save the database password in the password manager.
- [ ] **Upgrade to Pro**, and turn on daily backups. Add point-in-time recovery if the budget allows.

### 3.2 Database and functions

- [ ] **(new project only)** Before the first push, turn on `pg_net` and `pg_cron` in **Database → Extensions**. The migrations try to turn them on themselves; doing it first makes sure the scheduled jobs get created.
- [ ] **(new project only)** Link the project and push everything:
  ```
  npx -y supabase@2.118.0 link --project-ref <prod-ref>
  npx -y supabase@2.118.0 db push --linked
  npx -y supabase@2.118.0 functions deploy squad-checkout squad-webhook squad-payout squad-virtual-account send-emails send-push admin-team
  ```
  `link` switches which project every later `db push` and `functions deploy` goes to. To go back to the test project afterwards, link it again with its own project ref. Run `npx -y supabase@2.118.0 projects list` to see which one is linked (marked with a ●).
  The push runs every file in `supabase/migrations/` in order, which builds the whole database from nothing: tables, security rules, functions, triggers, storage buckets, realtime and scheduled jobs. It also adds the starting data: pricing, vehicle types, business and product categories, and settings. **No accounts, orders or other data come across** from the old project.
  `supabase/config.toml` needs no change: its `project_id` only names the local setup. It already turns off the login check for `squad-webhook`, `send-emails` and `send-push`, which are called by Squad and the database, not by a signed-in user.
- [ ] **(new project only)** Point push notifications and the withdrawal status check at the new project (one early migration sets this to the test project's address, and the database can't read the app's environment). Run in the SQL editor:
  ```sql
  update public.app_config set value = 'https://<prod-ref>.supabase.co/functions/v1' where key = 'functions_url';
  ```
- [ ] **Check what the migrations set up:**
  - **Database → Extensions:** `pg_net` and `pg_cron` are on. If one wasn't, pushing again won't help (migrations only run once); turn it on and ask a developer to re-create the missing scheduled jobs from the migrations.
  - **Storage:** buckets `store-images` (public) and `verification-docs` (private), both with a 5 MB limit.
  - **Database → Publications → `supabase_realtime`:** includes `notifications` (unread badges and toasts), `orders` and `deliveries` (live order updates).
  - **Integrations → Cron:** these are created by the migrations. The email job is added in section 4.
    - `mark-stale-riders-offline`, every minute: also sets idle riders offline.
    - `payout-status-sweep`, every 10 minutes: marks approved withdrawals as paid once Squad confirms them.
    - `widen-preferred-orders`, every minute: offers an order to every nearby rider when its preferred delivery mode has had no taker for 10 minutes.
    - `release-unpaid-wallet-orders`, every 5 minutes: returns the wallet part of an order whose card payment wasn't finished within 30 minutes.
    - `send-due-broadcasts`, every minute: sends admin broadcasts whose time has come.

### 3.3 Authentication settings

Supabase dashboard → **Authentication**.

- [ ] **URL Configuration:**
  - **Site URL:** `https://<domain>`
  - **Redirect URLs:**
    - `https://<domain>/auth?confirmed=1`: sign-up confirmation (the link lands on the login page, which asks them to log in)
    - `https://<domain>/auth/set-password`: password reset **and admin invites**
    - While testing, also `http://localhost:8080/auth?confirmed=1` and `http://localhost:8080/auth/set-password`
- [ ] **Sign In / Providers → Email:** **Confirm email** on.
- [ ] **Emails → SMTP Settings:** add Brevo's SMTP details (Brevo → SMTP & API → SMTP). Supabase's built-in email only sends a few messages per hour, which isn't enough for real users.
  - Host `smtp-relay.brevo.com`, port `587`
  - Username: your Brevo SMTP login (shown on that page, not your account email)
  - Password: a Brevo **SMTP key** (generate one there; it's different from the API key)
  - Sender: `Cydex <hello@your-domain>`
- [ ] **Emails → Templates:** brand these with Cydex's name and colours:
  - **Confirm signup**
  - **Reset password:** the link opens the Set password page, then they log in with the new password
  - **Invite user:** sent when an admin invites another admin. Suggested subject: "You've been invited to the Cydex admin team"
- [ ] **Attack Protection:** turn on **leaked password protection**.
- [ ] **Advisors:** run the **Security Advisor** and **Performance Advisor**, and fix anything marked error or warning.

### 3.4 Function secrets

Supabase dashboard → **Edge Functions → Secrets**, or `supabase secrets set NAME=value …`. These are private and are never sent to the browser. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

| Secret | Value | Used by |
|---|---|---|
| [ ] `SQUAD_SECRET_KEY` | Squad **live** secret key | checkout, webhook, payouts, virtual accounts |
| [ ] `SQUAD_API_URL` | `https://api-d.squadco.com` (live). The sandbox is `https://sandbox-api-d.squadco.com` | checkout, payouts, virtual accounts |
| [ ] `SQUAD_VIRTUAL_ACCOUNT_PREFIX` | Optional. `CYDEX` unless Squad assigns another | virtual accounts |
| [ ] `SQUAD_MERCHANT_ID` | Live merchant ID from the Squad dashboard | payout references |
| [ ] `APP_URL` | `https://<domain>` | Squad's return page after paying, admin invite links |
| [ ] `BREVO_API_KEY` | From Brevo → SMTP & API → API Keys | `send-emails` |
| [ ] `EMAIL_FROM` | `Cydex <hello@your-domain>` | `send-emails` |
| [ ] `EMAIL_CRON_SECRET` | A long random string (e.g. `openssl rand -hex 32`) | `send-emails` (section 4) |
| [ ] `VAPID_PUBLIC_KEY` | From `npx web-push generate-vapid-keys` | `send-push` |
| [ ] `VAPID_PRIVATE_KEY` | Same command (keep it secret) | `send-push` |
| [ ] `VAPID_SUBJECT` | `mailto:hello@your-domain` | `send-push` |
| [ ] `GOOGLE_ROUTES_API_KEY` | A **server** key with only the Routes API enabled (section 6) | `route-distances` (optional: without it, delivery fees use straight-line distance) |

Generate **new** VAPID keys for production. Phones that allowed notifications on the test project have to allow them again.

### 3.5 First admin and prices

- [ ] **Create the first admin account:** sign up normally, then set `profiles.role` to `admin` in the Table Editor. Invite everyone else from **Admin → Users → Invite admin** ([ADMIN.md → Users](ADMIN.md#users)).
- [ ] **Check the prices** on **Admin → Pricing** (they can be changed there at any time):
  - Delivery charge ₦500 (added to every delivery)
  - Service Charge 15%, vendor commission 10%, rider-request commission 10%
  - Rider share of the delivery fee 85%
- [ ] **Check the vehicle types** on **Admin → Riders & vehicles:** the price per km for each (₦200 to start with), the longest trip for each (5 km to start with), which details riders must give, and the idle time (30 minutes).
- [ ] **Business categories:** check the list in **Admin → Verifications → Business categories**. Restaurant and Shop are there by default, each with its product categories.
- [ ] **Review the verification queue** (Admin → Verifications) before launch, so the first vendors and riders aren't left waiting.

---

## 4. Emails (Brevo)

The database queues emails in `email_outbox` (welcome, payment confirmed, refund, verification, suspension). The `send-emails` function sends them every minute.

- [ ] Make sure `send-emails` is deployed to the production project. It sends through Brevo only, and needs `BREVO_API_KEY` and `EMAIL_FROM` to be set.
- [ ] In Brevo, **add Cydex's domain** (Senders, Domains & Dedicated IPs → Domains) and add the DNS records it gives you at the domain registrar: Brevo's code, DKIM and DMARC. Wait until the domain shows as **Authenticated**.
- [ ] **Add the sender** you'll use in `EMAIL_FROM` (e.g. `hello@your-domain`) under Senders.
- [ ] Set `BREVO_API_KEY`, `EMAIL_FROM` and `EMAIL_CRON_SECRET` (section 3.4).
- [ ] **Schedule the sender.** Run in the SQL editor, using the same `EMAIL_CRON_SECRET`:
  ```sql
  select vault.create_secret('<EMAIL_CRON_SECRET>', 'email_cron_secret');

  select cron.schedule('send-emails', '* * * * *', $$
    select net.http_post(
      url := 'https://<prod-ref>.supabase.co/functions/v1/send-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$);
  ```
- [ ] **Check it works:** sign up a test account. Within a minute its welcome email shows as **Sent** on **Admin → Emails**.

---

## 5. Squad (live)

- [ ] **Finish Squad KYC** so the live keys and payouts are enabled.
- [ ] **Set the live function secrets** (section 3.4): `SQUAD_SECRET_KEY`, `SQUAD_API_URL`, `SQUAD_MERCHANT_ID`, `APP_URL`.
- [ ] **Set the webhook URL** in the Squad **live** dashboard: `https://<prod-ref>.supabase.co/functions/v1/squad-webhook`. This is how payments are confirmed even if the customer closes the tab.
- [ ] **Keep money in the Squad balance.** Withdrawals are sent from Cydex's Squad balance when an admin approves them. If it's empty, the transfer fails and the money goes back to the user's wallet.

---

## 6. Google Maps

- [ ] In Cydex's Google Cloud project, turn on billing and enable **Places API (New)**, **Maps JavaScript API** and **Geocoding API**.
- [ ] Create an API key (APIs & Services → Credentials) and **restrict** it:
  - Websites: `https://usecydex.app/*` and `https://www.usecydex.app/*`, plus your Vercel preview addresses if you use them (and `http://localhost:8080/*` for a separate dev key)
  - APIs: only the three above
- [ ] Put it in `VITE_GOOGLE_MAPS_API_KEY` (section 7).
- [ ] For road distances: enable the **Routes API** and create a **second key** for the server. Restrict it to the Routes API only, with no website restriction (it's used by the `route-distances` Edge Function, not the browser). Set it as the `GOOGLE_ROUTES_API_KEY` function secret on each project, and deploy `route-distances`.
- [ ] Set a **budget alert** in Google Cloud billing, so a spike doesn't go unnoticed. Optionally cap the Routes API's daily requests (APIs & Services → Routes API → Quotas).

---

## 7. Environment variables (the web app)

Every `VITE_` variable is built into the website, so **anyone can read it**. Only public values go here; secrets go in the function secrets (section 3.4).

### Vercel → Project → Settings → Environment Variables (Production)

| Variable | Value | Needed |
|---|---|---|
| [ ] `VITE_SUPABASE_URL` | `https://<prod-ref>.supabase.co` | Yes: the app won't start without it |
| [ ] `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → **anon / publishable** key | Yes: the app won't start without it |
| [ ] `VITE_GOOGLE_MAPS_API_KEY` | Cydex's restricted key | Yes |
| [ ] `VITE_VAPID_PUBLIC_KEY` | The production VAPID **public** key | Yes, for push notifications |

That's all four. Squad has no app variables any more: its keys are function secrets (section 3.4).

**Never** add a secret key (Squad secret, Supabase service role, VAPID private, Brevo) as a `VITE_` variable.

### Local `.env.production` (for a production build on your computer)

The same four variables, with the production values, go in `.env.production` in the repo folder (already created, with the names and blanks to fill; it's gitignored). `npm run build` and `npm run preview` use it; `npm run dev` doesn't. Vercel doesn't read it: Vercel uses the variables above.

### Local `.env` (for `npm run dev`)

Copy `.env.example` to `.env` and fill in the same names, for the test Supabase project. `.env` is in `.gitignore`; never commit it. After editing it, restart `npm run dev`.

---

## 8. Hosting (Vercel)

- [ ] **Import the GitHub repo** in Vercel. Framework **Vite**, build command `npm run build`, output folder `dist`. `vercel.json` already sends every page to the app.
- [ ] Choose the **production branch** (the branch Vercel deploys to the live site).
- [ ] Add the environment variables (section 7), then **redeploy**. Vite only reads them at build time. If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing from a build, the site shows a "Cydex isn't set up on this deployment yet" page naming what's missing.
- [ ] **Domain:** add it under Settings → Domains, and add the DNS records Vercel shows at the registrar. HTTPS is automatic.
- [ ] Update everything that mentions the domain: Supabase **Site URL** and **Redirect URLs** (3.3), `APP_URL` (3.4) and the Google Maps key restriction (6).

---

## 9. Launch test (real money, small amounts)

Use three test accounts on phones (customer, vendor and rider) and an admin account, and go through the whole flow. See [ORDER_FLOW.md](ORDER_FLOW.md).

- [ ] **Sign up each role.**
  - Each gets a welcome notification and email.
  - The vendor and rider go through onboarding. The admin verifies them in Admin → Verifications.
- [ ] **Order and pay.** The customer orders and pays with a real card.
  - The order becomes paid and the vendor gets "New order".
  - The customer gets "Payment confirmed" and an email.
- [ ] **Close the tab straight after paying** on a second order. It should still become paid, which shows the webhook works.
- [ ] **Vendor steps.** The vendor accepts, then marks the order ready. The rider (online, within 5 km of the store, on a vehicle that covers the trip) gets "Order nearby" and can accept it.
- [ ] **Handover.**
  - The rider taps **Head to vendor** and shows the pickup code, and the vendor enters it.
  - The rider enters the customer's delivery code, and the order becomes **Delivered**.
- [ ] **Payouts.**
  - The vendor's and rider's wallets are credited.
  - The order shows on **Admin → Money → Earnings**, and the row adds up.
- [ ] **Refunds.** Cancel a paid pending order as the customer, and reject a paid order as the vendor. Both refund to the customer's wallet, with a notification and an email.
- [ ] **Admin cancel.** As the admin, **Cancel & refund** an order from its order page.
- [ ] **Withdrawal.**
  - The vendor withdraws a small amount, and the admin approves it in **Admin → Money → Withdrawals**.
  - The money arrives in the bank, and **Check status** shows it as paid.
- [ ] **Delivery mode and "riders busy".** With the rider offline, checkout shows the "all our riders are busy" message and doesn't let the customer pay. With the rider online, their vehicle type can be picked as the preferred delivery mode.
- [ ] **Wallet first.** With money in the customer's wallet (from a refund), place an order: the wallet pays first and the card only the rest.
- [ ] **Rider is around.** On a delivery, the rider taps **I've arrived**; the customer gets the notification and push.
- [ ] **Opening hours.** Set the vendor's hours to closed for today; the customer can't check out.
- [ ] **Request a Rider.** The vendor sends a parcel with **Request a Rider** (single and batch). The recipient gets the delivery code by email.
- [ ] **Cydex Express.** The customer sends an item; the rider's pickup code is entered by the customer, and the recipient gets the delivery code by email.
- [ ] **Promotion.** Create a coupon in **Admin → Promotions** with 1 use for each person. Use it at checkout, check it's refused the second time, and check the Promo cost on **Admin → Money → Earnings**.
- [ ] **Broadcast.** Send a broadcast to customers from **Admin → Broadcasts** as a notification and an email. The test customer gets both.
- [ ] **Minimum withdrawal.** A vendor or rider can't withdraw less than ₦3,000.

The full set of test scenarios for the product team is in [TEST_SCENARIOS.md](TEST_SCENARIOS.md).
- [ ] **Admin invite.** Invite a second admin from **Admin → Users**. They set a password from the email and can log in.
- [ ] **Install the app.**
  - On an Android phone, use the **Install** banner. On an iPhone, use **Share → Add to Home Screen**.
  - Check it opens full screen with the Cydex icon, and that push notifications arrive on both.

---

## 10. After launch

- [ ] **Check daily** the admin Overview's **To do** list: verifications to review, withdrawals to approve, stuck orders and failed emails.
- [ ] **Check weekly:**
  - Supabase → Edge Functions → Logs for `squad-webhook` and `squad-payout` errors
  - The Squad balance (enough for the week's withdrawals)
  - Google Cloud billing
- [ ] **Decide who handles support cases:** withdrawals, locked handover codes, stuck deliveries, refunds and suspensions. The tools are in the admin ([ADMIN.md](ADMIN.md)).
