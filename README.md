# KMCH Hospital Voice Recording System

This repository keeps the existing React frontend and Express API contracts while running speech-to-text locally through Faster-Whisper and generating structured medical reports through Gemini with encrypted storage.

## Active STT Architecture

```text
React Frontend
  -> Express API
  -> transcriptionQueue
  -> localhost FastAPI STT service
  -> Silero VAD
  -> compact speech chunking
  -> parallel Faster-Whisper worker pool
  -> Faster-Whisper
  -> transcriptCleaningService
  -> medicalAnalysisService
  -> Gemini report generation with deterministic fallback
  -> medicalReportGenerator
```

## Project Structure

```text
voice_assistance/
  server/
    routes/
    middleware/
    services/
    lib/repositories/
  stt_service/
    server.py
    vad.py
    transcriber.py
    requirements.txt
  src/
    ... existing UI/components/routes ...
  prisma/
    schema.prisma
```

## Runtime Services

- `npm run server`: Express API on `http://localhost:4000`
- `npm run dev`: Vite frontend on `http://localhost:8080`
- `npm run stt:server`: localhost Faster-Whisper service on `http://127.0.0.1:9000`

## Environment Variables

Node and frontend:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:8080
VITE_API_BASE_URL=http://localhost:4000
JWT_SECRET=replace-with-a-long-random-secret
SESSION_SECRET=replace-with-a-long-random-cookie-secret
ENCRYPTION_KEY=replace-with-a-long-random-encryption-secret
STT_SERVICE_URL=http://127.0.0.1:9000
STT_AUTO_START=true
STT_STARTUP_TIMEOUT_MS=45000
PYTHON_BIN=python
STT_TIMEOUT_MS=300000
STT_MAX_CONCURRENT_JOBS=1
STT_MAX_QUEUE_SIZE=16
STT_RETRY_DELAYS_MS=1000,3000,5000
STT_CHUNK_DURATION_SECONDS=45
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
GEMINI_TIMEOUT_MS=45000
GEMINI_RETRY_DELAYS_MS=1000,3000
MEDICAL_AUDIO_MAX_SIZE_MB=50
RATE_LIMIT_MAX_REQUESTS=100
COOKIE_SECURE=false
TRUST_PROXY=false
```

Python STT service:

```env
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
STT_WORKER_COUNT=4
STT_PORT=9000
STT_MAX_UPLOAD_MB=100
```

## Local Setup

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
python -m pip install -r stt_service/requirements.txt
npm run stt:server
npm run server
npm run dev
```

## Reliability Features

- Local-only Faster-Whisper with CPU-optimized defaults and automatic device fallback
- Silero VAD removes silence before transcription
- Parallel chunk processing inside the STT microservice
- Queue-backed STT requests with bounded concurrency
- Automatic STT retries after 1s, 3s, and 5s
- Timeout protection for STT jobs
- Chunked WAV processing for long medical uploads
- SSE transcript updates preserved on `/api/medical/transcript/:id/stream`
- Backend health endpoint on `/stt/health`
- Gemini-backed report generation with fallback to deterministic local report assembly
- Encrypted audio/transcript/report storage and audit logging for protected access
- PDF, DOCX, and text report export from the saved report view
