# Holly PRM - Quick Setup Guide

This guide walks through the steps needed to get Holly PRM usable end-to-end after a fresh deployment. It covers the administrator setup first, then the onboarding path for each individual user.

If you are deploying Holly PRM for the first time, follow the "Administrator setup" section. If an administrator has already set up the instance and your account has been approved, skip to "User setup".

---

## Administrator setup

### Step 1: Sign in

1. Navigate to the Holly PRM login page
2. Enter the administrator email and password configured during deployment (`ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`)
3. The sidebar should show an "Admin" link at the bottom

On first login the admin account automatically gets a database user record created, so it can own data like any other user.

### Step 2: Approve any pending user requests

1. Open the Admin panel from the sidebar
2. In "Pending approval" you will see anyone who has requested an account
3. Click Approve or Reject for each entry

Users cannot access the system until approved. If email is configured, they receive a notification on approval.

### Step 3: Connect the Obsidian Vault (optional)

Skip this if you do not use Obsidian with the Self-hosted LiveSync plugin.

1. In the Admin panel, scroll to "Obsidian Vault"
2. Fill in the CouchDB URL, database name, username, password, and your LiveSync E2E encryption passphrase
3. Click Test to verify connectivity
4. Set the workday and weekend sync schedules (defaults are sensible)
5. Click Save
6. Click Sync now to pull an initial set of notes

Users see a read-only status of this integration on their Profile page. All vault configuration stays in the Admin panel.

### Step 4: Generate Holly API keys (optional)

Skip this unless you are connecting an external Holly/Openclaw agent to the PRM.

1. In the Admin panel, scroll to "Holly API Keys"
2. Enter a descriptive name (for example "Holly production")
3. Click Generate
4. Copy the plaintext key that appears - it is shown only once
5. Configure your Holly deployment with this key

### Step 5: Set up cross-user access grants (optional)

Skip this if you have a single user.

Use this when one approved user needs read and contribute access to another user's contacts.

1. In the Admin panel, scroll to "Access grants"
2. Enter the grantor email (the owner whose contacts will be shared)
3. Enter the grantee email (the user who will gain access)
4. Click Create

### Step 6: Claim unclaimed data (one-off migration only)

Skip this on fresh deployments.

If you are migrating from a single-user instance, use "Claim unclaimed data" to assign records with no owner to a chosen approved user. This is a one-time operation.

### Step 7: Set the cron job

Outside the app, configure an external scheduler (Coolify cron, uptime monitor, cron-job.org, etc.) to POST to the cron endpoint every 15-60 minutes:

```
URL:      https://<your-domain>/api/v1/cron/notify
Method:   POST
Header:   Authorization: Bearer <CRON_SECRET>
```

The cron drives push notifications, Gmail polling, Obsidian vault sync, urgency escalation, and automatic task rescheduling. The app still works without it, but nothing automatic will happen.

### Administrator checklist

| Done | Task |
|------|------|
| ☐ | Signed in as administrator |
| ☐ | Approved initial user accounts |
| ☐ | Obsidian Vault configured and tested (if used) |
| ☐ | Holly API key generated (if used) |
| ☐ | Access grants created (if needed) |
| ☐ | Cron job scheduled |

---

## User setup

This is the order we recommend new users follow to unlock every feature. Steps 1-4 are required, 5+ are optional and can be done any time.

### Step 1: Get your account approved

1. Go to the Holly PRM sign-in page
2. Click "Request an account"
3. Fill in your name, email, and password (minimum 8 characters)
4. Submit - your account is now pending
5. Wait for an administrator to approve the request
6. Sign in with your email and password

Alternatively, sign in with Google OAuth. Your first Google sign-in creates a pending account that also needs administrator approval.

### Step 2: Set up your Roles

Roles are the top-level areas of your life. Think "Work", "Personal", "Volunteer", "Health", "Family".

1. Go to Settings
2. Expand the "Roles and Goals" section
3. For each role you want to track:
   - Click "+ Add role"
   - Enter a name (for example "Work")
   - Pick a colour (this shows up on calendar, tasks, and project cards)
   - Click Save

You can also just use the default "Unassigned" role if you prefer to organise later.

### Step 3: Add Goals under each Role

Goals are objectives or focus areas within a role. Examples: "Career development" (ongoing), "Ship Q2 launch" (completable with a target date).

1. Still in Settings > Roles and Goals, click the role to expand it
2. Click "+ Add goal"
3. Enter a name
4. Choose the type:
   - **Ongoing** - goals you continuously work on (no end date)
   - **Completable** - goals with an end state (set a target date)
5. Save

Every project and task must live under a goal, so create at least one for each role you use.

### Step 4: Configure scheduling preferences (optional but recommended)

Skip this to use sensible defaults. Do it if your working patterns are different.

1. Go to Settings, scroll to "Scheduling"
2. Urgency windows (days): how soon to schedule tasks in each urgency band
   - ASAP (default 1), Soon (default 7), Sometime (default 30), Scan ahead (default 30)
3. Effort sizes (minutes): how long each effort category represents
   - Minutes (20), Hour (90), Half Day (240), Day (480)
4. Click Save scheduling preferences

### Step 5: Add some contacts

Contacts are the heart of the PRM.

1. Go to Contacts
2. Click "+ Add contact"
3. Fill in name, type (personal/work/family/volunteer), optional email and phone
4. **Important:** Set an interaction frequency target if you want the health score to track how well you are keeping in touch
5. Save

The health score starts at 100 and decays as time passes without an interaction (relative to your frequency target). The dashboard highlights contacts that need attention.

### Step 6: Create your first project

1. Go to Projects
2. Click "+ New project"
3. Pick a Role, then a Goal within that role
4. Fill in title, description, category, priority, and target date
5. **Visibility:** Personal (only you see it) or Shared (all approved users see it)
6. **Scheduling priority:** whether tasks in this project are more / same / less important than other tasks
7. Save

### Step 7: Add tasks with scheduling dimensions

Tasks can live inside a project or directly under a goal.

1. From the project detail page, click "+ Add task" (or go to the Tasks page for standalone tasks)
2. Enter the title
3. If the project is Shared, optionally pick an assigned user
4. Click "Scheduling options" to reveal:
   - **Importance**: Core (must do), Step (committed, may slip), Bonus (may drop)
   - **Urgency**: ASAP / Soon / Sometime / Dated / Undefined
   - **Effort**: Minutes / Hour / Half Day / Day / Project / Milestone
5. Save

Tasks with importance set participate in automatic scheduling. Tasks without importance are manual-only.

### Step 8: Create time slots in the calendar

The scheduler needs blocks of capacity to place tasks into.

1. Go to Calendar and switch to Week view
2. Click "+ Add Time Slot"
3. Pick the role whose tasks should fill this block
4. Set the date, start and end time, and an optional title
5. Tick "Repeating" if this is a weekly pattern (for example Monday 09:00-12:00 Work)
6. Configure the repeat type, interval, and end date or "Repeat forever"
7. Click Save

Recommended starter set: one recurring weekly slot per role you use, sized to how much time you actually have.

### Step 9: Run Schedule All

1. Go to Tasks
2. Click "Schedule All" at the top
3. The engine assigns each task (that has importance set) to the first available time slot for its role
4. Check the results: X scheduled, Y alerts
5. For any alerts, either create more time slots for that role or relax the task's urgency

You can also schedule individual tasks using the "sched" / "retry" / "resched" button on each task row.

### Step 10: Connect Google (optional)

1. Go to Settings > Google Integration
2. Click "Connect Google"
3. Authorise access

Once connected, Google Calendar events show up in the calendar view and task due dates sync to your Google Calendar. Gmail polling feeds the briefing.

### Step 11: Enable push notifications (optional)

1. Go to Settings > Notifications
2. Click Enable
3. Allow the browser notification permission

You will now get pushes for overdue contacts and due follow-ups (as long as the cron is running).

### Step 12: Install as a PWA (optional)

On mobile browsers use "Add to Home Screen" from the browser menu. On desktop Chrome/Edge look for the install icon in the address bar. The app will then launch full-screen like a native app.

### User checklist

| Done | Task |
|------|------|
| ☐ | Account requested and approved |
| ☐ | Roles created |
| ☐ | Goals added under roles |
| ☐ | Scheduling preferences reviewed |
| ☐ | First contacts added with frequency targets |
| ☐ | First project created |
| ☐ | Tasks added with importance and effort set |
| ☐ | Time slots created (one per role minimum) |
| ☐ | Schedule All run successfully |
| ☐ | Google connected (if using Gmail/Calendar) |
| ☐ | Push notifications enabled (if using mobile) |
| ☐ | PWA installed on mobile home screen (optional) |

---

## After setup: using the app day to day

1. **Start on the Dashboard** every morning - it shows overdue contacts, upcoming milestones, your action items, and any scheduling alerts
2. **Log interactions** as they happen using the "+ Log interaction" button in the sidebar (desktop) or bottom nav centre (mobile)
3. **Add tasks** as they come up; set their scheduling dimensions so the engine can place them automatically
4. **Check Calendar weekly** to see how much capacity you have and whether slots are filling up
5. **Run Schedule All** after major changes (new time slots, new tasks, changed due dates)
6. **Review Reports** periodically to see relationship health trends and project velocity

For more detail on any feature, see the full [User Guide](./user-guide.md).

Administrators: see the [Administrator Guide](./admin-guide.md) for ongoing admin tasks like user management and vault configuration.
