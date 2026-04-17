# McGill Bookings API

University appointment booking backend built with **Express.js** and **MySQL** (`mysql2/promise`).

## Setup

```bash
cp .env.example .env
# Edit .env: DB_* credentials, SESSION_SECRET

# Create database in MySQL, e.g.:
# CREATE DATABASE mcgill_bookings CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

npm install
npm run db:migrate
npm run dev
```

## Scripts

| Script        | Description                    |
|---------------|--------------------------------|
| `npm run dev` | Nodemon + `src/server.js`      |
| `npm start`   | Production `node src/server.js`|
| `npm run db:migrate` | Run pending SQL in `src/db/migrations/` |

## Environment (dotenv)

| Variable         | Description              |
|------------------|--------------------------|
| `DB_HOST`        | MySQL host               |
| `DB_USER`        | MySQL user               |
| `DB_PASS`        | MySQL password           |
| `DB_NAME`        | Database name            |
| `DB_PORT`        | MySQL port (default 3306)|
| `SESSION_SECRET` | Secret for signed cookies|
| `PORT`           | HTTP port (default 3000) |
| `NODE_ENV`       | e.g. `development`       |

## API

| Method | Path                 | Description        |
|--------|----------------------|--------------------|
| GET    | `/api/health`        | Health + DB ping   |
| GET    | `/api/bookings`      | List (paginated)   |
| GET    | `/api/bookings/:id`  | Get one            |
| POST   | `/api/bookings`      | Create             |
| PUT    | `/api/bookings/:id`  | Replace            |
| DELETE | `/api/bookings/:id`  | Delete             |

### Create booking (JSON)

```json
{
  "student_email": "student@mail.mcgill.ca",
  "title": "Office hours",
  "description": "COMP 307 questions",
  "appointment_at": "2026-04-15T14:00:00.000Z",
  "duration_minutes": 30,
  "status": "pending"
}
```

Query: `GET /api/bookings?page=1&limit=20`

## Project layout

```
src/
├── config/
│   ├── db.js       # mysql2 connection pool
│   └── env.js      # Centralized env
├── db/
│   ├── migrate.js
│   └── migrations/
├── controllers/
├── middleware/    # errorHandler, validate
├── routes/
├── utils/
├── app.js
└── server.js
```
