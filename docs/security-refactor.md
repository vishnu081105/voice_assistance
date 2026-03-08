# Security Refactor Migration Notes

## Summary

The backend has been consolidated to a single production pipeline:

Frontend -> Express API -> transcriptionQueue -> localhost Faster-Whisper STT -> Silero VAD -> chunking -> parallel worker pool -> transcriptCleaningService -> medicalAnalysisService -> medicalReportGenerator

External STT providers, Supabase STT functions, alternate AI pipelines, public upload access, and bearer-token-only auth have been removed from the active runtime path.

## Architecture Changes

### Active routes

- `POST /api/transcribe`
- `POST /api/process-transcript`
- `POST /api/generate-report`
- `POST /api/storage/recordings`
- `GET /api/audio/:id`
- `POST /api/medical/audio-upload`
- `GET /api/medical/status/:id`
- `GET /api/medical/transcript/:id`
- `GET /api/medical/transcript/:id/stream`
- `GET /api/medical/report/:id`
- `GET /stt/health`

### Removed from the active request path

- Supabase edge-function routing (`/functions/v1/*`)
- Public static `/uploads/*` access
- LocalStorage bearer token requirement for API requests
- Deepgram, OpenAI Whisper API, Web Speech API, and legacy alternate STT/report pipelines

## Security Features Added

- AES-256-GCM encryption at rest for transcripts, generated reports, and stored report audio
- Private authenticated audio download route (`/api/audio/:id`)
- Signed `httpOnly` auth cookies
- Helmet security headers
- IP-based rate limiting for auth, AI, and medical upload endpoints
- Zod request validation for auth, patient, report, and AI APIs
- Winston request/error logging
- Audit logging in `AuditLog`
- User role support (`doctor`, `admin`, `staff`)

## Database Changes

### `User`

- Added `role`

### `Report`

- Added `audio_storage_path`
- Added `audio_mime_type`
- Existing `transcription`, `report_content`, and `generated_report` are now encrypted before persistence

### `MedicalAudioSession`

Tracks uploaded medical audio jobs and their private encrypted artifacts.

### `AuditLog`

Tracks login/logout, report access, patient access, and sensitive workflow events.

## Environment Variables

Required:

- `JWT_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `STT_SERVICE_URL`
- `WHISPER_MODEL`
- `WHISPER_DEVICE`
- `WHISPER_COMPUTE_TYPE`

Important optional settings:

- `PORT`
- `CLIENT_ORIGIN`
- `VITE_API_BASE_URL`
- `MEDICAL_AUDIO_MAX_SIZE_MB`
- `RATE_LIMIT_MAX_REQUESTS`
- `COOKIE_SECURE`
- `TRUST_PROXY`

Use `.env.example` as the reference template.

## File Storage Model

Sensitive artifacts are now written to `server/private/` and returned only through authenticated routes.

Stored privately:

- report audio
- uploaded medical audio
- medical transcripts
- medical report JSON
- medical report HTML

Legacy public upload URLs are still readable through authenticated fallback logic for backward compatibility.

## Authentication Model

- Login sets a signed `httpOnly` cookie
- Frontend sends `credentials: include`
- Authenticated APIs still accept bearer tokens as a compatibility fallback, but the frontend no longer depends on them

## Frontend Compatibility Notes

The React frontend was updated to call:

- `/api/transcribe`
- `/api/process-transcript`
- `/api/generate-report`

No user-facing workflow was removed.

## Deployment Steps

1. Install Node dependencies: `npm install`
2. Generate Prisma client: `npm run prisma:generate`
3. Apply schema SQL: `npm run prisma:migrate`
4. Install Python STT dependencies: `python -m pip install -r stt_service/requirements.txt`
5. Start local Faster-Whisper: `npm run stt:server`
6. Start API: `npm run server`
7. Start frontend: `npm run dev`

## Verification Performed

- `npm install`
- `npm run prisma:generate`
- `npm run lint` (passes with warnings only)
- `npm run build`
- `node --check server/index.js`
- `node --check server/routes/aiRoutes.js`
- `node --check server/routes/medicalRoutes.js`
- `node --check server/routes/audioRoutes.js`

## Remaining Warnings

`npm run lint` still reports warning-only issues in some existing UI files, mostly React Fast Refresh export warnings and hook dependency warnings. There are no remaining lint errors.

## Architecture Diagram

```text
[React SPA]
    |
    | cookie-authenticated HTTPS requests
    v
[Express API]
    |
    +--> /api/transcribe ----------> transcriptionQueue ---> Faster-Whisper ---> transcriptCleaningService
    |
    +--> /api/process-transcript --> enhancementService
    |
    +--> /api/generate-report -----> medicalAnalysisService -> medicalReportGenerator -> Prisma
    |
    +--> /api/medical/audio-upload -> encrypted private storage -> queue worker
                                            |
                                            v
                                   transcriptionQueue
                                            |
                                            v
                           Silero VAD -> chunking -> Faster-Whisper worker pool
                                            |
                                            v
                              transcriptCleaningService
                                            |
                                            v
                               medicalAnalysisService
                                            |
                                            v
                                medicalReportGenerator
                                            |
                                            v
                          encrypted report/transcript storage
                                            |
                                            +--> SSE status/transcript stream
                                            +--> authenticated downloads
```

## Legacy Module Notes

Some legacy directories could not be physically deleted because the workspace is under OneDrive reparse points with delete restrictions. Their contents were neutralized in place and they are no longer referenced by the application runtime.
