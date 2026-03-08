try:
    from .transcriber import FasterWhisperLocalTranscriber
except ImportError:  # pragma: no cover - runtime import path differs when executed directly
    from transcriber import FasterWhisperLocalTranscriber


class FasterWhisperTranscriptionWorker(FasterWhisperLocalTranscriber):
    """Backward-compatible alias for older imports."""
