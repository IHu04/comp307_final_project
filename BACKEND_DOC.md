# McGill McSlot - Backend Technical Documentation

---

## Table of Contents
1. [Project Structure](#project-structure)
2. [Entry Point & App Setup](#entry-point--app-setup)
3. [Configuration](#configuration)
4. [Middleware](#middleware)
5. [Routes](#routes)
6. [Controllers](#controllers)
7. [Utilities](#utilities)
8. [Database Schema & Migrations](#database-schema--migrations)
9. [Key Design Decisions](#key-design-decisions)
10. [TA Demo Questions & Answers](#ta-demo-questions--answers)

---

## Project Structure

```
src/
├── server.js                  # Entry point - boots DB then starts HTTP server
├── app.js                     # Express app factory - middleware stack + route mounting
├── config/
│   ├── env.js                 # Env var validation and export
│   ├── db.js                  # MySQL2 connection pool
│   └── session.js             # Express-session + MySQL session store
├── middleware/
│   ├── auth.js                # isAuthenticated, isOwner, isResourceOwner
│   ├── errorHandler.js        # 404 handler + global error handler
│   ├── groupMeetingAccess.js  # canViewGroupMeeting, isGroupMeetingParticipant
│   └── validate.js            # express-validator chains + validate() runner
├── routes/
│   ├── index.js               # Aggregates all subrouters under /api
│   ├── auth.js                # /auth - register, login, logout, me, password
│   ├── users.js               # /users - profile read/update
│   ├── slots.js               # /slots - owner slot CRUD + student booking
│   ├── owners.js              # /owners - public owner discovery
│   ├── invite.js              # /invite - token-based direct booking link
│   ├── dashboard.js           # /dashboard - role-aware dashboard data
│   ├── appointments.js        # /appointments - ICS calendar export
│   ├── meeting-requests.js    # /meeting-requests - Type 1 booking
│   ├── group-meetings.js      # /group-meetings - Type 2 booking
│   ├── recurrence-patterns.js # /recurrence-patterns - Type 3 booking
│   └── team-requests.js       # /team-requests - TeamFinder feature
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   ├── slotController.js
│   ├── slotBookController.js
│   ├── meetingRequestController.js
│   ├── ownerBrowseController.js
│   ├── recurrenceController.js
│   ├── dashboardController.js
│   ├── groupMeetingController.js
│   └── teamRequestController.js
├── utils/
│   ├── asyncHandler.js        # Wraps async handlers to forward errors to next()
│   ├── apiResponse.js         # sendOk / sendCreated helpers
│   ├── slotTime.js            # Time normalization, overlap math
│   ├── slotOverlap.js         # DB-level overlap queries
│   ├── recurrenceDates.js     # Weekly date generation for recurrence
│   ├── mcgillEmail.js         # Domain validation (@mcgill.ca vs @mail.mcgill.ca)
│   ├── userPublic.js          # Strips password_hash before API responses
│   ├── dateSlot.js            # MySQL DATE -> YYYY-MM-DD string conversion
│   ├── montrealSlot.js        # Anchors slot times to America/Montreal for ICS
│   └── mailto.js              # Builds mailto: URIs for email notifications
└── db/
    ├── migrate.js             # Migration runner
    └── migrations/
        ├── 001_bookings.sql
        ├── 002_users_and_sessions.sql
        ├── 003_recurrence_and_booking_slots.sql
        ├── 004_meeting_requests.sql
        ├── 005_group_meetings.sql
        ├── 006_team_finder.sql
        └── 007_add_location_to_booking_slots.sql
```

---

## Entry Point & App Setup

### `src/server.js`
Boots the application in sequence:
1. Calls `connectDB()` to verify MySQL is reachable.
2. Starts `app.listen()` on `env.port` (default 3000).
3. Registers `SIGTERM`/`SIGINT` handlers for graceful shutdown - closes session store before disconnecting DB to avoid orphaned connections.

### `src/app.js`
Configures and exports the Express app:

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | CORS | Allows configured `FRONTEND_ORIGIN`; reflects request origin in dev |
| 2 | JSON body parser | Parses `application/json` request bodies |
| 3 | URL-encoded parser | Parses form bodies |
| 4 | Cookie parser | Required for session cookie signing |
| 5 | Session middleware | MySQL-backed sessions, 24h TTL, rolling expiry |
| 6 | Static file server | Serves HTML/CSS/JS from repo root; `homepage.html` as index |
| 7 | `/api` routes | All API endpoints |
| 8 | 404 + error handler | Catches unmatched routes and thrown errors |

In production, `trust proxy` is enabled so `secure` cookies work behind a reverse proxy.

---

## Configuration

### `src/config/env.js`
- `mustSet(key)` - throws at startup if a required env var is missing/empty.
- `corsOrigin()` - parses `FRONTEND_ORIGIN`; supports comma-separated list, single origin, or empty (allow all).
- Default export exposes: `port`, `nodeEnv`, `sessionSecret`, `corsOrigin`, `db` (host/user/pass/database/port).

**Required env vars:** `SESSION_SECRET`, `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`

### `src/config/db.js`
- Creates a MySQL2 `createPool` singleton (10 connection limit, keep-alive on, unlimited queue).
- `connectDB()` - tests the pool on startup, exits with code 1 if unreachable.
- `disconnectDB()` - gracefully ends the pool on shutdown.

### `src/config/session.js`
- Uses `express-mysql-session` to persist sessions in the `sessions` DB table.
- Cookie: `httpOnly`, `sameSite: lax`, `secure` in production, `maxAge: 24h`.
- `rolling: true` resets the TTL on every authenticated request.
- `saveUninitialized: false` - sessions only created on login/register.
- `closeSessionStore()` exported for graceful shutdown.

---

## Middleware

### `src/middleware/auth.js`

| Export | What it does |
|--------|-------------|
| `isAuthenticated` | Returns 401 if `req.session.userId` is missing |
| `isOwner` | Async - queries DB to confirm `is_owner = 1`, returns 403 if not |
| `isResourceOwner(table, idParam)` | Factory - queries the given table for a row matching both the route param id AND the session user as owner; returns 403 if no match |

Resource ownership column mapping:
- `booking_slots`, `recurrence_patterns`, `group_meetings`, `meeting_requests` -> `owner_id`
- `team_requests` -> `creator_id`

### `src/middleware/errorHandler.js`
- `notFound` - creates a 404 `Error` for any unmatched route.
- `errorHandler` - Express 4-argument error handler; returns JSON `{success: false, message, stack}` (stack only in development).

### `src/middleware/groupMeetingAccess.js`
- `canViewGroupMeeting` - allows owner OR listed participant; 404 if meeting not found, 403 if neither.
- `isGroupMeetingParticipant` - stricter; 403 if user not in `group_meeting_participants`.

### `src/middleware/validate.js`
Reusable express-validator chains:
- `validateEmail(field)` - trimmed, required, valid format, must be `@mcgill.ca` or `@mail.mcgill.ca`.
- `validatePassword(field)` - min 8 chars.
- `validateDate(field)` - trimmed, required, `YYYY-MM-DD` format and valid calendar date.
- `validateId(field, source)` - integer >= 1 from param or body.
- `validate(req, res, next)` - post-chain runner; returns 422 with details array if any check fails.

---

## Routes

### `src/routes/index.js`
Mounts all subrouters under `/api`:

| Path | Router file |
|------|------------|
| `/api/auth` | auth.js |
| `/api/users` | users.js |
| `/api/owners` | owners.js |
| `/api/invite` | invite.js |
| `/api/dashboard` | dashboard.js |
| `/api/appointments` | appointments.js |
| `/api/meeting-requests` | meeting-requests.js |
| `/api/group-meetings` | group-meetings.js |
| `/api/recurrence-patterns` | recurrence-patterns.js |
| `/api/team-requests` | team-requests.js |
| `/api/slots` | slots.js |

---

### `src/routes/auth.js`

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| POST | `/register` | registerRules, validate | `register` |
| POST | `/login` | loginRules, validate | `login` |
| POST | `/logout` | isAuthenticated | `logout` |
| GET | `/me` | isAuthenticated | `me` |
| PATCH | `/password` | isAuthenticated | `changePassword` |

### `src/routes/slots.js`

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| GET | `/mine` | isOwner | `listMySlots` |
| POST | `/` | isOwner | `createSlots` |
| PATCH | `/bulk-activate` | isOwner, bulkActivateRules | `bulkActivateSlots` |
| POST | `/:id/book` | isAuthenticated | `bookSlot` |
| DELETE | `/:slotId/book` | isAuthenticated | `cancelMySlotBooking` |
| GET | `/:id/mailto` | isOwner + isResourceOwner | `getSlotMailto` |
| PATCH | `/:id/activate` | isOwner + isResourceOwner | `activateSlot` |
| PATCH | `/:id/deactivate` | isOwner + isResourceOwner | `deactivateSlot` |
| DELETE | `/:id` | isOwner + isResourceOwner | `deleteSlot` |

### `src/routes/owners.js`

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| GET | `/all` | isAuthenticated | `listAllOwners` |
| GET | `/` | isAuthenticated | `listOwnersWithActiveSlots` |
| GET | `/:id/slots` | isAuthenticated | `listOwnerActiveSlots` |

### `src/routes/meeting-requests.js`

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| POST | `/` | isAuthenticated, createBody | `createMeetingRequest` |
| GET | `/received` | isAuthenticated, isOwner | `listReceivedRequests` |
| GET | `/sent` | isAuthenticated | `listSentRequests` |
| PATCH | `/:id` | isAuthenticated, isOwner, rules, isResourceOwner | `updateMeetingRequest` |

### `src/routes/recurrence-patterns.js`

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| GET | `/mine` | isOwner | `listMyRecurrencePatterns` |
| POST | `/` | isOwner, createRules | `createRecurrencePatterns` |
| DELETE | `/:id` | isOwner, validateId, isResourceOwner | `deleteRecurrencePattern` |

### `src/routes/group-meetings.js`

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| POST | `/` | isOwner, createRules | `createGroupMeeting` |
| GET | `/:id` | isAuthenticated, canViewGroupMeeting | `getGroupMeeting` |
| POST | `/:id/vote` | isAuthenticated, voteRules, isGroupMeetingParticipant | `voteOnGroupMeeting` |
| DELETE | `/:id/vote` | isAuthenticated, isGroupMeetingParticipant | `retractVote` |
| PATCH | `/:id/finalize` | isOwner, finalizeRules, isResourceOwner | `finalizeGroupMeeting` |
| DELETE | `/:id` | isOwner, isResourceOwner | `cancelGroupMeeting` |

### `src/routes/team-requests.js`

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| POST | `/` | isAuthenticated, createRules | `createTeamRequest` |
| GET | `/` | isAuthenticated, listQuery | `listTeamRequests` |
| POST | `/:id/join` | isAuthenticated | `joinTeamRequest` |
| DELETE | `/:id/leave` | isAuthenticated | `leaveTeamRequest` |
| DELETE | `/:id/members/:userId` | isAuthenticated, isResourceOwner | `removeTeamMember` |
| GET | `/:id` | isAuthenticated | `getTeamRequest` |
| DELETE | `/:id` | isAuthenticated, isResourceOwner | `deleteTeamRequest` |

---

## Controllers

### `authController.js`
Handles registration, login, logout, session management, and password changes.

**`register`**
- Reads `email`, `password`, `firstName`, `lastName`.
- Determines `is_owner` via `isOwnerEmail()` (domain = `@mcgill.ca` only, not `@mail.mcgill.ca`).
- Generates `invite_token` (UUID) for owners only.
- Hashes password with bcrypt (12 rounds).
- Catches `ER_DUP_ENTRY` for 409 on duplicate email.
- Calls `sessionRegenerate()` before storing `userId` to prevent session fixation.

**`login`**
- Finds user by email.
- `bcrypt.compare()` verifies password.
- Returns the same error message whether user is not found OR password is wrong (prevents user enumeration).
- Regenerates session, stores `userId`.

**`logout`**
- Destroys session, clears cookie.

**`me`**
- Returns public user shape from session; destroys session if user no longer exists in DB.

**`changePassword`**
- Verifies current password before hashing new one.

---

### `slotController.js`
Manages the full slot lifecycle: draft -> active -> booked, with overlap detection at every stage.

**`createSlots`**
- Accepts array of `{date, startTime, endTime, slotType?, location?}`.
- Validates each: date format, `endTime > startTime`, slot starts in future.
- Checks batch for self-overlaps (`batchOverlaps`).
- Opens transaction; checks each slot against existing DB slots (`ownerHasOverlappingSlot`).
- Inserts all as `status = 'draft'`.
- Rolls back entire batch if any slot overlaps.

**`activateSlot`**
- Acquires `SELECT FOR UPDATE` lock on the slot.
- Re-checks overlaps (prevents race with concurrent activation).
- Transitions `draft -> active`.

**`bulkActivateSlots`**
- Same as activateSlot but processes an array; skips invalid slots with reasons rather than aborting.

**`deactivateSlot`**
- Only allowed if `status = 'active'` (not booked).
- Transitions `active -> draft`.

**`deleteSlot`**
- For booked slots: builds `cancelMailto` for individual booker.
- For group meeting slots: fetches all participants, builds group `notifyParticipantsMailto`, marks `group_meetings.status = 'cancelled'`.

---

### `slotBookController.js`
Handles student booking and cancellation with row-level locking.

**`bookSlot`**
- Acquires `SELECT FOR UPDATE` on the slot.
- Prevents self-booking (owner cannot book own slot).
- Checks slot is `status = 'active'` and not expired.
- Queries all of student's existing bookings for the same day; uses `rangesOverlap()` to detect time conflicts.
- Updates: `status = 'booked'`, `booked_by`, `booked_at`.
- Builds `notifyOwnerMailto`.

**`cancelMySlotBooking`**
- Verifies `booked_by = userId`.
- Resets slot: `status = 'active'`, clears `booked_by`/`booked_at`.
- Builds `notifyOwnerMailto`.

---

### `meetingRequestController.js`
Type 1 booking - student requests a meeting; professor schedules it with date/time/location.

**`createMeetingRequest`**
- Prevents duplicate pending requests (same requester + owner pair).
- Prevents self-requesting.
- Inserts `meeting_requests` with `status = 'pending'`.
- Returns `notifyOwnerMailto` for the student to click and notify the prof.

**`updateMeetingRequest`** (PATCH)
- If `status = 'declined'`: updates status, returns `notifyRequesterMailto`.
- If `status = 'accepted'`:
  - Requires `date`, `startTime`, `endTime`, `location` (all mandatory).
  - Checks both professor's calendar and student's calendar for overlapping bookings.
  - Inserts a new `booking_slots` row: `status = 'booked'`, `slot_type = 'meeting_request'`.
  - Updates `meeting_requests.created_slot_id`.
  - Returns `notifyRequesterMailto` with time and location in the body.

---

### `recurrenceController.js`
Type 3 booking - weekly recurring office hours generating batches of draft slots.

**`createRecurrencePatterns`**
- Input: `startDate`, `numWeeks` (1-52), `location?`, `patterns[]` (`{dayOfWeek, startTime, endTime}`).
- Timezone-aware: `startDate` validated against Montreal midnight.
- `dayOfWeek` convention: 0=Monday, 6=Sunday (NOT JS `Date.getDay()` convention).
- Calls `weeklyOccurrenceDates()` to compute all occurrence dates.
- Skips any occurrence whose time has already passed.
- Checks for overlaps before each insert.
- All inserts in a single transaction; rolls back on any overlap.
- Returns `slotsGenerated` count.

**`deleteRecurrencePattern`**
- Reads all booked slots before deleting to build cancel mailto links.
- Deletes draft and active slots tied to pattern.
- Returns booked slots to `active` status, clears `booked_by`, nulls `recurrence_id`.
- Deletes the pattern record.

---

### `ownerBrowseController.js`
Public owner discovery for student-facing booking pages.

| Function | Returns |
|----------|---------|
| `listAllOwners` | All `is_owner=1` users with active slot count (including zero) |
| `listOwnersWithActiveSlots` | Only owners with >= 1 active future slot |
| `listOwnerActiveSlots` | All active future slots for a specific owner |
| `inviteByToken` | Owner info + active slots, looked up by `invite_token` UUID |

---

### `dashboardController.js`
Role-aware dashboard data and ICS calendar export.

**`getDashboard`**
- Determines role from DB.
- **Owner response:** all slots (all statuses), pending meeting requests, group polls in voting state with per-option vote counts, open team requests.
- **Student response:** own booked slots + group meeting slots where they are a participant, group meetings in voting/finalized state.

**`exportAppointmentsIcs`**
- Builds an iCal file using the `ical-generator` library.
- Anchors slot times to `America/Montreal` via `slotDateTimesInMontreal()`.
- Owner: all booked slots they own.
- Student: own bookings + group meeting slots where participant.
- Returns as a downloadable `.ics` attachment.

---

### `groupMeetingController.js`
Type 2 booking - group meeting polls with voting and finalization.

**`createGroupMeeting`**
- Owner provides: `title?`, `options[]` (`{date, startTime, endTime}`), `participantEmails[]`.
- All participant emails must be valid McGill emails.
- Deduplicates emails, filters out owner's own email.
- Fails if no valid participants remain.
- Inserts: `group_meetings`, `group_meeting_options`, `group_meeting_participants`.

**`voteOnGroupMeeting`**
- Accepts `optionIds[]` (participant's chosen times).
- Validates all option IDs belong to this meeting.
- Deletes old votes not in new list; inserts new votes (`INSERT IGNORE` handles idempotency).

**`finalizeGroupMeeting`**
- Owner picks `selectedOptionId`.
- Optional `isRecurring` + `recurWeeks` for recurring finalized meetings.
- Checks owner has no overlapping slots for each week.
- Inserts `booking_slots` (`status = 'booked'`, `slot_type = 'group_meeting'`) for each occurrence.
- Builds notifications for all participants.

**`cancelGroupMeeting`**
- Marks `group_meetings.status = 'cancelled'`.
- Deletes all associated `booking_slots`.
- Notifies participants if meeting was finalized.

---

### `teamRequestController.js`
TeamFinder - students post course teams and join others.

**`createTeamRequest`**
- Creates team + inserts creator as first member in one transaction.
- `is_open = TRUE` on creation.

**`joinTeamRequest`**
- `SELECT FOR UPDATE` prevents race condition double-join.
- Catches `ER_DUP_ENTRY` for already-a-member.
- Auto-closes team (`is_open = FALSE`) when `memberCount >= maxMembers`.

**`leaveTeamRequest`**
- Creator cannot leave (must delete instead).
- Reopens team if count drops below max after leaving.

**`removeTeamMember`**
- Creator-only action via `isResourceOwner`.
- Cannot remove creator.
- Reopens team if count drops below max.

---

## Utilities

### `slotTime.js`
Core time math used throughout the app.

| Function | Purpose |
|----------|---------|
| `normalizeTime(t)` | Converts any time string to `HH:MM:SS` |
| `timeToMinutes(t)` | `HH:MM:SS` -> minutes since midnight (for arithmetic) |
| `rangesOverlap(a1,a2,b1,b2)` | Half-open interval check: `a1 < b2 AND b1 < a2` |
| `slotStartsInFuture(date, time)` | Checks start > now in `America/Montreal` timezone |
| `isValidDateString(d)` | Validates `YYYY-MM-DD` format and calendar validity |

**Half-open interval:** Back-to-back slots (e.g. 9:00-10:00 and 10:00-11:00) do NOT overlap. The formula `a1 < b2 AND b1 < a2` handles this correctly.

### `slotOverlap.js`
Database-level overlap queries run inside transactions.

| Function | Purpose |
|----------|---------|
| `ownerHasOverlappingSlot(conn, ownerId, date, start, end, excludeId?)` | Checks all owner's slots on a date for time overlap; optional `excludeId` for reactivation |
| `userHasOverlappingBooking(conn, userId, date, start, end)` | Checks student's booked slots for same-day overlap |

Both use `SELECT FOR UPDATE` when called inside a transaction to prevent race conditions.

### `recurrenceDates.js`
- `dayOfWeek` stored as 0=Monday..6=Sunday (distinct from JS `Date.getDay()` where 0=Sunday).
- `firstOccurrenceOnOrAfter(startDate, dow)` - finds the first matching weekday on or after `startDate` using Luxon.
- `weeklyOccurrenceDates(startDate, dow, numWeeks)` - returns array of `YYYY-MM-DD` strings.

### `mcgillEmail.js`
- `isMcGillStudentEmail(email)` - `@mcgill.ca` OR `@mail.mcgill.ca`.
- `isOwnerEmail(email)` - ONLY `@mcgill.ca` (exact match; `mail.mcgill.ca` returns false).
- Used at registration to auto-assign `is_owner` flag; no admin action needed.

### `mailto.js`
- `buildMailtoUri(to, subject, body)` - builds RFC 6068 `mailto:addr?subject=...&body=...` URI.
- Used everywhere notifications are needed. No SMTP server required - clicking the link opens the user's mail client with pre-filled fields.

### `asyncHandler.js`
- Wraps async route handlers: `(req, res, next) => handler(req, res, next).catch(next)`.
- Forwards thrown errors to the global error handler without try/catch in every controller.

### `apiResponse.js`
- `sendOk(res, data, code, message)` - `{success: true, message, data}` with configurable status code (default 200).
- `sendCreated(res, data, message)` - always 201.

### `userPublic.js`
- `toPublicUser(row)` - maps DB user to API shape, explicitly excluding `password_hash`.

### `dateSlot.js`
- MySQL `DATE` columns return as JS `Date` at midnight UTC. `formatDateOnly()` uses `getUTC*` accessors to avoid timezone-shifted dates.

### `montrealSlot.js`
- `slotDateTimesInMontreal(dateStr, startTime, endTime)` - creates Luxon `DateTime` objects anchored to `America/Montreal` for ICS export.

---

## Database Schema & Migrations

### Migration System (`src/db/migrate.js`)
- Creates `schema_migrations` table on first run (tracks applied files by filename).
- Reads all `.sql` files from `migrations/`, sorts alphabetically.
- Skips already-applied files.
- Wraps each file in a transaction (all-or-nothing per migration).
- Run with: `npm run db:migrate`

---

### `001_bookings.sql`
Legacy table, not used by current application code.

---

### `002_users_and_sessions.sql`

**`users` table**
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| email | VARCHAR(255) UNIQUE | Lowercased on insert |
| password_hash | VARCHAR(255) | bcrypt 12 rounds |
| first_name, last_name | VARCHAR(100) | |
| is_owner | BOOLEAN DEFAULT FALSE | TRUE for @mcgill.ca emails |
| invite_token | VARCHAR(64) UNIQUE NULL | UUID, owners only |
| created_at, updated_at | TIMESTAMP | |

**`sessions` table** - express-mysql-session standard schema (session_id, expires, data).

---

### `003_recurrence_and_booking_slots.sql`

**`recurrence_patterns` table**
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| owner_id | INT FK users | CASCADE delete |
| day_of_week | TINYINT | 0=Mon..6=Sun |
| start_time, end_time | TIME | |
| start_date | DATE | |
| num_weeks | INT DEFAULT 1 | |

**`booking_slots` table** - central table used by all three booking types.
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| owner_id | INT FK users | |
| date | DATE | |
| start_time, end_time | TIME | |
| status | ENUM | 'draft', 'active', 'booked' |
| slot_type | ENUM | 'office_hours', 'meeting_request', 'group_meeting' |
| recurrence_id | INT FK NULL | Links to recurrence_patterns (SET NULL on delete) |
| group_meeting_id | INT FK NULL | Links to group_meetings (SET NULL on delete) |
| booked_by | INT FK NULL | Links to users (SET NULL on delete) |
| booked_at | TIMESTAMP NULL | |
| location | VARCHAR(255) NULL | Added in migration 007 |

Indexes: `(owner_id, date, status)`, `(booked_by)`, `(recurrence_id)`.

---

### `004_meeting_requests.sql`

**`meeting_requests` table** (Type 1 booking)
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| requester_id | INT FK users | Student |
| owner_id | INT FK users | Professor/TA |
| message | TEXT NULL | Optional message to prof |
| status | ENUM | 'pending', 'accepted', 'declined' |
| created_slot_id | INT FK NULL | Set when accepted; links to booking_slots |
| created_at | TIMESTAMP | |

---

### `005_group_meetings.sql`

**`group_meetings`** - the poll record
| Column | Type | Notes |
|--------|------|-------|
| status | ENUM | 'voting', 'finalized', 'cancelled' |
| is_recurring | BOOLEAN | Whether finalized slot repeats |
| recur_weeks | INT DEFAULT 1 | How many weeks to repeat |
| finalized_date/start/end | DATE/TIME NULL | Set when finalized |

**`group_meeting_options`** - proposed time slots for voting.

**`group_meeting_votes`** - `UNIQUE(option_id, user_id)` prevents double votes.

**`group_meeting_participants`** - invited users; `UNIQUE(group_meeting_id, user_id)`.

---

### `006_team_finder.sql`

**`team_requests`**
| Column | Notes |
|--------|-------|
| course_code | VARCHAR(20) - used for filtering |
| is_open | BOOLEAN - auto-managed based on member count |
| max_members | INT DEFAULT 4 |

**`team_members`** - `UNIQUE(team_request_id, user_id)` - prevents duplicate membership.

---

### `007_add_location_to_booking_slots.sql`
```sql
ALTER TABLE booking_slots ADD COLUMN location VARCHAR(255) NULL DEFAULT NULL;
```
Applied after deployment; must be run on any environment with the previous schema.

---

## Key Design Decisions

### 1. Three Distinct Booking Types
| Type | Flow | Table |
|------|------|-------|
| Type 1 - Meeting Request | Student requests -> Prof accepts with date/time/location | `meeting_requests` + `booking_slots` |
| Type 2 - Group Meeting | Prof proposes options -> Participants vote -> Prof finalizes | `group_meetings` + options/votes/participants + `booking_slots` |
| Type 3 - Recurring Office Hours | Prof creates weekly pattern -> Slots auto-generated as draft -> Prof bulk activates | `recurrence_patterns` + `booking_slots` |

### 2. Slot State Machine
```
draft -> active -> booked
  ^         |
  +---------+   (deactivate)
```
- `draft`: hidden from students, created by prof or auto-generated.
- `active`: visible and bookable by students.
- `booked`: reserved; cannot be activated/deactivated without cancellation.

### 3. Race Condition Prevention via `SELECT FOR UPDATE`
All critical state transitions (activate, book, accept request, join team) use row-level locks inside transactions. This prevents double-booking under concurrent requests.

### 4. No SMTP - Mailto URI Notifications
All notifications are `mailto:` links returned from the API. The frontend opens them, launching the user's mail client pre-filled with subject and body. Eliminates infrastructure dependency on an email server.

### 5. Role Assignment at Registration
`is_owner` is determined automatically from email domain at registration:
- `@mail.mcgill.ca` -> student (`is_owner = 0`)
- `@mcgill.ca` -> professor/TA (`is_owner = 1`)

No admin step needed. Invite tokens (UUIDs) are generated only for owners.

### 6. Half-Open Time Intervals
Overlap check: `a.start < b.end AND b.start < a.end`. Back-to-back slots (e.g. 9-10 and 10-11) are NOT considered overlapping, matching real-world scheduling expectations.

### 7. Timezone Handling
Slot times are stored as plain `DATE` + `TIME` (no timezone). The Montreal timezone is only applied when building ICS files for export. This keeps overlap math simple (pure string/minute comparison) while producing correct calendar files.

### 8. Team Auto-Close Logic
Teams automatically set `is_open = FALSE` when member count reaches `max_members`. They reopen if a member leaves. This keeps the browse list accurate without a separate cron job.

### 9. Session Security
- `sessionRegenerate()` on login/register prevents session fixation attacks.
- `httpOnly` + `sameSite: lax` cookies prevent XSS/CSRF.
- `rolling: true` keeps active users logged in without a fixed hard expiry.

### 10. Password Security
- bcrypt with 12 rounds.
- Login returns identical error message for "user not found" and "wrong password" to prevent user enumeration attacks.

---

## TA Demo Questions & Answers

### Authentication & Authorization

**Q: How does your system tell the difference between a student and a professor?**
A: Purely by email domain at registration. `isOwnerEmail()` in `mcgillEmail.js` checks if the domain is exactly `@mcgill.ca`. If so, `is_owner = 1` is stored in the users table. Students register with `@mail.mcgill.ca` and get `is_owner = 0`. This runs automatically - no admin intervention needed.

**Q: What prevents a student from calling professor-only API endpoints?**
A: The `isOwner` middleware (in `auth.js`) runs a DB query on every protected route to confirm `is_owner = 1` for the current session. It's not just trusting the session - it re-checks the database. On top of that, `isResourceOwner` ensures the professor can only modify their own resources (not another professor's slots).

**Q: What happens if someone tries to call an API endpoint without logging in?**
A: `isAuthenticated` middleware returns 401 immediately if `req.session.userId` is absent. All non-public endpoints are behind this middleware.

**Q: How do you prevent session fixation attacks?**
A: We call `req.session.regenerate()` before writing `userId` to the session on both login and register. This generates a new session ID, invalidating any pre-login session the attacker may have planted.

**Q: Why does the login endpoint return the same error for wrong password vs. user not found?**
A: To prevent user enumeration. If we returned "user not found" for missing accounts, an attacker could probe which emails are registered. The identical error message "Invalid credentials" reveals nothing.

---

### Booking System

**Q: Walk me through what happens when a student books a slot.**
A:
1. Student calls `POST /api/slots/:id/book`.
2. `bookSlot` opens a MySQL transaction and acquires a `SELECT FOR UPDATE` lock on the slot row.
3. It checks: slot exists, is not expired, is `status = 'active'`, and the student is not the owner.
4. It fetches all the student's other bookings on the same calendar day and checks each for time overlap using `rangesOverlap()`.
5. If clear, it updates the slot: `status = 'booked'`, `booked_by = userId`, `booked_at = NOW()`.
6. Transaction commits. A `notifyOwnerMailto` link is returned for the student to click.

**Q: How do you prevent two students from booking the same slot simultaneously?**
A: The `SELECT FOR UPDATE` lock inside the transaction. The second request waits for the lock. When it acquires it, the slot is already `status = 'booked'`, so it returns a 409 conflict.

**Q: What are the three booking types and how do they differ?**
A:
- **Type 1 (Meeting Request):** Student submits a request with an optional message. Professor reviews it in their "Booking Requests" tab and accepts by entering a date, time, and location. Acceptance creates a `booking_slots` row directly as `booked`.
- **Type 2 (Group Meeting):** Professor proposes multiple time options and invites students by email. Students vote on preferred times. Professor finalizes by picking the winning option, which can optionally recur weekly.
- **Type 3 (Recurring Office Hours):** Professor creates a weekly pattern (day of week + time). The system auto-generates draft `booking_slots` for each week. Professor bulk-activates them so students can book.

**Q: What is the slot state machine?**
A: Three states - `draft` (hidden from students), `active` (bookable), `booked` (reserved). Transitions: draft -> active (activate), active -> draft (deactivate), active -> booked (student books). A booked slot cannot be deactivated directly - it must be cancelled first.

**Q: What is the `location` field and when is it set?**
A: For professor-created slots (office hours, meeting slots), location is entered at creation time. For meeting requests accepted by professors, location is required at acceptance time. It is stored in `booking_slots.location` and displayed in both the student and professor dashboards.

**Q: How does the invite URL feature work?**
A: Each professor gets a UUID `invite_token` at registration. The professor copies a URL (`book.html?invite=<token>`) from their dashboard. When a student visits it, `book.html` calls `GET /api/invite/:token`, which looks up the owner by token and returns only their active future slots. The endpoint requires authentication, so unauthenticated students are redirected to login first, then returned to the invite URL after logging in.

---

### Recurring Office Hours

**Q: How does your day-of-week convention work and why is it different from JavaScript?**
A: We store `day_of_week` as 0=Monday..6=Sunday (ISO-style). JavaScript's `Date.getDay()` uses 0=Sunday..6=Saturday. In `owner-book.html`, when we read `new Date(date).getDay()`, we send that value to the API which uses Luxon internally. Luxon's weekday is 1=Monday..7=Sunday, so our `recurrenceDates.js` adds 1 to convert before computing the first occurrence.

**Q: What happens if a recurring slot is already in the past when the pattern is generated?**
A: `slotStartsInFuture()` is called for each generated date. Any occurrence whose start time has already passed (in the Montreal timezone) is silently skipped. The response includes the actual `slotsGenerated` count so the professor sees how many were created.

**Q: What happens when a recurrence pattern is deleted?**
A: The system reads all `booked` slots tied to the pattern before deleting anything. It then deletes only draft and active slots. For booked slots, it resets them to `active` status (clearing `booked_by`/`booked_at`/`recurrence_id`) so students retain usable slots and are notified via mailto links. Finally, the pattern record is deleted.

---

### Group Meetings

**Q: How does voting work? Can a participant vote for multiple options?**
A: Yes, participants can vote for multiple time options (multi-select). The vote endpoint accepts an `optionIds` array. The logic deletes old votes NOT in the new array and inserts votes for options in the new array using `INSERT IGNORE` (handles the case where a vote already exists for an option). This makes the operation idempotent.

**Q: How does the system prevent someone who is not a participant from voting?**
A: The `isGroupMeetingParticipant` middleware queries `group_meeting_participants` for the combination of `group_meeting_id` and the session `userId`. If not found, it returns 403 before the handler runs.

**Q: Can a group meeting recur?**
A: Yes. When finalizing, the professor can set `isRecurring: true` and `recurWeeks: N`. The system creates N separate `booking_slots` rows (one per week) by adding weeks to the finalized date using Luxon's `.plus({weeks: i})`. Each occurrence is checked for overlaps before insertion.

---

### Data Integrity

**Q: How do you prevent a student from double-booking conflicting time slots?**
A: In `bookSlot`, after locking the target slot, we fetch all the student's existing `booked` slots on the same calendar day. We then call `rangesOverlap()` on each. If any overlap is found, we return a 422 before committing.

**Q: What happens if a professor's slot overlaps with an existing slot when they try to create it?**
A: `ownerHasOverlappingSlot()` queries the DB for any of the professor's slots on the same date whose time range intersects the new slot. This runs inside a transaction. If an overlap is found, the transaction rolls back and a 422 is returned. This applies at creation, activation, and when accepting a meeting request.

**Q: How do you handle the case where two professors try to activate the same slot concurrently?**
A: The `activateSlot` handler uses `SELECT FOR UPDATE` to lock the slot row. The overlap check runs after acquiring the lock, inside the transaction. The second concurrent activation will wait, then check the (now updated) state and either fail with a conflict or succeed if conditions changed.

---

### TeamFinder

**Q: How does team auto-close work?**
A: After every join, the handler counts current members. If `count >= max_members`, it sets `is_open = FALSE` on the team. The list endpoint filters by `is_open = TRUE`, so full teams disappear from browse. When a member leaves, if `count - 1 < max_members`, the team is set back to `is_open = TRUE`.

**Q: How do you prevent two students from simultaneously joining the last open spot?**
A: `joinTeamRequest` uses `SELECT FOR UPDATE` on the team row. The second request waits for the first to commit. At that point, the member count has increased, and if it now reaches max, the second student receives a 409 "Team is full" response.

**Q: Can the creator leave their own team?**
A: No. `leaveTeamRequest` explicitly checks if `userId === team.creator_id` and returns a 400 instructing them to delete the team instead.

---

### Security & Edge Cases

**Q: How is the password stored?**
A: Hashed with bcrypt at 12 rounds. The raw password never touches the database. `toPublicUser()` strips `password_hash` before any API response.

**Q: What stops a student from submitting a request to themselves?**
A: `createMeetingRequest` compares `ownerId !== req.session.userId`. If equal, it returns 422 "Cannot send a request to yourself."

**Q: What stops an owner from booking their own slot?**
A: `bookSlot` checks `slot.owner_id === userId` and returns 403 "Cannot book your own slot."

**Q: What does the migration system do if a migration was already applied?**
A: It reads the `schema_migrations` table and compares filenames. Already-applied migrations are skipped entirely. Only new (unapplied) files are run. This makes `npm run db:migrate` safe to run multiple times.

**Q: Why do slots not store timezone information?**
A: By design. All users are McGill students/professors assumed to be in Montreal. Storing plain `DATE + TIME` keeps overlap math simple (pure minute arithmetic, no DST edge cases). The Montreal timezone is only applied at ICS export time via Luxon, where it matters for calendar clients.

**Q: How does the system handle the case where a group meeting's finalized slot overlaps with an existing slot?**
A: `finalizeGroupMeeting` calls `ownerHasOverlappingSlot()` for each recurring week before inserting. If any week overlaps, the transaction rolls back and a 422 is returned specifying which date caused the conflict.
