import os
import re
import shutil
import subprocess
import tempfile

import imageio_ffmpeg

from app.services.paths import BACKEND_DIR

_DOWNLOADED_FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# yt-dlp's partial-download (--download-sections) support checks for
# `ffmpeg` on PATH directly rather than honoring the `ffmpeg_location`
# option (acknowledged upstream as a bug: downloader/external.py has a
# "Fixme: This may be wrong when --ffmpeg-location is used" comment on
# FFmpegFD.available()). So we expose our downloaded binary under the
# expected name on PATH instead of relying on that option.
_BIN_DIR = os.path.join(BACKEND_DIR, "bin")
os.makedirs(_BIN_DIR, exist_ok=True)
FFMPEG_PATH = os.path.join(_BIN_DIR, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
if not os.path.exists(FFMPEG_PATH):
    shutil.copy2(_DOWNLOADED_FFMPEG, FFMPEG_PATH)
if _BIN_DIR not in os.environ.get("PATH", ""):
    os.environ["PATH"] = _BIN_DIR + os.pathsep + os.environ.get("PATH", "")

SILENCE_FLOOR_DB = -100.0
SILENCE_THRESHOLD_DB = -50.0

_FRAME_RE = re.compile(r"pts_time:([0-9.eE+-]+)")
_RMS_RE = re.compile(r"lavfi\.astats\.Overall\.RMS_level=(-?nan|-?inf|-?[0-9.eE+-]+)")
_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)")


def analyze_loudness(audio_path: str) -> list[tuple[float, float]]:
    """Returns one (time_seconds, rms_db) sample per second of audio."""
    args = [
        FFMPEG_PATH,
        "-i",
        audio_path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-af",
        "asetnsamples=n=16000:p=0,astats=metadata=1:reset=1,"
        "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    return _parse_astats(proc.stdout)


def _parse_astats(raw: str) -> list[tuple[float, float]]:
    samples: list[tuple[float, float]] = []
    current_time: float | None = None
    for line in raw.splitlines():
        frame_match = _FRAME_RE.search(line)
        if frame_match:
            current_time = float(frame_match.group(1))
            continue
        rms_match = _RMS_RE.search(line)
        if rms_match and current_time is not None:
            raw_val = rms_match.group(1)
            try:
                rms = SILENCE_FLOOR_DB if raw_val.endswith(("inf", "nan")) else max(float(raw_val), SILENCE_FLOOR_DB)
            except ValueError:
                rms = SILENCE_FLOOR_DB
            samples.append((current_time, rms))
            current_time = None
    return samples


def get_duration_seconds(path: str) -> float:
    proc = subprocess.run(
        [FFMPEG_PATH, "-i", path], capture_output=True, text=True, check=False
    )
    match = _DURATION_RE.search(proc.stderr)
    if not match:
        return 0.0
    h, m, s, cs = match.groups()
    return int(h) * 3600 + int(m) * 60 + int(s) + int(cs) / (10 ** len(cs))


def _reframe_filter(aspect_ratio: str) -> tuple[str, str]:
    dims = {"9:16": (1080, 1920), "1:1": (1080, 1080), "16:9": (1920, 1080)}
    w, h = dims.get(aspect_ratio, dims["9:16"])

    if aspect_ratio == "16:9":
        return (
            f"[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[outv]",
            "[outv]",
        )

    return (
        f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},gblur=sigma=20[bg];"
        f"[0:v]scale={w}:-2:force_original_aspect_ratio=decrease[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1[outv]",
        "[outv]",
    )


def cut_and_reformat(input_path: str, output_path: str, start: float, end: float, aspect_ratio: str) -> None:
    duration = max(end - start, 0.5)
    filter_complex, out_map = _reframe_filter(aspect_ratio)

    args = [
        FFMPEG_PATH,
        "-y",
        "-ss",
        str(max(start - 0.2, 0)),
        "-i",
        input_path,
        "-t",
        str(duration + 0.2),
        "-filter_complex",
        filter_complex,
        "-map",
        out_map,
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        output_path,
    ]
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg cut/reformat failed: {proc.stderr[-2000:]}")


def trim_clip(input_path: str, output_path: str, start: float, duration: float) -> None:
    """Precisely trims a downloaded section (which includes ~1s of padding
    on each side for keyframe safety) down to its exact intended length,
    without any aspect-ratio reframing."""
    args = [
        FFMPEG_PATH,
        "-y",
        "-ss",
        str(max(start, 0)),
        "-i",
        input_path,
        "-t",
        str(max(duration, 0.2)),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        output_path,
    ]
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg trim failed: {proc.stderr[-2000:]}")


def concat_render(
    clip_paths: list[str],
    output_path: str,
    resolution: tuple[int, int] = (1920, 1080),
    transition: str = "cut",
    transition_duration: float = 0.4,
    fps: int = 30,
) -> None:
    """Concatenates clips (already trimmed to their target length) into one
    video, normalizing resolution/fps first. `transition` is "cut" for hard
    cuts or "fade" for a crossfade between every pair of clips."""
    w, h = resolution
    n = len(clip_paths)
    if n == 0:
        raise ValueError("No clips to concatenate")

    inputs: list[str] = []
    for p in clip_paths:
        inputs += ["-i", p]

    norm_filters = [
        f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},fps={fps},setsar=1[v{i}]"
        for i in range(n)
    ]

    if transition == "cut" or n == 1:
        # ffmpeg's concat filter (v=1:a=1) requires each segment's video+audio
        # pads interleaved back-to-back — [v0][a0][v1][a1]... — not grouped
        # by type, or it rejects the graph with a pad type mismatch.
        labels = "".join(f"[v{i}][{i}:a]" for i in range(n))
        concat_filter = f"{labels}concat=n={n}:v=1:a=1[outv][outa]"
        filter_complex = ";".join(norm_filters) + ";" + concat_filter
        out_maps = ["-map", "[outv]", "-map", "[outa]"]
    else:
        durations = [get_duration_seconds(p) for p in clip_paths]
        chain = "v0"
        parts = list(norm_filters)
        running_offset = durations[0] - transition_duration
        for i in range(1, n):
            next_chain = f"vx{i}"
            parts.append(
                f"[{chain}][v{i}]xfade=transition=fade:duration={transition_duration}:"
                f"offset={max(running_offset, 0)}[{next_chain}]"
            )
            chain = next_chain
            running_offset += durations[i] - transition_duration
        parts.append(f"[{chain}]null[outv]")
        filter_complex = ";".join(parts)
        out_maps = ["-map", "[outv]"]

    # Long edits (dozens of segments) can push the filter graph past what's
    # safe to pass as a single command-line argument on Windows — write it
    # to a script file instead, which ffmpeg reads directly and has no such
    # length limit.
    script_fd, script_path = tempfile.mkstemp(suffix=".ffconcat.txt")
    with os.fdopen(script_fd, "w", encoding="utf-8") as f:
        f.write(filter_complex)

    try:
        args = [
            FFMPEG_PATH,
            "-y",
            *inputs,
            "-filter_complex_script",
            script_path,
            *out_maps,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
        ]
        if transition == "cut" or n == 1:
            args += ["-c:a", "aac", "-b:a", "128k"]
        args += ["-movflags", "+faststart", output_path]

        proc = subprocess.run(args, capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg concat render failed: {proc.stderr[-2000:]}")
    finally:
        try:
            os.remove(script_path)
        except OSError:
            pass


def replace_audio(video_path: str, audio_path: str, output_path: str) -> None:
    """Muxes `video_path`'s video stream with `audio_path`'s audio, trimming
    the shorter of the two (used to lay the music track under a beat-synced edit)."""
    args = [
        FFMPEG_PATH,
        "-y",
        "-i",
        video_path,
        "-i",
        audio_path,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        output_path,
    ]
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg audio replace failed: {proc.stderr[-2000:]}")
