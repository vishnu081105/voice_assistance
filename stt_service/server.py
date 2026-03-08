import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

try:
    from .transcriber import FasterWhisperLocalTranscriber, NoSpeechDetectedError
except ImportError:  # pragma: no cover - runtime import path differs when executed directly
    from transcriber import FasterWhisperLocalTranscriber, NoSpeechDetectedError


def _parse_positive_int(value, default):
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default
    return parsed if parsed > 0 else default


MAX_UPLOAD_SIZE_MB = _parse_positive_int(os.getenv("STT_MAX_UPLOAD_MB", "100"), 100)
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
PORT = _parse_positive_int(os.getenv("STT_PORT", "9000"), 9000)
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm"}
ALLOWED_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/vnd.wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/webm",
    "video/webm",
}
LOCALHOST_HOSTS = {"127.0.0.1", "::1", "localhost"}

transcriber = FasterWhisperLocalTranscriber()


def _transcribe_with_retry(audio_path, language):
    last_error = None
    for _attempt in range(2):
        try:
            return transcriber.transcribe(audio_path, language=language)
        except NoSpeechDetectedError:
            raise
        except Exception as exc:  # pragma: no cover - depends on runtime model behavior
            last_error = exc

    if last_error:
        raise last_error

    raise RuntimeError("Local Faster-Whisper transcription failed.")


def _normalize_mime_type(value):
    normalized = str(value or "").split(";")[0].strip().lower()
    if normalized == "audio/mp3":
        return "audio/mpeg"
    if normalized == "audio/x-m4a":
        return "audio/m4a"
    if normalized == "video/webm":
        return "audio/webm"
    return normalized


def _validate_upload(audio):
    file_name = str(audio.filename or "audio.wav").strip()
    extension = Path(file_name).suffix.lower()
    content_type = _normalize_mime_type(audio.content_type)

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail={
                "code": "UNSUPPORTED_FORMAT",
                "message": "Unsupported audio format. Allowed formats: WAV, MP3, M4A, WEBM.",
            },
        )

    if content_type and content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail={
                "code": "UNSUPPORTED_FORMAT",
                "message": "Unsupported audio MIME type.",
            },
        )


@asynccontextmanager
async def lifespan(_app):
    transcriber.load()
    yield


app = FastAPI(title="Local Faster-Whisper STT", lifespan=lifespan)


@app.get("/health")
@app.get("/stt/health")
async def health():
    payload = transcriber.health()
    return JSONResponse(status_code=200 if payload["ok"] else 503, content=payload)


@app.post("/transcribe")
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form("auto"),
):
    client_host = str(getattr(request.client, "host", "") or "")
    if client_host and client_host not in LOCALHOST_HOSTS:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "LOCALHOST_ONLY",
                "message": "The STT service only accepts localhost requests.",
            },
        )

    if not transcriber.ready:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "MODEL_NOT_READY",
                "message": "Faster-Whisper model is not ready.",
            },
        )

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": f"Audio file exceeds the {MAX_UPLOAD_SIZE_MB}MB limit.",
            },
        )

    _validate_upload(audio)
    file_bytes = await audio.read()

    if not file_bytes:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "EMPTY_AUDIO_FILE",
                "message": "Audio file is empty.",
            },
        )

    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": f"Audio file exceeds the {MAX_UPLOAD_SIZE_MB}MB limit.",
            },
        )

    suffix = Path(audio.filename or "audio.wav").suffix.lower() or ".wav"
    temp_fd, temp_path = tempfile.mkstemp(prefix="faster-whisper-", suffix=suffix)

    try:
        with os.fdopen(temp_fd, "wb") as temp_file:
            temp_file.write(file_bytes)

        return _transcribe_with_retry(temp_path, language=language)
    except NoSpeechDetectedError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "NO_SPEECH_DETECTED",
                "message": str(exc),
            },
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "STT_RUNTIME_ERROR",
                "message": str(exc) or "Local Faster-Whisper transcription failed.",
            },
        ) from exc
    finally:
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
