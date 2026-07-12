import asyncio
import os
import uuid

from fastapi import APIRouter, HTTPException

from app.models.schemas import CreateJobResponse, HighlightsRequest
from app.services import ffmpeg_service, ytdlp_service
from app.services.highlight_selection import select_peak_events
from app.services.job_store import create_job, update_job
from app.services.paths import TMP_DIR, job_output_dir, media_url
from app.services.validation import is_youtube_url

router = APIRouter(prefix="/api/highlights", tags=["highlights"])

MAX_SOURCE_DURATION_SECONDS = 4 * 60 * 60

FOCUS_PARAMS = {
    # (min_gap between peaks, pre_roll, post_roll, max events kept)
    "all_scores": {"min_gap": 15.0, "pre_roll": 6.0, "post_roll": 3.0, "max_events": 24},
    "big_plays": {"min_gap": 45.0, "pre_roll": 8.0, "post_roll": 4.0, "max_events": 8},
    "full_summary": {"min_gap": 25.0, "pre_roll": 7.0, "post_roll": 3.0, "max_events": 16},
}


@router.post("/jobs", response_model=CreateJobResponse)
async def start_highlights_job(req: HighlightsRequest):
    if not is_youtube_url(req.url):
        raise HTTPException(400, "Please provide a valid YouTube URL.")

    job = create_job(tool="highlights", title=f"{req.sport.title()} Highlight Reel")
    asyncio.create_task(_process(job.id, req))
    return {"jobId": job.id}


async def _process(job_id: str, req: HighlightsRequest) -> None:
    audio_path = os.path.join(TMP_DIR, f"{job_id}.audio.m4a")
    temp_files = [audio_path]

    try:
        update_job(job_id, status="fetching_info", message="Fetching game recording metadata...", progress=4)
        info = await asyncio.to_thread(ytdlp_service.fetch_info, req.url)

        if info["duration"] > MAX_SOURCE_DURATION_SECONDS:
            raise ValueError("This recording is too long (over 4 hours). Try a shorter one.")

        update_job(
            job_id,
            title=info["title"],
            status="downloading",
            message="Downloading game audio for crowd-noise analysis...",
            progress=10,
        )

        def on_progress(pct: float) -> None:
            update_job(job_id, progress=10 + round(pct * 0.25))

        await asyncio.to_thread(ytdlp_service.download_audio, req.url, audio_path, on_progress)

        update_job(job_id, status="detecting_events", message="Scanning for crowd-noise peaks...", progress=40)
        samples = await asyncio.to_thread(ffmpeg_service.analyze_loudness, audio_path)

        params = FOCUS_PARAMS[req.focus]
        events = await asyncio.to_thread(
            select_peak_events,
            samples,
            info["duration"],
            params["pre_roll"],
            params["post_roll"],
            params["min_gap"],
        )

        update_job(job_id, status="analyzing", message="Selecting the strongest moments to fit your target length...", progress=55)
        events = _select_within_budget(events, req.totalDuration, params["max_events"])
        if not events:
            raise ValueError("Couldn't find any clear crowd-reaction peaks in this recording.")

        out_dir = job_output_dir(job_id)
        update_job(job_id, status="rendering", message=f"Downloading & cutting {len(events)} moment(s)...", progress=60)

        section_paths = []
        for i, e in enumerate(events):
            section_path = os.path.join(TMP_DIR, f"{job_id}.event{i}.mp4")
            temp_files.append(section_path)
            await asyncio.to_thread(ytdlp_service.download_section, req.url, section_path, e["start"], e["end"])

            trimmed_path = os.path.join(TMP_DIR, f"{job_id}.event{i}.trim.mp4")
            temp_files.append(trimmed_path)
            pad_start = min(e["start"], 1)
            await asyncio.to_thread(
                ffmpeg_service.cut_and_reformat,
                section_path,
                trimmed_path,
                pad_start,
                pad_start + (e["end"] - e["start"]),
                "16:9",
            )
            section_paths.append(trimmed_path)
            update_job(job_id, progress=60 + round(((i + 1) / len(events)) * 25))

        update_job(job_id, status="rendering", message="Compiling the highlight reel...", progress=88)
        file_name = "highlight_reel.mp4"
        out_path = os.path.join(out_dir, file_name)
        await asyncio.to_thread(ffmpeg_service.concat_render, section_paths, out_path, (1920, 1080), "cut")

        reel_duration = sum(e["end"] - e["start"] for e in events)
        clip = {
            "id": str(uuid.uuid4()),
            "url": media_url(job_id, file_name),
            "label": "Highlight Reel",
            "start": 0,
            "end": round(reel_duration),
            "durationSeconds": round(reel_duration),
            "meta": f"{len(events)} key moments",
        }

        scores = [e["score"] for e in events]
        lo, hi = min(scores), max(scores)
        event_payload = [
            {
                "id": str(uuid.uuid4()),
                "label": "Crowd Reaction Peak",
                "timestamp": round(e["peak"], 1),
                "confidence": round(0.6 + 0.35 * ((e["score"] - lo) / (hi - lo) if hi > lo else 1), 2),
            }
            for e in events
        ]

        update_job(job_id, status="done", message="Done", progress=100, clips=[clip], events=event_payload)
    except Exception as exc:
        update_job(job_id, status="error", message=str(exc), error=str(exc))
    finally:
        for f in temp_files:
            try:
                os.remove(f)
            except OSError:
                pass


def _select_within_budget(events: list[dict], total_duration: float, max_events: int) -> list[dict]:
    ranked = sorted(events, key=lambda e: e["score"], reverse=True)[:max_events]
    budget = max(total_duration * 1.15, total_duration + 10)  # small slack, don't cut a moment awkwardly short
    selected = []
    used = 0.0
    for e in ranked:
        length = e["end"] - e["start"]
        if used + length > budget and selected:
            continue
        selected.append(e)
        used += length
    return sorted(selected, key=lambda e: e["start"])
