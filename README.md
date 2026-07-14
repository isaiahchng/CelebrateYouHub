# Celebrate You! — Post-Course Hub

An 8-week post-course engagement app for participants of the *Celebrate You!*
healthy longevity programme. Each week unlocks a nudge (Insight → Reflection →
Challenge → Peer Circle) drawn from the 2026 curriculum. Participants submit
reflections, an AI drafts feedback grounded in the curriculum, and a facilitator
reviews and sends it before the participant ever sees it. Private peer-circle
boards let each course cohort support each other.

## How it's built

- **Frontend** — plain HTML/CSS/JS, no build step. Hosted free on **GitHub Pages**.
- **Database + Auth** — **Supabase** (Postgres, magic-link login, Row Level
  Security). Configured entirely through the Supabase dashboard and SQL editor —
  no server to run.
- **AI feedback drafting** — one small serverless function on **Vercel**, which
  is the only place your Anthropic API key lives. Vercel builds it straight from
  GitHub — nothing to run locally.

Total monthly cost at 30 participants: **$0** (all three platforms' free tiers
comfortably cover this).

---

## Setup — do these in order

### 1. Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, click **New Project**.
   - Region: Singapore (`ap-southeast-1`).
   - Save the database password somewhere safe.
2. Once provisioned, open the **SQL Editor** → New query. Paste in the entire
   contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.
3. New query again → paste in [`supabase/seed_weekly_content.sql`](supabase/seed_weekly_content.sql)
   and run it. This loads all 8 weeks of curriculum content.
4. Go to **Authentication → Providers** and confirm **Email** is enabled with
   "Confirm email" and magic-link sign-in on (these are on by default).
5. Go to **Authentication → URL Configuration** and add the URL you'll publish
   the site at (e.g. `https://yourusername.github.io/CelebrateYouHub/`) to
   **Redirect URLs** — otherwise magic-link emails won't be able to log people in.
6. Go to **Project Settings → API**. Note down:
   - **Project URL**
   - **anon public** key 
   - **service_role** key (keep this one secret — never put it in frontend code)

### 2. Fill in `js/config.js`

Open [`js/config.js`](js/config.js) and set:

```js
window.SUPABASE_CONFIG = {
  url: "<your Project URL>",
  anonKey: "<your anon public key>",
};
```

The anon key is safe to expose in frontend code — everything it can do is
governed by the Row Level Security policies in `schema.sql`.

### 3. Anthropic API key

Sign up at [console.anthropic.com](https://console.anthropic.com), add billing,
and create an API key. You'll paste this into Vercel in the next step, not into
any file in this repo.

### 4. Deploy the feedback function on Vercel

1. Go to [vercel.com](https://vercel.com), sign up with GitHub, **Add New →
   Project**, and import this repo.
2. Before deploying, add these **Environment Variables**:
   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `SUPABASE_URL` | your Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
   | `WEBHOOK_SECRET` | make up any long random string — this stops strangers from calling your function |
3. Deploy. Vercel will give you a URL like `https://celebrate-you-hub.vercel.app`.
   Your feedback endpoint is `https://celebrate-you-hub.vercel.app/api/generate-feedback`.

### 5. Wire up the Supabase → Vercel webhook

1. In Supabase, go to **Database → Webhooks → Create a new webhook**.
2. Table: `submissions`. Events: `Insert` and `Update`.
3. Type: **HTTP Request**, Method: **POST**.
4. URL: your Vercel function URL from step 4, with the shared secret as a
   query param, e.g.:
   `https://your-app.vercel.app/api/generate-feedback?secret=YOUR_WEBHOOK_SECRET`
   (If your Supabase UI does expose a custom HTTP header field, you can use
   that instead: header `x-webhook-secret` = your `WEBHOOK_SECRET` value. The
   query param works either way and doesn't depend on that field existing.)
5. Save. From now on, every time a participant submits or edits a reflection,
   Supabase will call your function and it'll drop an AI-drafted feedback item
   into the review queue.

### 6. Publish the frontend on GitHub Pages

1. Push this repo to GitHub (see below).
2. In the repo, go to **Settings → Pages**.
3. Source: **Deploy from a branch**. Branch: `main`, folder: `/ (root)`.
4. Save. Your site will be live at `https://yourusername.github.io/CelebrateYouHub/`
   within a minute or two.
5. Double check that this exact URL is in Supabase's **Redirect URLs** (step 1.5)
   — if it doesn't match, magic-link logins will fail silently.

### 7. Make yourself an admin

1. Sign in to the app once with your own email (this creates your `profiles`
   row automatically).
2. In Supabase, go to **Table Editor → profiles**, find your row, and set
   `is_admin` to `true`.
3. Visit `/admin.html` on your site — you should now see the Review Queue,
   Engagement dashboard, and a **Batches & Teams** tab.

### 8. Add batches, teams, and participants — all from `/admin.html`

No Supabase table editing needed for this, it's all in the **Batches & Teams**
tab:

1. **Create a batch** for each class you run (e.g. "July 2026 Batch"), with
   its start date — this is what drives which week each participant in that
   batch currently sees. Running several classes at once just means several
   batches, each on its own timeline.
2. **Create a peer circle** (team) per small group you want able to see each
   other's posts on the private team board — each team belongs to one batch,
   so participants from different classes can never end up sharing a peer
   circle (the database enforces this, not just the UI).
3. **Invite participants ahead of time**: enter their email (plus batch/team)
   in the "Invite a participant" form *before* they've ever signed in. Their
   account is created already assigned the moment they use their first magic
   link — no empty "not assigned yet" screen. If someone already signed in
   before you got to inviting them, the same form updates their existing
   account instead.

Running multiple classes concurrently just means multiple batches — each
participant only ever sees their own batch's current week.

### 9. Email deliverability — set up Custom SMTP before inviting real participants

Supabase's built-in email sender is rate-limited to a handful of emails per
hour and is only meant for testing. Before onboarding real participants:

1. Sign up at a transactional email provider (e.g. [resend.com](https://resend.com),
   free tier covers this scale) and verify your sending domain.
2. In Supabase: **Authentication → Emails → SMTP Settings** → enable Custom
   SMTP and fill in your provider's host/port/username/password and a sender
   address on your verified domain.
3. Save, then test a login.

---

## Local development

No local server is required — GitHub Pages serves static files as-is. To
preview locally before pushing:

```bash
npx serve .
```

The one piece of backend code (`api/generate-feedback.js`) only runs on Vercel;
if you want to test it locally you'll need the [Vercel CLI](https://vercel.com/docs/cli)
(`npm i -g vercel`, then `vercel dev`) with a `.env.local` containing the same
variables as step 4.

## Project structure

```
index.html          Login (magic link)
dashboard.html       Participant's weekly nudge + reflection form + feedback
team.html            Private peer-circle board
admin.html           Facilitator review queue + engagement dashboard
css/style.css
js/config.js          ← fill in your Supabase URL/key here
js/supabaseClient.js  Shared Supabase client + auth/session helpers
js/dashboard.js, js/team.js, js/admin.js
supabase/schema.sql             Run once in Supabase SQL Editor (fresh installs)
supabase/seed_weekly_content.sql  Run once, after schema.sql
supabase/migration_cohorts.sql  For a database that already had the old
                                 single-batch schema applied — adds the
                                 `cohorts` table without touching existing data
supabase/migration_invites.sql  Adds pre-invite support (assign a batch/team
                                 to an email before they've signed in)
supabase/migration_team_cohort.sql  Ties each team to one batch and enforces
                                     it at the database level
supabase/migration_facilitator_posts.sql  Lets admins post into any peer
                                           circle, flagged so participants
                                           can tell it's from a facilitator
supabase/migration_brief_content.sql  Updates the 8 weeks of nudge content
                                       to the condensed "brief" wording
api/generate-feedback.js   Vercel function: drafts AI feedback on submission
api/curriculumContext.js   Curriculum framework reference given to the AI
```

## Notes on the 3-month re-assessment

Week 8 in the app prompts participants to re-score their Wheel of Life and
declare a Keystone Habit, but the formal 3-month re-assessment (per the
Assessment Framework doc) is intentionally **not** built into this app — link
out to your separate assessment survey when you're ready to send it.
