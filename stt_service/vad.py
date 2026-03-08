import logging
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

import numpy as np
from pydub import AudioSegment

VENDOR_SITE_PACKAGES = Path(__file__).resolve().parent / "_vendor" / "silero_vad_5_1_2"
if VENDOR_SITE_PACKAGES.exists():
    sys.path.insert(0, str(VENDOR_SITE_PACKAGES))

try:
    from silero_vad import get_speech_timestamps, load_silero_vad, read_audio

    SILERO_AVAILABLE = True
except Exception:  # pragma: no cover - import availability depends on runtime deps
    get_speech_timestamps = None
    load_silero_vad = None
    read_audio = None
    SILERO_AVAILABLE = False


def _parse_positive_int(value, default):
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default
    return parsed if parsed > 0 else default


def _parse_float(value, default):
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default
    return parsed if parsed > 0 else default


def audio_segment_to_float32_array(audio_segment: AudioSegment) -> np.ndarray:
    samples = np.array(audio_segment.get_array_of_samples(), dtype=np.float32)
    if samples.size == 0:
        return np.zeros(0, dtype=np.float32)

    scale = float(1 << (8 * audio_segment.sample_width - 1))
    if scale <= 0:
        return samples

    return np.clip(samples / scale, -1.0, 1.0)


@dataclass(frozen=True)
class SpeechInterval:
    start_ms: int
    end_ms: int

    @property
    def duration_ms(self) -> int:
        return max(0, self.end_ms - self.start_ms)


class SileroVoiceActivityDetector:
    def __init__(self):
        self.sample_rate = _parse_positive_int(os.getenv("STT_SAMPLE_RATE", "16000"), 16000)
        self.threshold = _parse_float(os.getenv("STT_VAD_THRESHOLD", "0.5"), 0.5)
        self.min_silence_duration_ms = _parse_positive_int(
            os.getenv("STT_VAD_MIN_SILENCE_MS", "250"), 250
        )
        self.speech_pad_ms = _parse_positive_int(os.getenv("STT_VAD_SPEECH_PAD_MS", "150"), 150)
        self.min_speech_duration_ms = _parse_positive_int(
            os.getenv("STT_VAD_MIN_SPEECH_MS", "150"), 150
        )
        self.model = None
        self.enabled = SILERO_AVAILABLE
        self.last_error = None

    def load(self):
        if not SILERO_AVAILABLE:
            self.enabled = False
            self.last_error = "silero-vad package is unavailable"
            return self

        try:
            self.model = load_silero_vad()
            self.enabled = True
            self.last_error = None
        except Exception as exc:  # pragma: no cover - depends on local python runtime
            self.model = None
            self.enabled = False
            self.last_error = str(exc)

        return self

    def health(self):
        return {
            "enabled": self.enabled and self.model is not None,
            "sample_rate": self.sample_rate,
            "threshold": self.threshold,
            "min_silence_duration_ms": self.min_silence_duration_ms,
            "speech_pad_ms": self.speech_pad_ms,
            "min_speech_duration_ms": self.min_speech_duration_ms,
            "last_error": self.last_error,
        }

    def detect(self, normalized_audio: AudioSegment) -> List[SpeechInterval]:
        duration_ms = len(normalized_audio)
        if duration_ms <= 0:
            return []

        if not self.enabled or self.model is None:
            return self._fallback_intervals(normalized_audio)

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_path = temp_file.name
            normalized_audio.export(temp_path, format="wav")
            waveform = read_audio(temp_path, sampling_rate=self.sample_rate)
            timestamps = get_speech_timestamps(
                waveform,
                self.model,
                sampling_rate=self.sample_rate,
                threshold=self.threshold,
                min_silence_duration_ms=self.min_silence_duration_ms,
                min_speech_duration_ms=self.min_speech_duration_ms,
                speech_pad_ms=self.speech_pad_ms,
            )
        except Exception as exc:  # pragma: no cover - runtime dependency behavior
            logging.warning("Silero VAD failed, falling back to full-audio chunking: %s", exc)
            self.last_error = str(exc)
            return self._fallback_intervals(normalized_audio)
        finally:
            if temp_path:
                try:
                    os.remove(temp_path)
                except FileNotFoundError:
                    pass

        intervals = []
        for timestamp in timestamps or []:
            start_ms = int((int(timestamp.get("start", 0)) / self.sample_rate) * 1000)
            end_ms = int((int(timestamp.get("end", 0)) / self.sample_rate) * 1000)
            if end_ms <= start_ms:
                continue
            intervals.append(
                SpeechInterval(
                    start_ms=max(0, start_ms),
                    end_ms=min(duration_ms, end_ms),
                )
            )

        merged = merge_intervals(intervals, max_gap_ms=self.speech_pad_ms)
        if merged:
            return merged

        return self._fallback_intervals(normalized_audio)

    def _fallback_intervals(self, normalized_audio: AudioSegment) -> List[SpeechInterval]:
        samples = audio_segment_to_float32_array(normalized_audio)
        if samples.size == 0:
            return []

        peak = float(np.max(np.abs(samples))) if samples.size > 0 else 0.0
        if peak < 0.001:
            return []

        return [SpeechInterval(start_ms=0, end_ms=len(normalized_audio))]


def merge_intervals(intervals: Iterable[SpeechInterval], max_gap_ms: int = 150) -> List[SpeechInterval]:
    ordered = sorted(
        [
            SpeechInterval(start_ms=max(0, int(interval.start_ms)), end_ms=max(0, int(interval.end_ms)))
            for interval in intervals
            if int(interval.end_ms) > int(interval.start_ms)
        ],
        key=lambda interval: interval.start_ms,
    )
    if not ordered:
        return []

    merged = [ordered[0]]
    for interval in ordered[1:]:
        previous = merged[-1]
        if interval.start_ms <= previous.end_ms + max_gap_ms:
            merged[-1] = SpeechInterval(
                start_ms=previous.start_ms,
                end_ms=max(previous.end_ms, interval.end_ms),
            )
            continue
        merged.append(interval)

    return merged


def build_chunk_plan(intervals: Iterable[SpeechInterval], target_chunk_ms: int) -> List[List[SpeechInterval]]:
    safe_target_chunk_ms = max(30000, min(60000, int(target_chunk_ms or 45000)))
    chunks: List[List[SpeechInterval]] = []
    current_chunk: List[SpeechInterval] = []
    current_duration_ms = 0

    for interval in intervals:
        interval_duration_ms = interval.duration_ms
        if current_chunk and current_duration_ms + interval_duration_ms > safe_target_chunk_ms:
            chunks.append(current_chunk)
            current_chunk = []
            current_duration_ms = 0

        current_chunk.append(interval)
        current_duration_ms += interval_duration_ms

    if current_chunk:
        chunks.append(current_chunk)

    return chunks
