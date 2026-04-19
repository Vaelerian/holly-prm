# Holly PRM - User Guide

## What is Holly PRM?

Holly PRM is a personal relationship manager with integrated project management, task scheduling, and calendar features. It helps you track your relationships, manage projects and tasks, and schedule your time across different life roles and goals.

Holly also integrates with an AI assistant (Holly/Openclaw) that can access your data via API to help with briefings, follow-ups, and task management.

## Getting Started

### Creating an Account

1. Visit the Holly PRM login page
2. Click "Request an account"
3. Fill in your name, email, and password (minimum 8 characters)
4. Submit the registration form
5. Your account will be in "pending" status until an administrator approves it
6. Once approved, you can log in with your credentials

Alternatively, you can sign in with Google OAuth. On your first Google sign-in, your account will also need admin approval before you can access the system.

### Logging In

- **Email/Password**: Enter your email and password on the login page
- **Google**: Click "Sign in with Google" to use your Google account
- **Forgot Password**: Click the forgot password link to receive a reset email (requires email to be configured)

### Your Profile

Access your profile from the sidebar to:
- Update your display name
- Change your email address (takes effect on next sign-in)
- Change your password (requires entering current password)

---

## Dashboard

The dashboard is your daily starting point. It shows:

- **Stats row**: Quick counts of overdue contacts, pending follow-ups, open action items, active projects, and tasks due today
- **Overdue contacts**: People you have not interacted with recently enough (based on your frequency targets)
- **Pending follow-ups**: Interactions that need follow-up action
- **Upcoming milestones**: Project milestones approaching their due dates
- **My action items**: Action items assigned to you, sorted by priority and due date
- **Scheduling alerts**: Tasks that the scheduling engine could not place into a time slot, with explanations of why

---

## Contacts

Contacts are the core of Holly PRM. Each contact tracks:
- Name, type (personal, work, family, volunteer)
- Email addresses and phone numbers
- Health score (0-100, automatically calculated based on interaction frequency)
- Interaction frequency target (how often you want to be in touch)
- Tags and notes
- Whether they are a family member

### Health Score

The health score starts at 100 and decays as time passes without interaction. If you set a frequency target (e.g. every 14 days), the health score drops as you approach and pass that target. Interacting with the contact resets the score.

- Green (70+): You are keeping in touch well
- Yellow (40-70): Getting close to overdue
- Red (below 40): Overdue for interaction

### Interactions

Log interactions with your contacts to track your relationship:
- Type: call, meeting, email, message, event
- Direction: inbound or outbound
- Summary of what was discussed
- Outcome notes
- Follow-up tracking: mark if follow-up is required, set a follow-up date
- Location and duration (optional)

**How to log an interaction:**
- **Desktop**: Click the "Log interaction" button near the bottom of the left sidebar
- **Mobile**: Tap the green "+" button in the centre of the bottom navigation

The form opens in a modal and lets you log an interaction against any of your contacts from anywhere in the app.

### Sharing Contacts

If an administrator has created an access grant, you may be able to see another user's contacts. Shared contacts appear in your contacts list with a "Shared by [name]" label. You can add interactions to shared contacts but cannot edit or delete them.

---

## Projects

Projects let you organise larger pieces of work. Each project has:
- Title and description
- Category: personal, work, or volunteer
- Status: planning, active, on hold, done, cancelled
- Priority: low, medium, high, critical
- Target date (optional)
- Notes

### Role and Goal Assignment

Every project must be assigned to a goal, which belongs to a role. This hierarchy organises your work:

- **Roles** are broad areas of your life (e.g. "Work", "Personal", "Volunteer")
- **Goals** are objectives within a role (e.g. "Career Development" under Work). Goals can be ongoing or completable.
- **Projects** sit under goals and contain tasks

When creating a project, select a role first, then a goal within that role. If you have not created any roles or goals, a default "Unassigned" role with a "General" goal is used.

### Scheduling Priority

Each project has a scheduling priority setting: Same, More Important, or Less Important. This affects how the scheduling engine prioritises this project's tasks relative to non-project tasks and tasks from other projects:
- **More Important**: Tasks from this project are promoted one importance level (e.g. Step becomes Core)
- **Same**: No adjustment (default)
- **Less Important**: Tasks from this project are demoted one importance level

This is useful for long-running background projects (set to Less Important) versus urgent deadline projects (set to More Important).

### Visibility

Each project has a visibility setting that controls who can see and contribute to it:

- **Personal** (default): Only you can see and edit this project. Other users will not see it in their projects list.
- **Shared**: All approved users can see the project, view its tasks, add tasks to it, and have tasks assigned to them. Only the project owner can edit the project settings or delete it.

Shared projects display a "Shared" badge on the project card and in the detail view. Use shared projects for collaborative work where multiple team members need to contribute.

### Project Members

Project owners can also add specific users as members. Members can view the project and add tasks without needing the project to be fully shared with everyone. This is useful when you want to collaborate with a small group rather than the entire user base.

---

## Tasks

Tasks are individual pieces of work. They can belong to a project or exist directly under a goal.

### Basic Fields

- Title and description
- Status: todo, in progress, done, cancelled
- Priority: low, medium, high, critical
- Assigned to: Ian or Holly (your name or the AI assistant)
- Assigned user (shared projects only): any approved user
- Due date (optional)
- Milestone flag (for key project milestones)

### Task Assignment on Shared Projects

When a task is added to a shared project, an additional "Assigned user" dropdown appears alongside the standard Ian/Holly selector. This lets you pick any approved user of the system to be responsible for the task.

The existing Ian/Holly assignment is kept for the scheduling engine and dashboard briefing. The new user assignment shows up on task rows as an info badge so everyone can see who owns the task.

### Scheduling Fields

Tasks have additional fields used by the scheduling engine:

- **Importance**: How committed you are to completing the task
  - Core: Must complete as scheduled
  - Step: Committed but may slip
  - Bonus: Not committed, may drop if capacity is tight
  - Undefined: Task does not participate in scheduling

- **Urgency**: How soon the task should be scheduled
  - ASAP: Schedule within 1 day (configurable)
  - Soon: Schedule within 7 days (configurable)
  - Sometime: Schedule within 30 days (configurable)
  - Dated: Uses the task's due date as the scheduling horizon
  - Undefined: Uses the default scan-ahead window

- **Effort Size**: How long the task will take
  - Minutes (~20 min), Hour (~90 min), Half Day (~4 hours), Day (~8 hours), Project (multi-day), Milestone (zero time)
  - You can also enter a custom number of minutes for precision

These scheduling fields are in a collapsible "Scheduling options" section on the task form, so they do not get in the way of quick task creation.

### Task Views

The Tasks page has two view modes, toggled via tabs at the top:

**By Goal**: Tasks grouped by Role, then Goal, then Project. Tasks not in a project appear under "Direct tasks". This is the default organisational view.

**By Schedule**: Tasks sorted by their scheduled time slot date. Shows:
- Date section headers (e.g. "Monday 21 April 2026")
- Time range from the assigned slot
- Task title with effort and float badges
- "Needs Attention" section for tasks in alert state
- "Unscheduled" section for tasks with importance set but not yet scheduled

### Scheduling Tasks

You can schedule tasks in two ways:

1. **Schedule All**: Click the "Schedule All" button at the top of the Tasks page. This runs the scheduling engine across all your schedulable tasks, placing them into time slots based on priority order.

2. **Per-task**: Each task with importance set shows a small action button:
   - "sched" on unscheduled tasks - schedules that single task
   - "retry" on alert tasks - retries scheduling after you have created more time slots
   - "resched" on scheduled tasks - removes from current slot and finds a new one

### Float Display

For tasks that are both scheduled (assigned to a time slot) and have a due date, a float indicator shows how much slack you have:
- Green "Float: X days" - plenty of time between scheduled date and due date
- Amber "Float: 1-2 days" or "Due today" - getting tight
- Red "Overdue by X days" - scheduled date is after the due date

### Urgency Auto-Escalation

The system automatically escalates task urgency as due dates approach. A task set to "Sometime" will be promoted to "Soon" when it falls within the Soon window, and to "ASAP" when it falls within the ASAP window. Urgency never decreases automatically. This runs during the cron job.

---

## Calendar

The Calendar page shows three views:

### Month View

A traditional monthly calendar grid showing:
- Task due dates, project target dates, milestones, action items, follow-ups
- Google Calendar events (if connected)
- Colour-coded dots by type
- Daily capacity indicators showing how much time is allocated to each role

### Week View

A time-grid layout showing hours on the vertical axis and days horizontally:
- **Time slot blocks** positioned by their start/end times, coloured by role
- Each slot shows a capacity bar (how much is used vs total)
- Scheduled tasks appear inside their assigned slot blocks
- Google Calendar events appear as separate blocks
- All-day items (due dates, milestones) appear in a header row
- Click empty space to create a new time slot
- Click a slot to edit or manage it

### Agenda View

A list view showing upcoming items in date order:
- Time slots with their time ranges and capacity bars
- Due dates, follow-ups, and other events
- Only shows items from today onwards

### Creating Time Slots

Time slots are blocks of capacity that you reserve for a specific role. Click "Add Time Slot" on the Calendar page:

1. Select a role (e.g. Work, Personal)
2. Pick a date
3. Set start and end times
4. Optionally add a title
5. Optionally make it repeating:
   - Choose repeat type (daily, weekly, monthly, yearly)
   - For weekly: select which days
   - Set an interval (e.g. every 2 weeks)
   - Choose an end date or "repeat forever"

### Managing Repeat Slots

When you click on a slot that comes from a repeating pattern, you get options:
- **Edit this occurrence** - change just this one instance
- **Skip this occurrence** - remove this single date
- **Edit entire pattern** - change all instances
- **Delete entire pattern** - remove the repeating pattern

---

## Roles and Goals

Manage your roles and goals in the Settings page under "Roles and Goals":

### Roles

Roles are top-level areas of responsibility. Examples: Work, Personal, Volunteer, Health.

- Each role has a name, colour (used in calendar and task displays), and optional description
- Create roles to match your life areas
- A default "Unassigned" role exists and cannot be deleted
- Deleting a role requires choosing another role to move its goals, projects, and tasks to

### Goals

Goals sit under roles and represent objectives you are working towards.

- Each goal has a name, type (ongoing or completable), and optional description
- **Ongoing goals** never complete (e.g. "Career Development", "Stay Healthy")
- **Completable goals** have an optional target date and can be marked as completed
- A default "General" goal exists under the default role and cannot be deleted
- Deleting a goal requires choosing another goal to move its projects and tasks to

---

## Scheduling Preferences

Configure the scheduling engine in the Settings page under "Scheduling":

### Urgency Windows

These control how far ahead the scheduler looks based on task urgency:
- **ASAP days** (default 1): Schedule ASAP tasks within this many days
- **Soon days** (default 7): Schedule Soon tasks within this many days
- **Sometime days** (default 30): Schedule Sometime tasks within this many days
- **Scan ahead days** (default 30): Maximum days to search for available slots

### Effort Size Mappings

These define how many minutes each effort size represents:
- **Minutes** (default 20)
- **Hour** (default 90)
- **Half Day** (default 240)
- **Day** (default 480)

Adjust these to match your actual working patterns. If your "hour" tasks typically take 60 minutes rather than 90, change it.

---

## Reports

The Reports page offers three analytics views with configurable time windows (30, 90, or 365 days):

### Relationship Health

A table showing your contacts with frequency targets:
- Health score (colour-coded)
- Trend: improving, declining, stable, or insufficient data
- Days since last interaction
- Target frequency

### Project Velocity

Shows active projects with:
- Task completion progress bar
- Completion ratio (done/total tasks)
- Weekly completion rate
- Projected completion date based on current velocity

### Action Item Completion

Overall completion rates broken down by assignee (you vs Holly):
- Week-by-week completion rates
- Running totals

---

## Google Integration

Connect your Google account in Settings under "Google Integration":

1. Click "Connect Google"
2. Authorise access in the Google consent screen
3. Once connected, the system will:
   - Show Google Calendar events in the Calendar view
   - Poll recent Gmail messages for the briefing
   - Sync task due dates and project target dates to your Google Calendar

To disconnect, click "Disconnect" in Settings.

---

## Obsidian Vault (CouchDB/LiveSync)

If the deployment has an Obsidian vault configured, Holly PRM can search and sync vault notes.

Vault configuration is admin-only. On your Profile page you will see a read-only "Obsidian Vault" section showing:
- Status: Configured or Not Configured
- Accessible: Yes or No (once configured)
- Last sync timestamp

If the vault is not configured or not accessible, contact the administrator. The administrator manages the CouchDB connection, E2E passphrase, sync schedule, and can trigger manual syncs from the Admin panel.

---

## Push Notifications

Enable push notifications in Settings under "Notifications":
1. Click "Enable"
2. Allow the browser notification permission when prompted
3. You will receive notifications for:
   - Overdue contacts (health score critically low)
   - Follow-ups that are due

Notifications are triggered by the cron job, so they depend on the cron being configured.

---

## Holly API Keys

Holly (Openclaw) is an AI assistant that can access the PRM to provide briefings, log interactions, manage tasks, and more.

API keys are managed by the administrator (in the Admin panel). If you need a key for a new Holly deployment or a key revoked, contact the administrator.

---

## Keyboard Shortcuts and Tips

- The Tasks page remembers your selected view mode (By Goal / By Schedule) via URL parameters
- The Calendar view remembers your last selected mode (month/week/agenda) in session storage
- Click any contact's health score to quickly see when you last interacted
- Use the Reports page to identify relationships that need attention
- Set importance on tasks you want the scheduler to place; leave it undefined for tasks you manage manually
- Create repeating time slots for your weekly routine, then let the scheduler fill them with tasks
