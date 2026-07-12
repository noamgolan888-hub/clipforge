import asyncio
import os
import uuid

from fastapi import APIRouter, HTTPException

from app.models.schemas import BeatSyncRequest, CreateJobResponse
from app.services import beat_detection, ffmpeg_service, ytdlp_service
from app.services.highlight_selection import select_best_windows
from app.services.job_store import create_job, update_job
from app.services.paths import TMP_DIR, job_output_dir, media_url
from app.services.validation import is_youtube_url

router = APIRouter(prefix="/api/beatsync", tags=["beatsync"])

STYLE_LABELS = {"aggressive": "aggressive fast-cut", "smooth": "smooth transition", "cinematic": "cinematic"}
STYLE_BEATS_PER_CUT = {"aggressive": 1, "smooth": 3, "cinematic": 6}
MAX_SEGMENTS = 24
MIN_CLIP_DURATION = 0.4
MAX_CLIP_DURATION = 8.0


@router.post("/jobs", response_model=CreateJobResponse)
async def start_beatsync_job(req: BeatSyncRequest):
    if not req.videoUrls or not all(is_youtube_url(u) for u in req.videoUrls):
        raise HTTPException(400, "Please provide valid YouTube URLs for every video source.")
    if not is_youtube_url(req.musicUrl):
        raise HTTPException(400, "Please provide a valid YouTube URL for the music track.")

    job = create_job(tool="beatsync", title=f"Beat-Synced Edit ({STYLE_LABELS[req.style]})")
    asyncio.create_task(_process(job.id, req))
    return {"jobId": job.id}


async def _process(job_id: str, req: BeatSyncRequest) -> None:
    temp_files: list[str] = []
    try:
        update_job(job_id, status="fetching_info", message="Fetching source clips & track metadata...", progress=4)
        music_info = await asyncio.to_thread(ytdlp_service.fetch_info, req.musicUrl)
        source_infos = [await asyncio.to_thread(ytdlp_service.fetch_info, u) for u in req.videoUrls]

        music_audio_path = os.path.join(TMP_DIR, f"{job_id}.music.m4a")
        temp_files.append(music_audio_path)

        update_job(job_id, status="downloading", message="Downloading music track...", progress=10)
        await asyncio.to_thread(ytdlp_service.download_audio, req.musicUrl, music_audio_path)

        update_job(job_id, status="detecting_beats", message="Running beat detection on the music track...", progress=25)
        tempo = await asyncio.to_thread(beat_detection.detect_tempo, music_audio_path)
        beat_interval = 60.0 / tempo
        clip_duration = min(max(STYLE_BEATS_PER_CUT[req.style] * beat_interval, MIN_CLIP_DURATION), MAX_CLIP_DURATION)

        transition = "cut" if req.style == "aggressive" else "fade"
        transition_duration = min(max(clip_duration * 0.15, 0.15), 0.6)

        if transition == "fade":
            # Each crossfade overlaps two clips by `transition_duration`, so
            # the rendered total is shorter than the sum of clip lengths —
            # solve for the segment count that lands on the target instead
            # of just dividing totalDuration by clip_duration.
            effective_duration = max(clip_duration - transition_duration, 0.1)
            segment_count = min(
                max(round((req.totalDuration - transition_duration) / effective_duration), 1), MAX_SEGMENTS
            )
        else:
            segment_count = min(max(round(req.totalDuration / clip_duration), 1), MAX_SEGMENTS)

        update_job(
            job_id,
            status="analyzing",
            message=f"Scanning {len(req.videoUrls)} source(s) for high-action moments (tempo: {round(tempo)} BPM)...",
            progress=35,
        )

        per_source_counts = _distribute(segment_count, len(req.videoUrls))
        source_segments: list[list[dict]] = []
        for idx, (url, info, count) in enumerate(zip(req.videoUrls, source_infos, per_source_counts)):
            if count == 0 or not info["duration"]:
                source_segments.append([])
                continue
            audio_path = os.path.join(TMP_DIR, f"{job_id}.src{idx}.m4a")
            temp_files.append(audio_path)
            await asyncio.to_thread(ytdlp_service.download_audio, url, audio_path)
            samples = await asyncio.to_thread(ffmpeg_service.analyze_loudness, audio_path)
            windows = await asyncio.to_thread(
                select_best_windows, samples, min(clip_duration, info["duration"]), count, info["duration"]
            )
            # select_best_windows scores moments on a whole-second grid (the
            # loudness signal itself is 1Hz) but beat-synced cuts need the
            # exact beat-derived length, so re-apply the precise duration
            # to the chosen moments rather than the rounded analysis window.
            actual_duration = min(clip_duration, info["duration"])
            for w in windows:
                w["end"] = min(w["start"] + actual_duration, info["duration"])
            source_segments.append(windows)
            update_job(job_id, progress=35 + round(((idx + 1) / len(req.videoUrls)) * 25))

        plan = _interleave(req.videoUrls, source_segments)
        if not plan:
            raise ValueError("Could not find usable segments in the provided videos.")

        update_job(job_id, status="rendering", message=f"Downloading {len(plan)} beat-synced segment(s)...", progress=62)
        section_paths = []
        for i, (url, w) in enumerate(plan):
            section_path = os.path.join(TMP_DIR, f"{job_id}.seg{i}.raw.mp4")
            temp_files.append(section_path)
            await asyncio.to_thread(ytdlp_service.download_section, url, section_path, w["start"], w["end"])

            trimmed_path = os.path.join(TMP_DIR, f"{job_id}.seg{i}.mp4")
            temp_files.append(trimmed_path)
            pad_start = min(w["start"], 1)
            await asyncio.to_thread(
                ffmpeg_service.trim_clip, section_path, trimmed_path, pad_start, w["end"] - w["start"]
            )
            section_paths.append(trimmed_path)
            update_job(job_id, progress=62 + round(((i + 1) / len(plan)) * 18))

        raw_render_path = os.path.join(TMP_DIR, f"{job_id}.raw.mp4")
        temp_files.append(raw_render_path)
        update_job(job_id, status="rendering", message=f"Cutting on beat with a {STYLE_LABELS[req.style]} style...", progress=85)
        await asyncio.to_thread(
            ffmpeg_service.concat_render,
            section_paths,
            raw_render_path,
            (1920, 1080),
            transition,
            transition_duration,
        )

        out_dir = job_output_dir(job_id)
        file_name = "final_edit.mp4"
        out_path = os.path.join(out_dir, file_name)
        update_job(job_id, message="Laying the music track under the final edit...", progress=95)
        await asyncio.to_thread(ffmpeg_service.replace_audio, raw_render_path, music_audio_path, out_path)
        actual_duration = await asyncio.to_thread(ffmpeg_service.get_duration_seconds, out_path)

        clip = {
            "id": str(uuid.uuid4()),
            "url": media_url(job_id, file_name),
            "label": "Final Edit",
            "start": 0,
            "end": round(actual_duration, 1),
            "durationSeconds": round(actual_duration, 1),
            "meta": f"{STYLE_LABELS[req.style]} · {round(tempo)} BPM · {len(plan)} cuts",
        }
        update_job(job_id, title=music_info["title"], status="done", message="Done", progress=100, clips=[clip])
    except Exception as exc:
        update_job(job_id, status="error", message=str(exc), error=str(exc))
    finally:
        for f in temp_files:
            try:
                os.remove(f)
            except OSError:
                pass


def _distribute(total: int, buckets: int) -> list[int]:
    base, remainder = divmod(total, buckets)
    return [base + (1 if i < remainder else 0) for i in range(buckets)]


def _interleave(urls: list[str], source_segments: list[list[dict]]) -> list[tuple[str, dict]]:
    plan: list[tuple[str, dict]] = []
    max_len = max((len(s) for s in source_segments), default=0)
    for round_idx in range(max_len):
        for url, segments in zip(urls, source_segments):
            if round_idx < len(segments):
                plan.append((url, segments[round_idx]))
    return plan
