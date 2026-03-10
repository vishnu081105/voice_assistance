import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

import numpy as np
from pydub import AudioSegment

VENDOR_SITE_PACKAGES = Path(__file__).resolve().parent / "_vendor" / "silero_vad_5_1_2"
if VENDOR_SITE_PACKAGES.exists():
    sys.path.insert(0, str(VENDOR_SITE_PACKAGES))

try:
    from silero_vad import get_speech_timestamps, load_silero_vad

    SILERO_AVAILABLE = True
except Exception:  # pragma: no cover - import availability depends on runtime deps
    get_speech_timestamps = None
    load_silero_vad = None
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
        self.speech_pad_ms = _parse_positive_int(os.getenv("STT_VAD_SPEECH_PAD_MS", "180"), 180)
        self.min_speech_duration_ms = _parse_positive_int(
            os.getenv("STT_VAD_MIN_SPEECH_MS", "150"), 150
        )
        self.min_fragment_duration_ms = _parse_positive_int(
            os.getenv("STT_VAD_MIN_FRAGMENT_MS", "350"), 350
        )
        self.fragment_merge_gap_ms = _parse_positive_int(
            os.getenv("STT_VAD_FRAGMENT_MERGE_GAP_MS", "450"), 450
        )
        self.short_fragment_window_ms = _parse_positive_int(
            os.getenv("STT_VAD_SHORT_FRAGMENT_WINDOW_MS", "1200"), 1200
        )
        self.min_short_fragment_peak_ratio = _parse_float(
            os.getenv("STT_VAD_MIN_SHORT_FRAGMENT_PEAK_RATIO", "0.02"), 0.02
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
            "min_fragment_duration_ms": self.min_fragment_duration_ms,
            "fragment_merge_gap_ms": self.fragment_merge_gap_ms,
            "short_fragment_window_ms": self.short_fragment_window_ms,
            "min_short_fragment_peak_ratio": self.min_short_fragment_peak_ratio,
            "last_error": self.last_error,
        }

    def detect(self, normalized_audio: AudioSegment) -> List[SpeechInterval]:
        duration_ms = len(normalized_audio)
        if duration_ms <= 0:
            return []

        if not self.enabled or self.model is None:
            return self._fallback_intervals(normalized_audio)

        try:
            waveform = audio_segment_to_float32_array(normalized_audio)
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

        merged = merge_intervals(
            intervals,
            max_gap_ms=max(self.speech_pad_ms, self.fragment_merge_gap_ms),
        )
        smoothed = merge_small_fragments(
            merged,
            min_fragment_ms=self.min_fragment_duration_ms,
            merge_gap_ms=self.fragment_merge_gap_ms,
            total_duration_ms=duration_ms,
        )
        filtered = filter_low_energy_fragments(
            normalized_audio,
            smoothed,
            short_fragment_window_ms=self.short_fragment_window_ms,
            min_peak_ratio=self.min_short_fragment_peak_ratio,
        )
        if filtered:
            return filtered
        if smoothed:
            return []

        return self._fallback_intervals(normalized_audio)

    def _fallback_intervals(self, normalized_audio: AudioSegment) -> List[SpeechInterval]:
        samples = audio_segment_to_float32_array(normalized_audio)
        if samples.size == 0:
            return []

        peak = float(np.max(np.abs(samples))) if samples.size > 0 else 0.0
        if peak < 0.001:
            return []

        return [SpeechInterval(start_ms=0, end_ms=len(normalized_audio))]


def merge_intervals(intervals: Iterable[SpeechInterval], max_gap_ms: int = 180) -> List[SpeechInterval]:
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


def merge_small_fragments(
    intervals: Iterable[SpeechInterval],
    min_fragment_ms: int = 350,
    merge_gap_ms: int = 450,
    total_duration_ms: int = 0,
) -> List[SpeechInterval]:
    ordered = list(intervals)
    if not ordered:
        return []

    merged: List[SpeechInterval] = []
    index = 0

    while index < len(ordered):
        current = ordered[index]
        if current.duration_ms >= min_fragment_ms or len(ordered) == 1:
            merged.append(current)
            index += 1
            continue

        previous = merged[-1] if merged else None
        next_interval = ordered[index + 1] if index + 1 < len(ordered) else None
        previous_gap = current.start_ms - previous.end_ms if previous else merge_gap_ms + 1
        next_gap = next_interval.start_ms - current.end_ms if next_interval else merge_gap_ms + 1

        if previous and previous_gap <= merge_gap_ms and (not next_interval or previous_gap <= next_gap):
            merged[-1] = SpeechInterval(start_ms=previous.start_ms, end_ms=current.end_ms)
            index += 1
            continue

        if next_interval and next_gap <= merge_gap_ms:
            ordered[index + 1] = SpeechInterval(start_ms=current.start_ms, end_ms=next_interval.end_ms)
            index += 1
            continue

        if previous:
            merged[-1] = SpeechInterval(start_ms=previous.start_ms, end_ms=current.end_ms)
        elif total_duration_ms > 0:
            merged.append(
                SpeechInterval(
                    start_ms=max(0, current.start_ms - min_fragment_ms),
                    end_ms=min(total_duration_ms, current.end_ms + min_fragment_ms),
                )
            )
        else:
            merged.append(current)
        index += 1

    return merge_intervals(merged, max_gap_ms=merge_gap_ms)


def filter_low_energy_fragments(
    audio: AudioSegment,
    intervals: Iterable[SpeechInterval],
    short_fragment_window_ms: int = 1200,
    min_peak_ratio: float = 0.02,
) -> List[SpeechInterval]:
    ordered = list(intervals)
    if not ordered:
        return []

    samples = audio_segment_to_float32_array(audio)
    global_peak = float(np.max(np.abs(samples))) if samples.size > 0 else 0.0
    if global_peak <= 0:
        return ordered

    kept = []
    for interval in ordered:
        if interval.duration_ms <= 0:
            continue
        if interval.duration_ms > short_fragment_window_ms:
            kept.append(interval)
            continue

        excerpt = audio[interval.start_ms : interval.end_ms]
        excerpt_samples = audio_segment_to_float32_array(excerpt)
        excerpt_peak = float(np.max(np.abs(excerpt_samples))) if excerpt_samples.size > 0 else 0.0
        excerpt_rms = float(np.sqrt(np.mean(np.square(excerpt_samples)))) if excerpt_samples.size > 0 else 0.0
        if excerpt_peak < global_peak * min_peak_ratio and excerpt_rms < global_peak * (min_peak_ratio / 2.0):
            continue

        kept.append(interval)

    return kept


def split_long_interval(interval: SpeechInterval, max_duration_ms: int, overlap_ms: int = 250) -> List[SpeechInterval]:
    if interval.duration_ms <= max_duration_ms:
        return [interval]

    safe_overlap_ms = max(0, min(overlap_ms, max_duration_ms // 4))
    parts = []
    cursor_ms = interval.start_ms

    while cursor_ms < interval.end_ms:
        end_ms = min(interval.end_ms, cursor_ms + max_duration_ms)
        parts.append(SpeechInterval(start_ms=cursor_ms, end_ms=end_ms))
        if end_ms >= interval.end_ms:
            break
        cursor_ms = max(cursor_ms + 1, end_ms - safe_overlap_ms)

    return parts


def chunk_speech_duration_ms(chunk: Iterable[SpeechInterval]) -> int:
    return sum(interval.duration_ms for interval in chunk)


def build_chunk_plan(
    intervals: Iterable[SpeechInterval],
    target_chunk_ms: int,
    min_chunk_ms: int = 20000,
    max_chunk_ms: int = 40000,
) -> List[List[SpeechInterval]]:
    safe_min_chunk_ms = max(5000, int(min_chunk_ms or 20000))
    safe_max_chunk_ms = max(safe_min_chunk_ms, int(max_chunk_ms or 40000))
    safe_target_chunk_ms = max(safe_min_chunk_ms, min(safe_max_chunk_ms, int(target_chunk_ms or 30000)))
    chunks: List[List[SpeechInterval]] = []
    current_chunk: List[SpeechInterval] = []
    current_duration_ms = 0

    expanded_intervals: List[SpeechInterval] = []
    for interval in merge_intervals(intervals, max_gap_ms=0):
        expanded_intervals.extend(split_long_interval(interval, max_duration_ms=safe_max_chunk_ms))

    for interval in expanded_intervals:
        interval_duration_ms = interval.duration_ms
        if current_chunk and current_duration_ms + interval_duration_ms > safe_max_chunk_ms:
            chunks.append(current_chunk)
            current_chunk = []
            current_duration_ms = 0

        current_chunk.append(interval)
        current_duration_ms += interval_duration_ms

        if current_duration_ms >= safe_target_chunk_ms:
            chunks.append(current_chunk)
            current_chunk = []
            current_duration_ms = 0

    if current_chunk:
        if chunks and current_duration_ms < safe_min_chunk_ms:
            previous_duration_ms = chunk_speech_duration_ms(chunks[-1])
            if previous_duration_ms + current_duration_ms <= safe_max_chunk_ms:
                chunks[-1].extend(current_chunk)
            else:
                chunks.append(current_chunk)
        else:
            chunks.append(current_chunk)

    return chunks
