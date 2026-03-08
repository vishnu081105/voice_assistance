import logging
import math
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from queue import Queue
from typing import List, Optional

from faster_whisper import WhisperModel
from pydub import AudioSegment

try:
    from .vad import SpeechInterval, SileroVoiceActivityDetector, build_chunk_plan
except ImportError:  # pragma: no cover - runtime import path differs when executed directly
    from vad import SpeechInterval, SileroVoiceActivityDetector, build_chunk_plan


def _parse_positive_int(value, default):
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default
    return parsed if parsed > 0 else default


def _normalize_language(value: Optional[str]) -> Optional[str]:
    normalized = str(value or "auto").strip().lower()
    if normalized in {"", "auto"}:
        return None
    return normalized


def _detect_default_worker_count(device: str) -> int:
    cpu_count = os.cpu_count() or 1
    if device.lower() != "cpu":
        return 1
    return max(1, min(4, cpu_count))


@dataclass
class WorkerSlot:
    index: int
    model: WhisperModel


class NoSpeechDetectedError(RuntimeError):
    """Raised when the uploaded audio does not contain detectable speech."""


class FasterWhisperLocalTranscriber:
    def __init__(self):
        self.model_name = str(os.getenv("WHISPER_MODEL", "small")).strip() or "small"
        self.requested_device = str(os.getenv("WHISPER_DEVICE", "cpu")).strip() or "cpu"
        self.requested_compute_type = (
            str(os.getenv("WHISPER_COMPUTE_TYPE", "int8")).strip() or "int8"
        )
        self.beam_size = _parse_positive_int(os.getenv("WHISPER_BEAM_SIZE", "3"), 3)
        self.chunk_duration_ms = _parse_positive_int(
            os.getenv("STT_CHUNK_DURATION_SECONDS", "45"), 45
        ) * 1000
        self.worker_count = _parse_positive_int(
            os.getenv("STT_WORKER_COUNT", _detect_default_worker_count(self.requested_device)),
            _detect_default_worker_count(self.requested_device),
        )

        self.executor: Optional[ThreadPoolExecutor] = None
        self.worker_slots: Queue = Queue()
        self.vad = SileroVoiceActivityDetector()
        self.ready = False
        self.last_error = None
        self.active_device = None
        self.active_compute_type = None

    def _candidate_configurations(self):
        requested_device = self.requested_device.lower()
        requested_compute_type = self.requested_compute_type

        if requested_device == "cpu":
            return [("cpu", requested_compute_type), ("cpu", "int8")]

        if requested_device == "cuda":
            return [
                ("cuda", requested_compute_type),
                ("cuda", "int8_float16"),
                ("cpu", "int8"),
            ]

        return [
            (requested_device, requested_compute_type),
            ("cpu", "int8"),
        ]

    def load(self):
        self.vad.load()
        load_errors = []

        for device, compute_type in self._candidate_configurations():
            try:
                self._load_worker_pool(device, compute_type)
                self.active_device = device
                self.active_compute_type = compute_type
                self.last_error = None
                self.ready = True
                return self
            except Exception as exc:  # pragma: no cover - depends on runtime device availability
                load_errors.append(f"{device}/{compute_type}: {exc}")
                self._shutdown_pool()

        self.ready = False
        self.active_device = None
        self.active_compute_type = None
        self.last_error = " | ".join(load_errors) or "Unable to initialize Faster-Whisper."
        raise RuntimeError(self.last_error)

    def _load_worker_pool(self, device: str, compute_type: str):
        self._shutdown_pool()
        effective_worker_count = 1 if device.lower() != "cpu" else max(1, self.worker_count)
        self.executor = ThreadPoolExecutor(max_workers=effective_worker_count, thread_name_prefix="fw")
        self.worker_slots = Queue()

        for index in range(effective_worker_count):
            model = WhisperModel(self.model_name, device=device, compute_type=compute_type)
            self.worker_slots.put(WorkerSlot(index=index, model=model))

    def _shutdown_pool(self):
        if self.executor:
            try:
                self.executor.shutdown(wait=False, cancel_futures=True)
            except TypeError:  # pragma: no cover - older Python runtimes
                self.executor.shutdown(wait=False)
        self.executor = None
        self.worker_slots = Queue()

    def health(self):
        return {
            "ok": self.ready,
            "model": self.model_name,
            "device": self.active_device or self.requested_device,
            "compute_type": self.active_compute_type or self.requested_compute_type,
            "worker_count": self.worker_count if self.active_device == "cpu" else 1,
            "chunk_duration_seconds": int(self.chunk_duration_ms / 1000),
            "vad": self.vad.health(),
            "last_error": self.last_error,
        }

    def transcribe(self, audio_path: str, language: str = "auto"):
        if not self.ready or not self.executor:
            raise RuntimeError("Faster-Whisper model is not ready.")

        normalized_audio = (
            AudioSegment.from_file(audio_path)
            .set_channels(1)
            .set_frame_rate(16000)
            .set_sample_width(2)
        )
        if len(normalized_audio) <= 0:
            return {
                "transcript": "",
                "text": "",
                "segments": [],
                "language": _normalize_language(language) or "en",
                "duration": 0,
                "partial": False,
                "confidence": 0.0,
            }

        speech_intervals = self.vad.detect(normalized_audio)
        if not speech_intervals:
            raise NoSpeechDetectedError(
                "Speech detection failed. No speech was detected in the uploaded audio."
            )

        chunk_plan = build_chunk_plan(speech_intervals, self.chunk_duration_ms)
        if not chunk_plan:
            chunk_plan = [[SpeechInterval(start_ms=0, end_ms=len(normalized_audio))]]

        partial = False
        completed_chunks = []
        failures = []
        detected_languages = []
        confidence_scores = []

        with tempfile.TemporaryDirectory(prefix="fw-stt-") as temp_dir:
            futures = []
            for chunk_index, intervals in enumerate(chunk_plan):
                compacted = self._build_compact_chunk(normalized_audio, intervals)
                chunk_path = os.path.join(temp_dir, f"chunk-{chunk_index:03d}.wav")
                compacted["audio"].export(chunk_path, format="wav")
                futures.append(
                    self.executor.submit(
                        self._transcribe_chunk,
                        chunk_path,
                        chunk_index,
                        compacted["mapping"],
                        language,
                    )
                )

            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result["segments"]:
                        completed_chunks.append(result)
                    if result.get("confidence") is not None:
                        confidence_scores.append(float(result["confidence"]))
                    if result.get("language"):
                        detected_languages.append(result["language"])
                except Exception as exc:
                    failures.append(str(exc))
                    logging.warning("Local STT chunk failed: %s", exc)

        if failures and not completed_chunks:
            self.last_error = failures[-1]
            raise RuntimeError(self.last_error)

        if failures:
            partial = True

        merged_segments = []
        for chunk in sorted(completed_chunks, key=lambda item: item["chunk_index"]):
            merged_segments.extend(chunk["segments"])

        merged_segments.sort(key=lambda item: (item["start"], item["end"]))
        text = " ".join(segment["text"] for segment in merged_segments if segment["text"]).strip()
        duration = max((segment["end"] for segment in merged_segments), default=len(normalized_audio) / 1000.0)

        return {
            "transcript": text,
            "text": text,
            "segments": [
                {
                    "id": index,
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"],
                    "confidence": segment["confidence"],
                }
                for index, segment in enumerate(merged_segments)
            ],
            "language": detected_languages[0] if detected_languages else (_normalize_language(language) or "en"),
            "duration": duration,
            "partial": partial,
            "confidence": round(
                sum(confidence_scores) / len(confidence_scores), 4
            )
            if confidence_scores
            else 0.0,
        }

    def _build_compact_chunk(self, audio: AudioSegment, intervals: List[SpeechInterval]):
        compact_audio = AudioSegment.silent(duration=0, frame_rate=audio.frame_rate)
        mapping = []
        compact_cursor_ms = 0

        for interval in intervals:
            excerpt = audio[interval.start_ms : interval.end_ms]
            excerpt_duration_ms = len(excerpt)
            if excerpt_duration_ms <= 0:
                continue

            compact_audio += excerpt
            mapping.append(
                {
                    "compact_start_ms": compact_cursor_ms,
                    "compact_end_ms": compact_cursor_ms + excerpt_duration_ms,
                    "original_start_ms": interval.start_ms,
                    "original_end_ms": interval.end_ms,
                }
            )
            compact_cursor_ms += excerpt_duration_ms

        if len(compact_audio) == 0:
            compact_audio = audio[intervals[0].start_ms : intervals[-1].end_ms]
            mapping = [
                {
                    "compact_start_ms": 0,
                    "compact_end_ms": len(compact_audio),
                    "original_start_ms": intervals[0].start_ms,
                    "original_end_ms": intervals[-1].end_ms,
                }
            ]

        return {
            "audio": compact_audio.set_channels(1).set_frame_rate(16000).set_sample_width(2),
            "mapping": mapping,
        }

    def _transcribe_chunk(self, chunk_path: str, chunk_index: int, mapping, language: str):
        slot = self.worker_slots.get()
        try:
            segments, info = slot.model.transcribe(
                chunk_path,
                language=_normalize_language(language),
                beam_size=self.beam_size,
                condition_on_previous_text=False,
                vad_filter=False,
            )

            result_segments = []
            confidence_scores = []
            for segment in segments:
                text = str(getattr(segment, "text", "") or "").strip()
                if not text:
                    continue

                start_ms = float(getattr(segment, "start", 0.0) or 0.0) * 1000.0
                end_ms = float(getattr(segment, "end", 0.0) or 0.0) * 1000.0
                mapped_start_ms = self._map_compact_ms_to_original(start_ms, mapping)
                mapped_end_ms = self._map_compact_ms_to_original(end_ms, mapping)
                if mapped_end_ms <= mapped_start_ms:
                    mapped_end_ms = mapped_start_ms + max(250.0, end_ms - start_ms)

                avg_logprob = float(getattr(segment, "avg_logprob", -1.0) or -1.0)
                no_speech_prob = float(getattr(segment, "no_speech_prob", 0.0) or 0.0)
                logprob_confidence = min(1.0, max(0.0, math.exp(avg_logprob)))
                speech_confidence = min(1.0, max(0.0, 1.0 - no_speech_prob))
                segment_confidence = round((logprob_confidence + speech_confidence) / 2.0, 4)
                confidence_scores.append(segment_confidence)

                result_segments.append(
                    {
                        "start": round(mapped_start_ms / 1000.0, 3),
                        "end": round(mapped_end_ms / 1000.0, 3),
                        "text": text,
                        "confidence": segment_confidence,
                    }
                )

            return {
                "chunk_index": chunk_index,
                "language": str(getattr(info, "language", _normalize_language(language) or "en") or "en"),
                "segments": result_segments,
                "confidence": round(sum(confidence_scores) / len(confidence_scores), 4)
                if confidence_scores
                else 0.0,
            }
        finally:
            self.worker_slots.put(slot)

    def _map_compact_ms_to_original(self, compact_ms: float, mapping) -> float:
        if not mapping:
            return max(0.0, compact_ms)

        safe_compact_ms = max(0.0, float(compact_ms))
        for entry in mapping:
            compact_start_ms = float(entry["compact_start_ms"])
            compact_end_ms = float(entry["compact_end_ms"])
            if safe_compact_ms > compact_end_ms:
                continue

            original_start_ms = float(entry["original_start_ms"])
            original_end_ms = float(entry["original_end_ms"])
            compact_duration_ms = max(1.0, compact_end_ms - compact_start_ms)
            ratio = min(1.0, max(0.0, (safe_compact_ms - compact_start_ms) / compact_duration_ms))
            return original_start_ms + ratio * (original_end_ms - original_start_ms)

        return float(mapping[-1]["original_end_ms"])
