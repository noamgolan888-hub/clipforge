import os
import time
from typing import Callable, Optional

import yt_dlp

from app.services.ffmpeg_service import FFMPEG_PATH

# This machine's network/AV setup breaks TLS cert verification for yt-dlp
# (same root cause documented when this was a Node prototype) — verified
# workaround, not a default we'd want in a hardened deployment.
_COMMON_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
    "nocheckcertificate": True,
}

_MAX_RETRIES = 3


def _with_retries(fn: Callable[[], None], output_path: str) -> None:
    """The external ffmpeg downloader occasionally exits with a bogus,
    non-reproducible status code on this machine (observed twice —
    antivirus real-time scanning interfering with a freshly-spawned
    process is the leading suspect). Retrying has fixed it every time,
    so treat single failures as transient rather than fatal."""
    last_error: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            fn()
            return
        except Exception as exc:  # noqa: BLE001 - genuinely want to retry any yt-dlp failure
            last_error = exc
            for path in (output_path, output_path + ".part"):
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        pass
            if attempt < _MAX_RETRIES - 1:
                time.sleep(1.5)
    raise last_error


def fetch_info(url: str) -> dict:
    with yt_dlp.YoutubeDL({**_COMMON_OPTS, "skip_download": True}) as ydl:
        info = ydl.extract_info(url, download=False)
    return {"title": info.get("title") or "video", "duration": info.get("duration") or 0}


def download_audio(url: str, output_path: str, on_progress: Optional[Callable[[float], None]] = None) -> str:
    def hook(d: dict) -> None:
        if d.get("status") == "downloading" and on_progress:
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes")
            if total and downloaded:
                on_progress(min(downloaded / total * 100, 100))

    opts = {
        **_COMMON_OPTS,
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": output_path,
        "progress_hooks": [hook],
    }

    def run() -> None:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

    _with_retries(run, output_path)
    return output_path


def download_section(url: str, output_path: str, start: float, end: float, max_height: int = 1080) -> str:
    """Downloads only the [start,end] time range (with 1s padding) at up to
    `max_height`p — never the whole source — using yt-dlp's native
    range-download support (byte-range seeking where the source allows it)."""
    range_start = max(start - 1, 0)
    range_end = end + 1

    opts = {
        **_COMMON_OPTS,
        "format": (
            f"bv*[height<={max_height}][ext=mp4]+ba[ext=m4a]/"
            f"b[height<={max_height}][ext=mp4]/best"
        ),
        "outtmpl": output_path,
        "merge_output_format": "mp4",
        "ffmpeg_location": FFMPEG_PATH,
        "download_ranges": yt_dlp.utils.download_range_func(None, [(range_start, range_end)]),
    }

    def run() -> None:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

    _with_retries(run, output_path)
    return output_path
