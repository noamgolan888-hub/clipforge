import asyncio
import os
import uuid

from fastapi import APIRouter, HTTPException

from app.models.schemas import ClipperRequest, CreateJobResponse
from app.services import ffmpeg_service, ytdlp_service
from app.services.highlight_selection import select_best_windows
from app.services.job_store import create_job, update_job
from app.services.paths import TMP_DIR, job_output_dir, media_url
from app.services.validation import is_youtube_url

router = APIRouter(prefix="/api/clipper", tags=["clipper"])

MAX_SOURCE_DURATION_SECONDS = 4 * 60 * 60


@router.post("/jobs", response_model=CreateJobResponse)
async def start_clipper_job(req: ClipperRequest):
    if not is_youtube_url(req.url):
        raise HTTPException(400, "Please provide a valid YouTube URL.")

    job = create_job(tool="clipper", title="YouTube Highlight Clips")
    asyncio.create_task(_process(job.id, req))
    return {"jobId": job.id}


async def _process(job_id: str, req: ClipperRequest) -> None:
    audio_path = os.path.join(TMP_DIR, f"{job_id}.audio.m4a")
    temp_files = [audio_path]

    try:
        update_job(job_id, status="fetching_info", message="Fetching video metadata...", progress=5)
        info = await asyncio.to_thread(ytdlp_service.fetch_info, req.url)

        if info["duration"] > MAX_SOURCE_DURATION_SECONDS:
            raise ValueError("This video is too long (over 4 hours). Try a shorter one.")
        if info["duration"] and info["duration"] < req.targetDuration:
            raise ValueError("The video is shorter than the requested clip duration.")

        update_job(
            job_id,
            title=info["title"],
            status="downloading",
            message=f'Downloading audio from "{info["title"]}" for analysis...',
            progress=10,
        )

        def on_progress(pct: float) -> None:
            update_job(job_id, progress=10 + round(pct * 0.3))

        await asyncio.to_thread(ytdlp_service.download_audio, req.url, audio_path, on_progress)

        update_job(job_id, status="analyzing", message="Scoring moments for hook strength & engagement...", progress=42)
        samples = await asyncio.to_thread(ffmpeg_service.analyze_loudness, audio_path)
        windows = await asyncio.to_thread(
            select_best_windows, samples, req.targetDuration, req.clipCount, info["duration"]
        )

        out_dir = job_output_dir(job_id)
        update_job(job_id, status="rendering", message=f"Downloading & rendering {len(windows)} clip(s)...", progress=48)

        clips = []
        for i, w in enumerate(windows):
            section_path = os.path.join(TMP_DIR, f"{job_id}.section{i + 1}.mp4")
            temp_files.append(section_path)

            await asyncio.to_thread(ytdlp_service.download_section, req.url, section_path, w["start"], w["end"])

            file_name = f"clip_{i + 1}.mp4"
            out_path = os.path.join(out_dir, file_name)
            pad_start = min(w["start"], 1)
            await asyncio.to_thread(
                ffmpeg_service.cut_and_reformat,
                section_path,
                out_path,
                pad_start,
                pad_start + (w["end"] - w["start"]),
                req.aspectRatio,
            )

            try:
                os.remove(section_path)
            except OSError:
                pass

            clips.append(
                {
                    "id": str(uuid.uuid4()),
                    "url": media_url(job_id, file_name),
                    "label": f"Clip {i + 1}",
                    "start": round(w["start"]),
                    "end": round(w["end"]),
                    "durationSeconds": round(w["end"] - w["start"]),
                    "meta": req.aspectRatio,
                }
            )
            update_job(
                job_id,
                progress=48 + round(((i + 1) / len(windows)) * 47),
                message=f"Rendered {i + 1} of {len(windows)} clip(s)...",
                clips=clips.copy(),
            )

        update_job(job_id, status="done", message="Done", progress=100, clips=clips)
    except Exception as exc:
        update_job(job_id, status="error", message=str(exc), error=str(exc))
    finally:
        for f in temp_files:
            try:
                os.remove(f)
            except OSError:
                pass
