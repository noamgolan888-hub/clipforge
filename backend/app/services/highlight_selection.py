"""Pure heuristic moment-selection logic, shared by the Clipper, Beat-Sync,
and Highlights pipelines. Ported from the loudness-window approach that was
validated in the original VidCut prototype: score every second of audio by
loudness, then greedily pick the highest-scoring non-overlapping windows.
No external AI/API calls — just signal processing.
"""

from __future__ import annotations

SILENCE_THRESHOLD_DB = -50.0
SILENCE_FLOOR_DB = -100.0


def _bucket_by_second(samples: list[tuple[float, float]], total_duration: float) -> list[float]:
    last_second = int(total_duration)
    bucket: list[float | None] = [None] * (last_second + 1)
    for t, rms in samples:
        idx = round(t)
        if 0 <= idx <= last_second:
            bucket[idx] = rms
    prev = SILENCE_FLOOR_DB
    out: list[float] = []
    for v in bucket:
        if v is None:
            out.append(prev)
        else:
            out.append(v)
            prev = v
    return out


def select_best_windows(
    samples: list[tuple[float, float]],
    clip_duration: float,
    count: int,
    total_duration: float,
) -> list[dict]:
    """Fixed-length highlight windows for the Smart Clipper: picks up to
    `count` non-overlapping `clip_duration`-second windows with the highest
    loudness + burstiness score.

    The underlying loudness signal only has 1-second resolution (one RMS
    sample per second), so moment-scoring itself works on a whole-second
    grid via `analysis_window` — but the returned windows carry the exact
    requested `clip_duration` (important for callers like Beat-Sync that
    pass sub-second, beat-derived durations: a "best moment" is still
    1-second-granular, but the rendered clip length must not be silently
    truncated to that same granularity).
    """
    analysis_window = max(round(clip_duration), 1)

    if not samples or total_duration <= clip_duration:
        return [{"start": 0, "end": min(clip_duration, total_duration), "score": 0}]

    values = _bucket_by_second(samples, total_duration)
    n = len(values)
    prefix_sum = [0.0] * (n + 1)
    prefix_sum_sq = [0.0] * (n + 1)
    for i, v in enumerate(values):
        prefix_sum[i + 1] = prefix_sum[i] + v
        prefix_sum_sq[i + 1] = prefix_sum_sq[i] + v * v

    margin = min(2, analysis_window // 4)
    last_start = max(margin, n - analysis_window - margin)

    candidates = []
    for start in range(margin, last_start + 1):
        end = start + analysis_window
        if end > n:
            break
        window = end - start
        s = prefix_sum[end] - prefix_sum[start]
        sq = prefix_sum_sq[end] - prefix_sum_sq[start]
        mean = s / window
        variance = max(sq / window - mean * mean, 0)
        stddev = variance ** 0.5
        if mean < SILENCE_THRESHOLD_DB:
            continue
        candidates.append({"start": start, "end": end, "score": mean + 0.4 * stddev})

    if not candidates:
        return _evenly_spread(total_duration, clip_duration, count)

    candidates.sort(key=lambda c: c["score"], reverse=True)

    min_gap = clip_duration
    picked: list[dict] = []
    while len(picked) < min(count, len(candidates)) and min_gap >= 0:
        picked = []
        for c in candidates:
            overlaps = any(
                abs((p["start"] + p["end"]) / 2 - (c["start"] + c["end"]) / 2) < min_gap
                for p in picked
            )
            if not overlaps:
                picked.append(c)
            if len(picked) >= count:
                break
        if len(picked) >= min(count, len(candidates)):
            break
        min_gap -= max(1, int(clip_duration // 4))

    return sorted(picked, key=lambda c: c["start"])


def _evenly_spread(total_duration: float, clip_duration: float, count: int) -> list[dict]:
    usable = max(total_duration - clip_duration, 0)
    step = usable / (count - 1) if count > 1 else 0
    out = []
    for i in range(count):
        start = round(i * step)
        out.append({"start": start, "end": min(start + clip_duration, total_duration), "score": 0})
    return out


def select_peak_events(
    samples: list[tuple[float, float]],
    total_duration: float,
    pre_roll: float = 8.0,
    post_roll: float = 4.0,
    min_gap: float = 20.0,
) -> list[dict]:
    """Variable-length "moment" windows for the Sports Highlights reel:
    finds local loudness peaks (crowd-noise spikes) at least `min_gap`
    seconds apart, then wraps each in a [-pre_roll, +post_roll] window."""
    if not samples:
        return []

    values = _bucket_by_second(samples, total_duration)
    n = len(values)

    candidates = sorted(
        [(t, v) for t, v in enumerate(values) if v >= SILENCE_THRESHOLD_DB],
        key=lambda tv: tv[1],
        reverse=True,
    )

    peaks: list[tuple[int, float]] = []
    for t, v in candidates:
        if all(abs(t - pt) >= min_gap for pt, _ in peaks):
            peaks.append((t, v))

    events = []
    for t, v in peaks:
        start = max(t - pre_roll, 0)
        end = min(t + post_roll, n)
        events.append({"peak": t, "start": start, "end": end, "score": v})

    events.sort(key=lambda e: e["start"])
    merged: list[dict] = []
    for e in events:
        if merged and e["start"] <= merged[-1]["end"]:
            merged[-1]["end"] = max(merged[-1]["end"], e["end"])
            merged[-1]["score"] = max(merged[-1]["score"], e["score"])
        else:
            merged.append(dict(e))

    return merged
