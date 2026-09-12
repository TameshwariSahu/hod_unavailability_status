# HOD Availability Management System

A React, Express, and PostgreSQL application for tracking HOD availability and internal scheduled meetings.

## Features

- Dashboard showing current and upcoming HOD unavailability.
- Availability calendar with per-day HOD and reason details.
- Scheduled Meetings page for creating daily internal HOD meetings with a title, date, time, and details.
- Green calendar labels for scheduled meetings, including their start time.
- Cancelled meetings remain visible and are shown with a crossed-out state.
- Department and HOD master-data management for administrators.
- Availability reports with Excel and PDF exports.
- Light and dark themes with responsive mobile navigation and layouts.

## Access Rules

The following pages are available without signing in:

- Dashboard
- Calendar
- Scheduled Meetings

Public users can view availability and meetings, and can create a scheduled meeting. Editing or cancelling a scheduled meeting requires sign-in. Department, HOD, user, and availability-status management remain protected.

## Project Structure

```text
vite-project/
  src/                 React application
  server/src/          Express API and middleware
  server/database/     PostgreSQL schema and migrations
```

## Run Locally

1. Create a PostgreSQL database named `hod_availability_db`.
2. Run `vite-project/server/database/schema.sql` while connected to that database.
3. Install and start the backend:

   ```bash
   cd vite-project/server
   npm install
   npm run dev
   ```

4. In a second terminal, install and start the frontend:

   ```bash
   cd vite-project
   npm install
   npm run dev
   ```

The frontend is served at `http://localhost:5173` by default.

## Database Tables

- `departments`: department master data.
- `hod_members`: HOD details and department assignment.
- `users`: sign-in accounts and roles.
- `hod_availability_status`: availability history records.
- `scheduled_meetings`: internal meetings, their status, timings, cancellation audit timestamp, and creator reference.

## Verification

Run the frontend production build with:

```bash
cd vite-project
npm run build
```
