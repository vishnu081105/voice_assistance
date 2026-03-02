# Doctor AI Assistant - SQLite Migration

This implementation keeps the existing frontend UI/routes/components and replaces Supabase with:
- SQLite database at `database/app.db`
- Prisma ORM
- Express backend APIs
- JWT + bcrypt + session middleware auth
- Local file uploads in `server/uploads`

## Updated Project Structure

```text
voice_assistance/
  database/
    app.db                # auto-created
  prisma/
    schema.prisma
    migrations/
      20260302190000_init_sqlite/
        migration.sql
  server/
    index.js
    config.js
    uploads/
      .gitkeep
    middleware/
      auth.js
      asyncHandler.js
      errorHandler.js
      session.js
      validation.js
    lib/
      db.js
      authSession.js
      repositories/
        usersRepository.js
        reportsRepository.js
        templatesRepository.js
        settingsRepository.js
    routes/
      authRoutes.js
      reportsRoutes.js
      templatesRoutes.js
      settingsRoutes.js
      usersRoutes.js
      storageRoutes.js
      aiRoutes.js
  src/
    ... existing UI/components/routes ...
    lib/
      apiClient.ts
      authClient.ts
      db.ts
```

## Prisma Schema (`prisma/schema.prisma`)

- `User` model replaces Supabase auth+profile coupling
- `Report`, `Template`, `Setting` map existing table/field names used by UI
- Relations and indexes preserved

## Migration Script

Migration SQL:
- `prisma/migrations/20260302190000_init_sqlite/migration.sql`

Run migration:
```bash
npm run prisma:migrate
```

## Auth Replacement

Endpoints:
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/update-password`

Implementation details:
- Password hashing via `bcryptjs`
- JWT via `jsonwebtoken`
- Session middleware via `express-session`
- Auth state persisted in frontend localStorage session object

## Data Access Layer

All DB access is routed through:
- `server/lib/db.js` (Prisma client)
- `server/lib/repositories/*` (query handlers)

Routes call repositories; no direct Prisma usage in route handlers.

## API Handlers Used by Existing Frontend

- Reports: `/api/reports`
- Templates: `/api/templates`
- Settings: `/api/settings`
- Users: `/api/users`
- Storage upload: `/api/storage/recordings`
- AI-compatible routes: `/functions/v1/*` (whisper/process/generate)

## Example Environment Variables

`.env`
```env
PORT=4000
CLIENT_ORIGIN=http://localhost:8080
JWT_SECRET=replace-this-jwt-secret
SESSION_SECRET=replace-this-session-secret
VITE_API_BASE_URL=http://localhost:4000
LOVABLE_API_KEY=
```

## Step-by-Step Migration Summary

1. Added Prisma schema and SQLite migration.
2. Added Express backend with JWT + session + bcrypt auth.
3. Added repository layer for users/reports/templates/settings.
4. Replaced frontend Supabase data/auth calls with API-backed clients (`apiClient.ts`, `authClient.ts`, `db.ts`).
5. Replaced Supabase storage upload with local multer upload.
6. Replaced Supabase function URLs with local `/functions/v1/*` endpoints.
7. Removed Supabase SDK/integration files and env variables.

## Run Locally

```bash
npm install
npm run server
npm run dev
```

- Backend: `http://localhost:4000`
- Frontend: `http://localhost:8080`

