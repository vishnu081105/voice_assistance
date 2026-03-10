import logging
import math
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from queue import Queue
from typing import List, Optional

from faster_whisper import WhisperModel
from pydub import AudioSegment

try:
    import ctranslate2
except Exception:  # pragma: no cover - optional runtime dependency
    ctranslate2 = None

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


def _parse_positive_float(value, default):
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default
    return parsed if parsed > 0 else default


def _parse_bool(value, default=False):
    if value in {None, ""}:
        return default
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _normalize_language(value: Optional[str]) -> Optional[str]:
    normalized = str(value or "auto").strip().lower()
    if normalized in {"", "auto"}:
        return None
    return normalized


def _clamp_unit_interval(value, default=0.0):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(numeric):
        return default
    return max(0.0, min(1.0, numeric))


def _detect_default_worker_count(device: str) -> int:
    cpu_count = os.cpu_count() or 1
    if device.lower() != "cpu":
        return 1
    return max(1, min(4, cpu_count))


def _cuda_available() -> bool:
    if ctranslate2 is None:
        return False
    try:
        return int(ctranslate2.get_cuda_device_count()) > 0
    except Exception:
        return False


def _normalize_for_comparison(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", str(text or "").lower())).strip()


FALSE_SILENCE_TOKEN_PATTERN = re.compile(
    r"(?:<\|[^>]*(?:nospeech|silence|noise)[^>]*\|>|\[(?:silence|noise|music|inaudible|unintelligible)\]|\((?:silence|noise|music|inaudible|unintelligible)\))",
    re.IGNORECASE,
)
WORD_CLEAN_PATTERN = re.compile(r"^[^\w]+|[^\w]+$")


@dataclass
class WorkerSlot:
    index: int
    model: WhisperModel


class NoSpeechDetectedError(RuntimeError):
    """Raised when the uploaded audio does not contain detectable speech."""


class FasterWhisperLocalTranscriber:
    def __init__(self):
        self.requested_device = str(os.getenv("WHISPER_DEVICE", "auto")).strip() or "auto"
        self.requested_compute_type = str(os.getenv("WHISPER_COMPUTE_TYPE", "auto")).strip() or "auto"
        self.model_name = self._resolve_model_name()
        self.beam_size = _parse_positive_int(os.getenv("WHISPER_BEAM_SIZE", "5"), 5)
        self.best_of = _parse_positive_int(os.getenv("WHISPER_BEST_OF", "5"), 5)
        self.temperature = _parse_positive_float(os.getenv("WHISPER_TEMPERATURE", "0"), 0.0)
        self.word_timestamps = _parse_bool(os.getenv("WHISPER_WORD_TIMESTAMPS", "true"), True)
        self.target_chunk_duration_ms = _parse_positive_int(
            os.getenv("STT_TARGET_CHUNK_SECONDS", "30"), 30
        ) * 1000
        self.min_chunk_duration_ms = _parse_positive_int(
            os.getenv("STT_MIN_CHUNK_SECONDS", "20"), 20
        ) * 1000
        self.max_chunk_duration_ms = _parse_positive_int(
            os.getenv("STT_MAX_CHUNK_SECONDS", "40"), 40
        ) * 1000
        self.separator_ms = _parse_positive_int(os.getenv("STT_CHUNK_SEPARATOR_MS", "120"), 120)
        self.segment_confidence_threshold = _parse_positive_float(
            os.getenv("TRANSCRIPT_CONFIDENCE_THRESHOLD", "0.45"), 0.45
        )
        self.language_lock_threshold = _parse_positive_float(
            os.getenv("STT_LANGUAGE_LOCK_THRESHOLD", "0.65"), 0.65
        )
        self.ffmpeg_bin = str(os.getenv("FFMPEG_PATH", "ffmpeg")).strip() or "ffmpeg"
        self.audio_noise_reduction_enabled = _parse_bool(
            os.getenv("AUDIO_NOISE_REDUCTION_ENABLED", "true"), True
        )
        self.audio_noise_reduction_filter = str(
            os.getenv(
                "AUDIO_NOISE_REDUCTION_FILTER",
                "highpass=f=120,lowpass=f=3800,afftdn=nf=-20",
            )
            or ""
        ).strip()
        self.audio_volume_normalization_enabled = _parse_bool(
            os.getenv("AUDIO_VOLUME_NORMALIZATION_ENABLED", "true"), True
        )
        self.audio_volume_normalization_filter = str(
            os.getenv(
                "AUDIO_VOLUME_NORMALIZATION_FILTER",
                "dynaudnorm=f=150:g=15:p=0.9:m=100:s=12",
            )
            or ""
        ).strip()
        self.edge_word_probability_threshold = _parse_positive_float(
            os.getenv("STT_EDGE_WORD_PROBABILITY_THRESHOLD", "0.35"), 0.35
        )
        self.word_probability_threshold = _parse_positive_float(
            os.getenv("STT_WORD_PROBABILITY_THRESHOLD", "0.22"), 0.22
        )
        self.short_segment_confidence_threshold = _parse_positive_float(
            os.getenv("STT_SHORT_SEGMENT_CONFIDENCE_THRESHOLD", "0.18"), 0.18
        )
        self.max_word_density = _parse_positive_float(
            os.getenv("STT_MAX_WORDS_PER_SECOND", "5.8"), 5.8
        )
        self.debug_metrics = _parse_bool(os.getenv("STT_DEBUG_METRICS", "false"), False)
        preferred_device = self._preferred_device()
        self.worker_count = _parse_positive_int(
            os.getenv("STT_WORKER_COUNT", _detect_default_worker_count(preferred_device)),
            _detect_default_worker_count(preferred_device),
        )

        self.executor: Optional[ThreadPoolExecutor] = None
        self.worker_slots: Queue = Queue()
        self.vad = SileroVoiceActivityDetector()
        self.ready = False
        self.last_error = None
        self.active_device = None
        self.active_compute_type = None

    def _preferred_device(self) -> str:
        requested = self.requested_device.lower()
        if requested == "auto":
            return "cuda" if _cuda_available() else "cpu"
        return requested

    def _resolve_model_name(self) -> str:
        requested_model = str(os.getenv("WHISPER_MODEL", "auto")).strip().lower()
        if requested_model and requested_model != "auto":
            return requested_model
        return "medium" if _cuda_available() else "small"

    def _resolve_compute_type(self, device: str) -> str:
        requested = self.requested_compute_type.lower()
        if requested and requested != "auto":
            return requested
        if device == "cuda":
            return "float16"
        return "int8"

    def _candidate_configurations(self):
        requested_device = self.requested_device.lower()

        if requested_device == "auto":
            if _cuda_available():
                return [
                    ("cuda", self._resolve_compute_type("cuda")),
                    ("cuda", "int8_float16"),
                    ("cpu", "int8"),
                ]
            return [("cpu", self._resolve_compute_type("cpu")), ("cpu", "int8")]

        if requested_device == "cpu":
            return [(requested_device, self._resolve_compute_type("cpu")), ("cpu", "int8")]

        if requested_device == "cuda":
            return [
                ("cuda", self._resolve_compute_type("cuda")),
                ("cuda", "int8_float16"),
                ("cpu", "int8"),
            ]

        return [
            (requested_device, self._resolve_compute_type(requested_device)),
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
            "device": self.active_device or self._preferred_device(),
            "compute_type": self.active_compute_type or self._resolve_compute_type(self._preferred_device()),
            "worker_count": self.worker_count if self.active_device == "cpu" else 1,
            "chunk_target_seconds": int(self.target_chunk_duration_ms / 1000),
            "chunk_min_seconds": int(self.min_chunk_duration_ms / 1000),
            "chunk_max_seconds": int(self.max_chunk_duration_ms / 1000),
            "beam_size": self.beam_size,
            "best_of": self.best_of,
            "temperature": self.temperature,
            "word_timestamps": self.word_timestamps,
            "vad": self.vad.health(),
            "last_error": self.last_error,
        }

    def _build_audio_filter_chain(self) -> str:
        filters = []
        if self.audio_noise_reduction_enabled and self.audio_noise_reduction_filter:
            filters.append(self.audio_noise_reduction_filter)
        if self.audio_volume_normalization_enabled and self.audio_volume_normalization_filter:
            filters.append(self.audio_volume_normalization_filter)
        return ",".join(filter(None, filters))

    def _normalize_audio_with_ffmpeg(self, input_path: str, output_path: str):
        command = [
            self.ffmpeg_bin,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input_path,
            "-vn",
            "-sn",
            "-dn",
            "-map_metadata",
            "-1",
        ]

        audio_filter = self._build_audio_filter_chain()
        if audio_filter:
            command.extend(["-af", audio_filter])

        command.extend(
            [
                "-ac",
                "1",
                "-ar",
                "16000",
                "-sample_fmt",
                "s16",
                "-acodec",
                "pcm_s16le",
                output_path,
            ]
        )

        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError((completed.stderr or completed.stdout or "ffmpeg normalization failed").strip())

    def _load_normalized_audio(self, input_path: str, output_path: str) -> AudioSegment:
        try:
            self._normalize_audio_with_ffmpeg(input_path, output_path)
            return AudioSegment.from_file(output_path, format="wav")
        except Exception as exc:
            logging.warning("Audio normalization fallback triggered: %s", exc)
            fallback_audio = (
                AudioSegment.from_file(input_path)
                .set_channels(1)
                .set_frame_rate(16000)
                .set_sample_width(2)
            )
            fallback_audio.export(output_path, format="wav")
            return fallback_audio

    def transcribe(self, audio_path: str, language: str = "auto"):
        if not self.ready or not self.executor:
            raise RuntimeError("Faster-Whisper model is not ready.")

        with tempfile.TemporaryDirectory(prefix="fw-prep-") as preparation_dir:
            normalized_audio_path = os.path.join(preparation_dir, "normalized-16k-mono.wav")
            normalized_audio = self._load_normalized_audio(audio_path, normalized_audio_path)

        audio_duration_seconds = round(len(normalized_audio) / 1000.0, 3)
        if len(normalized_audio) <= 0:
            return {
                "transcript": "",
                "text": "",
                "segments": [],
                "language": _normalize_language(language) or "en",
                "duration": audio_duration_seconds,
                "partial": False,
                "confidence": 0.0,
            }

        speech_intervals = self.vad.detect(normalized_audio)
        if not speech_intervals:
            raise NoSpeechDetectedError(
                "Speech detection failed. No speech was detected in the uploaded audio."
            )

        chunk_plan = build_chunk_plan(
            speech_intervals,
            target_chunk_ms=self.target_chunk_duration_ms,
            min_chunk_ms=self.min_chunk_duration_ms,
            max_chunk_ms=self.max_chunk_duration_ms,
        )
        if not chunk_plan:
            chunk_plan = [[SpeechInterval(start_ms=0, end_ms=len(normalized_audio))]]

        speech_duration_seconds = round(
            sum(interval.duration_ms for interval in speech_intervals) / 1000.0,
            3,
        )
        partial = False
        completed_chunks = []
        failures = []
        locked_language = _normalize_language(language)
        detected_language = locked_language or "en"

        with tempfile.TemporaryDirectory(prefix="fw-stt-") as temp_dir:
            chunk_jobs = []
            for chunk_index, intervals in enumerate(chunk_plan):
                compacted = self._build_compact_chunk(normalized_audio, intervals)
                chunk_path = os.path.join(temp_dir, f"chunk-{chunk_index:03d}.wav")
                compacted["audio"].export(chunk_path, format="wav")
                chunk_jobs.append(
                    {
                        "chunk_index": chunk_index,
                        "chunk_path": chunk_path,
                        "mapping": compacted["mapping"],
                        "speech_duration_ms": compacted["speech_duration_ms"],
                        "audio_duration_ms": len(compacted["audio"]),
                    }
                )

            if chunk_jobs:
                first_job = chunk_jobs[0]
                try:
                    first_result = self._transcribe_chunk(
                        first_job["chunk_path"],
                        first_job["chunk_index"],
                        first_job["mapping"],
                        locked_language or language,
                        speech_duration_ms=first_job["speech_duration_ms"],
                        audio_duration_ms=first_job["audio_duration_ms"],
                    )
                    if first_result["segments"]:
                        completed_chunks.append(first_result)
                    detected_language = first_result.get("language") or detected_language
                    if not locked_language:
                        locked_language = self._lock_language(first_result)
                except Exception as exc:
                    failures.append(str(exc))
                    logging.warning("Local STT first chunk failed: %s", exc)

                futures = []
                for job in chunk_jobs[1:]:
                    futures.append(
                        self.executor.submit(
                            self._transcribe_chunk,
                            job["chunk_path"],
                            job["chunk_index"],
                            job["mapping"],
                            locked_language or language,
                            job["speech_duration_ms"],
                            job["audio_duration_ms"],
                        )
                    )

                for future in as_completed(futures):
                    try:
                        result = future.result()
                        if result["segments"]:
                            completed_chunks.append(result)
                        if result.get("language"):
                            detected_language = result["language"]
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

        merged_segments = self._finalize_segments(merged_segments)
        text = " ".join(segment["text"] for segment in merged_segments if segment["text"]).strip()
        overall_confidence = self._compute_chunk_confidence(merged_segments)

        if self.debug_metrics:
            logging.info(
                "stt.metrics audio_duration=%.3fs speech_duration=%.3fs chunks=%d segments=%d overall_confidence=%.4f",
                audio_duration_seconds,
                speech_duration_seconds,
                len(chunk_plan),
                len(merged_segments),
                overall_confidence,
            )

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
            "language": detected_language or (_normalize_language(language) or "en"),
            "duration": audio_duration_seconds,
            "partial": partial,
            "confidence": round(overall_confidence, 4),
        }

    def _lock_language(self, chunk_result) -> Optional[str]:
        candidate = str(chunk_result.get("language") or "").strip().lower()
        if not candidate:
            return None

        probability = float(chunk_result.get("language_probability") or 0.0)
        confidence = float(chunk_result.get("confidence") or 0.0)
        if probability >= self.language_lock_threshold or confidence >= max(
            self.segment_confidence_threshold, 0.55
        ):
            return candidate
        return None

    def _build_compact_chunk(self, audio: AudioSegment, intervals: List[SpeechInterval]):
        compact_audio = AudioSegment.silent(duration=0, frame_rate=audio.frame_rate)
        mapping = []
        compact_cursor_ms = 0
        speech_duration_ms = 0

        for index, interval in enumerate(intervals):
            excerpt = audio[interval.start_ms : interval.end_ms]
            excerpt_duration_ms = len(excerpt)
            if excerpt_duration_ms <= 0:
                continue

            if index > 0 and self.separator_ms > 0:
                compact_audio += AudioSegment.silent(duration=self.separator_ms, frame_rate=audio.frame_rate)
                compact_cursor_ms += self.separator_ms

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
            speech_duration_ms += excerpt_duration_ms

        if len(compact_audio) == 0:
            compact_audio = audio[intervals[0].start_ms : intervals[-1].end_ms]
            speech_duration_ms = len(compact_audio)
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
            "speech_duration_ms": speech_duration_ms,
        }

    def _transcribe_chunk(
        self,
        chunk_path: str,
        chunk_index: int,
        mapping,
        language: str,
        speech_duration_ms: int = 0,
        audio_duration_ms: int = 0,
    ):
        slot = self.worker_slots.get()
        try:
            attempts = [
                {
                    "beam_size": self.beam_size,
                    "best_of": self.best_of,
                    "temperature": self.temperature,
                },
                {
                    "beam_size": max(self.beam_size, 8),
                    "best_of": max(self.best_of, 8),
                    "temperature": self.temperature,
                },
            ]
            best_result = None

            for attempt_index, params in enumerate(attempts, start=1):
                segments, info = slot.model.transcribe(
                    chunk_path,
                    language=_normalize_language(language),
                    beam_size=params["beam_size"],
                    best_of=params["best_of"],
                    temperature=params["temperature"],
                    word_timestamps=self.word_timestamps,
                    condition_on_previous_text=False,
                    vad_filter=False,
                )

                result_segments = []
                for segment in segments:
                    avg_logprob = float(getattr(segment, "avg_logprob", -1.0) or -1.0)
                    no_speech_prob = float(getattr(segment, "no_speech_prob", 0.0) or 0.0)
                    compression_ratio = float(getattr(segment, "compression_ratio", 1.0) or 1.0)
                    base_confidence = self._compute_segment_confidence(
                        avg_logprob=avg_logprob,
                        no_speech_prob=no_speech_prob,
                        compression_ratio=compression_ratio,
                    )
                    extracted_words = self._extract_words(segment, mapping)
                    words = self._trim_low_confidence_words(extracted_words, base_confidence)
                    if extracted_words and not words:
                        continue
                    text, mapped_start_ms, mapped_end_ms = self._build_segment_from_words(
                        segment=segment,
                        mapping=mapping,
                        words=words,
                    )
                    if not text:
                        continue

                    word_probability = self._compute_word_probability(words)
                    segment_confidence = self._compute_segment_confidence(
                        avg_logprob=avg_logprob,
                        no_speech_prob=no_speech_prob,
                        compression_ratio=compression_ratio,
                        word_probability=word_probability,
                    )
                    if self._should_suppress_segment(
                        text=text,
                        start_ms=mapped_start_ms,
                        end_ms=mapped_end_ms,
                        confidence=segment_confidence,
                        avg_logprob=avg_logprob,
                        no_speech_prob=no_speech_prob,
                        compression_ratio=compression_ratio,
                        word_count=len(words) if words else len(extracted_words),
                    ):
                        continue

                    result_segments.append(
                        {
                            "start": round(mapped_start_ms / 1000.0, 3),
                            "end": round(mapped_end_ms / 1000.0, 3),
                            "text": text,
                            "confidence": segment_confidence,
                        }
                    )

                finalized_segments = self._finalize_segments(result_segments)
                chunk_confidence = self._compute_chunk_confidence(finalized_segments)
                language_name = str(
                    getattr(info, "language", _normalize_language(language) or "en") or "en"
                ).strip()
                language_probability = float(getattr(info, "language_probability", 0.0) or 0.0)

                result = {
                    "chunk_index": chunk_index,
                    "language": language_name,
                    "language_probability": language_probability,
                    "segments": finalized_segments,
                    "confidence": round(chunk_confidence, 4),
                    "speech_duration_seconds": round(speech_duration_ms / 1000.0, 3),
                    "audio_duration_seconds": round(audio_duration_ms / 1000.0, 3),
                    "attempts": attempt_index,
                }

                if best_result is None or result["confidence"] >= best_result["confidence"]:
                    best_result = result

                if self.debug_metrics:
                    logging.info(
                        "stt.chunk chunk=%d attempt=%d speech_duration=%.3fs audio_duration=%.3fs segments=%d confidence=%.4f language=%s",
                        chunk_index + 1,
                        attempt_index,
                        result["speech_duration_seconds"],
                        result["audio_duration_seconds"],
                        len(finalized_segments),
                        result["confidence"],
                        language_name,
                    )

                if result["confidence"] >= self.segment_confidence_threshold or attempt_index == len(attempts):
                    break

            return best_result or {
                "chunk_index": chunk_index,
                "language": _normalize_language(language) or "en",
                "language_probability": 0.0,
                "segments": [],
                "confidence": 0.0,
                "speech_duration_seconds": round(speech_duration_ms / 1000.0, 3),
                "audio_duration_seconds": round(audio_duration_ms / 1000.0, 3),
                "attempts": 0,
            }
        finally:
            self.worker_slots.put(slot)

    def _compute_segment_confidence(
        self,
        avg_logprob: float = -1.0,
        no_speech_prob: float = 0.0,
        compression_ratio: float = 1.0,
        word_probability: Optional[float] = None,
    ) -> float:
        logprob_score = min(1.0, max(0.0, math.exp(min(0.0, avg_logprob) * 0.85)))
        speech_score = min(1.0, max(0.0, 1.0 - max(0.0, no_speech_prob)))

        safe_compression_ratio = max(0.0, compression_ratio)
        if safe_compression_ratio <= 1.35:
            compression_score = 1.0
        elif safe_compression_ratio >= 2.4:
            compression_score = 0.25
        else:
            compression_score = max(
                0.25,
                1.0 - ((safe_compression_ratio - 1.35) / (2.4 - 1.35)) * 0.75,
            )

        word_score = logprob_score if word_probability is None else _clamp_unit_interval(word_probability, logprob_score)
        return round(
            0.4 * logprob_score + 0.25 * speech_score + 0.15 * compression_score + 0.2 * word_score,
            4,
        )

    def _compute_chunk_confidence(self, segments) -> float:
        if not segments:
            return 0.0

        weighted_score = 0.0
        total_weight = 0.0
        for segment in segments:
            duration = max(0.25, float(segment["end"]) - float(segment["start"]))
            weighted_score += float(segment.get("confidence", 0.0)) * duration
            total_weight += duration

        if total_weight <= 0:
            return 0.0
        return weighted_score / total_weight

    def _clean_segment_text(self, text: str) -> str:
        next_text = FALSE_SILENCE_TOKEN_PATTERN.sub(" ", str(text or ""))
        next_text = re.sub(r"\s+", " ", next_text).strip()
        if not next_text:
            return ""

        deduped_tokens = []
        previous_normalized = ""
        for token in next_text.split():
            normalized = WORD_CLEAN_PATTERN.sub("", token).lower()
            if normalized and normalized == previous_normalized and len(normalized) > 2:
                continue
            deduped_tokens.append(token)
            previous_normalized = normalized

        normalized_text = self._dedupe_repeated_phrases(" ".join(deduped_tokens))
        normalized_text = re.sub(r"\s+([,.;!?])", r"\1", normalized_text)
        normalized_text = re.sub(r"([,.;!?]){2,}", r"\1", normalized_text)
        normalized_text = re.sub(r"([,.;!?])(?=[^\s,.;!?])", r"\1 ", normalized_text)
        normalized_text = re.sub(r"\s{2,}", " ", normalized_text).strip()
        if normalized_text and normalized_text[-1].isalnum():
            normalized_text = f"{normalized_text}."
        return normalized_text

    def _dedupe_repeated_phrases(self, text: str) -> str:
        words, normalized_words = self._tokenize_words(text)
        if len(words) < 4:
            return text

        changed = True
        while changed:
            changed = False
            max_window = min(8, len(words) // 2)
            for window_size in range(max_window, 1, -1):
                rebuilt_words = []
                index = 0
                while index < len(words):
                    left_start = index
                    left_end = index + window_size
                    right_end = left_end + window_size
                    if (
                        right_end <= len(words)
                        and normalized_words[left_start:left_end]
                        and normalized_words[left_start:left_end] == normalized_words[left_end:right_end]
                    ):
                        rebuilt_words.extend(words[left_start:left_end])
                        index = right_end
                        changed = True
                        continue

                    rebuilt_words.append(words[index])
                    index += 1

                if changed:
                    words = rebuilt_words
                    normalized_words = [WORD_CLEAN_PATTERN.sub("", word).lower() for word in words]
                    break

        return " ".join(words)

    def _tokenize_words(self, text: str):
        words = str(text or "").split()
        normalized_words = [WORD_CLEAN_PATTERN.sub("", word).lower() for word in words]
        return words, normalized_words

    def _extract_words(self, segment, mapping):
        extracted = []
        for word in list(getattr(segment, "words", None) or []):
            word_text = str(getattr(word, "word", "") or "")
            normalized = WORD_CLEAN_PATTERN.sub("", word_text).lower()
            if not word_text.strip():
                continue

            start_seconds = getattr(word, "start", None)
            end_seconds = getattr(word, "end", None)
            if start_seconds is None or end_seconds is None:
                continue

            start_ms = self._map_compact_ms_to_original(float(start_seconds) * 1000.0, mapping)
            end_ms = self._map_compact_ms_to_original(float(end_seconds) * 1000.0, mapping)
            if end_ms <= start_ms:
                end_ms = start_ms + 120.0

            extracted.append(
                {
                    "text": word_text,
                    "normalized": normalized,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "probability": _clamp_unit_interval(getattr(word, "probability", None), None),
                }
            )

        return extracted

    def _trim_low_confidence_words(self, words, base_confidence: float):
        if len(words) <= 1:
            return list(words)

        retained = list(words)
        aggressive = base_confidence < self.segment_confidence_threshold

        while len(retained) > 1 and self._is_low_confidence_edge_word(retained[0], aggressive):
            retained.pop(0)

        while len(retained) > 1 and self._is_low_confidence_edge_word(retained[-1], aggressive):
            retained.pop()

        while (
            aggressive
            and len(retained) > 2
            and self._compute_word_density(retained) > self.max_word_density
            and self._is_low_confidence_edge_word(retained[-1], True)
        ):
            retained.pop()

        return retained

    def _is_low_confidence_edge_word(self, word, aggressive: bool) -> bool:
        probability = word.get("probability")
        normalized = str(word.get("normalized") or "")
        if probability is None:
            return False

        threshold = self.edge_word_probability_threshold if aggressive else max(
            self.word_probability_threshold, self.edge_word_probability_threshold - 0.08
        )
        if probability >= threshold:
            return False

        return len(normalized) > 2

    def _build_segment_from_words(self, segment, mapping, words):
        if words:
            text = self._clean_segment_text("".join(word["text"] for word in words).strip())
            start_ms = float(words[0]["start_ms"])
            end_ms = float(words[-1]["end_ms"])
            if text:
                return text, start_ms, max(end_ms, start_ms + 120.0)

        text = self._clean_segment_text(str(getattr(segment, "text", "") or ""))
        if not text:
            return "", 0.0, 0.0

        start_ms = self._map_compact_ms_to_original(float(getattr(segment, "start", 0.0) or 0.0) * 1000.0, mapping)
        end_ms = self._map_compact_ms_to_original(float(getattr(segment, "end", 0.0) or 0.0) * 1000.0, mapping)
        if end_ms <= start_ms:
            end_ms = start_ms + 250.0
        return text, start_ms, end_ms

    def _compute_word_probability(self, words) -> Optional[float]:
        probabilities = [word["probability"] for word in words if word.get("probability") is not None]
        if not probabilities:
            return None
        return sum(probabilities) / len(probabilities)

    def _compute_word_density(self, words) -> float:
        if not words:
            return 0.0

        start_ms = float(words[0]["start_ms"])
        end_ms = float(words[-1]["end_ms"])
        duration_seconds = max(0.15, (end_ms - start_ms) / 1000.0)
        return len([word for word in words if word.get("normalized")]) / duration_seconds

    def _should_suppress_segment(
        self,
        text: str,
        start_ms: float,
        end_ms: float,
        confidence: float,
        avg_logprob: float,
        no_speech_prob: float,
        compression_ratio: float,
        word_count: int,
    ) -> bool:
        normalized_text = _normalize_for_comparison(text)
        if not normalized_text:
            return True

        duration_seconds = max(0.0, (float(end_ms) - float(start_ms)) / 1000.0)
        inferred_word_count = word_count if word_count > 0 else len(normalized_text.split())
        word_density = inferred_word_count / max(0.15, duration_seconds)

        if no_speech_prob >= 0.72 and confidence < self.segment_confidence_threshold:
            return True
        if (
            confidence < self.short_segment_confidence_threshold
            and duration_seconds <= 1.2
            and inferred_word_count <= 3
        ):
            return True
        if (
            avg_logprob <= -1.4
            and compression_ratio >= 2.35
            and confidence < self.segment_confidence_threshold
        ):
            return True
        if word_density > self.max_word_density and confidence < self.segment_confidence_threshold:
            return True

        return False

    def _trim_overlap(self, previous_text: str, current_text: str) -> str:
        previous_words, previous_normalized = self._tokenize_words(previous_text)
        current_words, current_normalized = self._tokenize_words(current_text)
        if not previous_words or not current_words:
            return current_text

        max_overlap = min(8, len(previous_words), len(current_words))
        overlap_length = 0
        for size in range(max_overlap, 1, -1):
            if previous_normalized[-size:] == current_normalized[:size]:
                overlap_length = size
                break

        if overlap_length <= 0:
            return current_text

        trimmed_words = current_words[overlap_length:]
        return " ".join(trimmed_words).strip()

    def _finalize_segments(self, segments):
        ordered = sorted(
            (
                {
                    "start": round(float(segment["start"]), 3),
                    "end": round(max(float(segment["end"]), float(segment["start"]) + 0.1), 3),
                    "text": self._clean_segment_text(segment.get("text", "")),
                    "confidence": float(segment.get("confidence", 0.0)),
                }
                for segment in segments
            ),
            key=lambda item: (item["start"], item["end"]),
        )

        finalized = []
        for segment in ordered:
            if not segment["text"]:
                continue

            if finalized:
                previous = finalized[-1]
                trimmed_text = self._trim_overlap(previous["text"], segment["text"])
                if trimmed_text:
                    segment["text"] = self._clean_segment_text(trimmed_text)

                if not segment["text"]:
                    previous["end"] = max(previous["end"], segment["end"])
                    previous["confidence"] = max(previous["confidence"], segment["confidence"])
                    continue

                if _normalize_for_comparison(previous["text"]) == _normalize_for_comparison(segment["text"]):
                    previous["end"] = max(previous["end"], segment["end"])
                    previous["confidence"] = max(previous["confidence"], segment["confidence"])
                    continue

            finalized.append(segment)

        return finalized

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
