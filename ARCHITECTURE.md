# ClipForge — System Architecture & Backend Implementation Plan

## 0. Current state

- **Frontend** (`/frontend`): React + TypeScript + Tailwind CSS v4, fully built and functional. All 3 tools have real forms, real API calls, real polling, real result rendering. Nothing here is a mock.
- **Backend** (`/backend`): FastAPI, fully wired (routing, validation, job store, progress polling). The *pipeline steps* are simulated — `run_phases()` walks through the real status sequence and timing shape a genuine pipeline would have, then returns placeholder result clips, so the full product can be demoed end-to-end today. The AI/CV/audio processing itself (sections 2–4 below) is not implemented yet.
- Everything in this document describes what needs to be built to replace the simulation with real processing, in priority order.

## 1. High-level architecture

```
┌─────────────┐      REST + polling      ┌──────────────────┐
│   React SPA │ ───────────────────────▶ │   FastAPI (API)   │
│  (Vite/TS)  │ ◀─────────────────────── │   /backend/app    │
└─────────────┘                          └─────────┬─────────┘
                                                    │ enqueue
                                                    ▼
                                          ┌──────────────────┐
                                          │  Job Queue        │
                                          │ (Celery + Redis,  │
                                          │  or arq)          │
                                          └─────────┬─────────┘
                                                    ▼
                                    ┌───────────────────────────────┐
                                    │        Worker pool             │
                                    │  (GPU-enabled for CV/ASR)      │
                                    │                                 │
                                    │  yt-dlp → ffmpeg → AI models   │
                                    └───────────────┬────────────────┘
                                                    ▼
                                          ┌──────────────────┐
                                          │ Object storage     │
                                          │ (S3 / R2 / local)  │
                                          └──────────────────┘
```

**Why move off in-process `asyncio.create_task`:** it works for a demo but dies on restart and doesn't scale past one process. The production job runner should be **Celery + Redis** (or the lighter `arq`, also Redis-backed) so that:
- video downloading/encoding (CPU/IO heavy) doesn't block the API event loop,
- jobs survive an API restart,
- multiple workers can be scaled independently of the API, and GPU workers can be isolated for the ML-heavy steps.

The job status contract (`GET /api/jobs/{id}` → `{status, progress, message, clips, events}`) stays identical — only what populates it changes from a simulated coroutine to a real Celery task writing into Redis/Postgres.

## 2. Feature 1 — Smart URL Clipper

**Goal:** one YouTube URL → N short clips, auto-selected for "hook strength," reframed to the target aspect ratio with the subject kept in frame.

### Pipeline

1. **Fetch metadata** — `yt-dlp --dump-json` for title/duration/chapters. Reject if duration exceeds a configured cap.
2. **Download** — audio-only first (`-f bestaudio`), matching the approach already used successfully in the earlier VidCut prototype: never pull the full video just to analyze it.
3. **Transcribe** — `faster-whisper` (CTranslate2-based, much faster than stock `openai-whisper`, runs fine on CPU for short-to-medium videos, GPU for long ones). Produces word-level timestamps.
4. **Hook / engaging-moment scoring** — combine multiple signals into one score per second, then take the top non-overlapping windows (same greedy windowing approach as the working prototype):
   - **Audio energy** (RMS via `ffmpeg astats`, or `librosa`) — loudness/burstiness, cheap and effective.
   - **Speech rate & emphasis** — from Whisper word timings: words/sec spikes, laughter/reaction tokens.
   - **Semantic hook detection** — run the transcript through a small LLM call (or a local sentence-transformer + zero-shot classifier) prompted specifically to find "hook" sentences (questions, bold claims, punchlines, "wait for it" cues). This is the one step that benefits from an LLM API (e.g., Claude) rather than a classic model — it's the qualitative judgment call a heuristic can't fully replace.
   - **Visual activity** (optional v2) — frame-difference / optical-flow spikes via OpenCV as a lightweight motion signal, without full object detection.
5. **Section download** — once windows are chosen, download *only* those few-second ranges at full resolution via `yt-dlp --download-sections`, exactly as in the working prototype. This is what keeps the whole feature fast regardless of source video length.
6. **Reframe to aspect ratio**:
   - **v1 (already implemented in the old prototype, reusable as-is):** blurred/zoomed background + centered scaled foreground via an `ffmpeg` filter graph. Correct, fast, zero ML cost.
   - **v2 (smart subject tracking):** run a lightweight face/person detector (`mediapipe` face/pose landmarker, or `ultralytics` YOLOv8n for person bounding boxes) per sampled frame, smooth the centroid trajectory (e.g., Kalman filter or simple EMA), and drive a moving crop window through `ffmpeg`'s `crop=x=...:y=...` with per-frame expressions (or pre-render crop coordinates and feed via `sendcmd`/`zoompan`). This is the "keep the subject centered" requirement — it's a real, scoped CV task, not a stub.
7. **Render** — `ffmpeg` encode (`libx264`, `veryfast`/`medium` preset depending on load), burn in captions optionally (v2, from the Whisper transcript, styled via `ass` subtitles for that "auto-caption" short-form look).

### Libraries
`yt-dlp`, `ffmpeg` (via `ffmpeg-python` or direct subprocess — direct subprocess gives more control over complex filter graphs, recommended), `faster-whisper`, `librosa` (optional, `ffmpeg astats` already covers loudness), `mediapipe` or `ultralytics` (subject tracking), Claude/LLM API (hook detection).

## 3. Feature 2 — Beat-Synced Edit

**Goal:** up to 5 source videos + 1 music track → one edit, cuts locked to the beat, pacing style-dependent.

### Pipeline

1. **Download** music (audio-only) and all source videos (video, capped resolution — 1080p is plenty for short-form output).
2. **Beat detection** — `librosa.beat.beat_track()` on the music track gives beat frame positions; `librosa.onset.onset_detect()` finds transient peaks for finer-grained cut points than just the beat grid (useful for "aggressive fast cuts" which often cut on sub-beat transients, not just the downbeat). Also extract tempo (BPM) to decide how many cuts fit in `totalDuration`.
3. **Source "high-action" scoring** — same audio-energy + optical-flow-motion signal as the clipper's engaging-moment scoring, applied per source video, to rank candidate sub-clips within each source.
4. **Cut planning** — an edit-decision-list (EDL) builder:
   - Style presets map to cut-density and clip-length distributions: *Aggressive* = short clips (0.3–0.8s) cut on every detected onset; *Smooth* = longer clips (1.5–3s) cut on downbeats only, with crossfade transitions; *Cinematic* = longest clips (3–6s), cuts only on strong downbeats (every 2nd/4th beat), slower pacing.
   - Round-robin / highest-score-first across the source videos so no single source dominates, respecting `totalDuration`.
5. **Render** — `ffmpeg` concat of the selected sub-clips (re-encoded to a common resolution/fps first, since sources vary), audio track replaced entirely by the music, transitions (`xfade` filter) for the "Smooth"/"Cinematic" styles, hard cuts for "Aggressive". This is genuinely the After-Effects-style edit the user described, just built as a deterministic `ffmpeg` filter graph driven by the EDL instead of manual keyframing.

### Libraries
`yt-dlp`, `librosa` (beat/onset detection — this is the core new dependency for this feature), `ffmpeg` (concat + `xfade` + audio replace), OpenCV (optical flow, optional v1.5).

## 4. Feature 3 — Sports Highlight Generator

**Goal:** full game → highlight reel, driven by actual scoring events, not just "loud moments."

This is the most CV-heavy feature and should be scoped in two tiers:

### Tier 1 (ships first, good accuracy, no model training)
- **Crowd-noise peak detection** — same `ffmpeg astats`/`librosa` energy approach as the other two features, tuned with a higher threshold and longer minimum-gap (sports crowd reactions are longer and more spread out than short-form "loud moments").
- **Scoreboard OCR** — sample frames at ~1fps from a fixed scoreboard region (most broadcast/stream footage keeps the scoreboard in a consistent screen position), run `PaddleOCR` or `Tesseract` on that crop, parse the score string, and diff consecutive readings to detect a score change and its timestamp. This directly satisfies the "include all baskets/scores" rule — it's checking the actual scoreboard, not guessing from crowd noise.
- **Event window extraction** — for each detected score-change timestamp, take a window around it (e.g., -8s/+3s) as the highlight clip, same non-overlap/greedy selection as the clipper.

### Tier 2 (v2, meaningfully harder, needs a trained/fine-tuned model)
- **Action/object detection** — `ultralytics` YOLOv8 (fine-tuned on a sports dataset, e.g. basketball/soccer-specific weights if available, or a general "ball + hoop/goal" detector) to catch scoring plays where OCR alone might miss (broadcast graphics vary a lot) or to support the "Big Plays" focus mode (fast breaks, breakaways) that isn't score-driven.
- This tier is where "computer vision, object detection" becomes a real model-training/fine-tuning project, not just glue code — it should be scoped as its own milestone with a labeled dataset, not bundled into the MVP timeline.

### Focus modes → selection rule
- `all_scores`: every OCR-confirmed score change, uncapped (may exceed target duration slightly, or trims lowest-confidence events first to fit).
- `big_plays`: score changes + crowd-noise-peak windows above a high percentile threshold, capped to fit `totalDuration`, ranked by confidence.
- `full_summary`: even time-distribution sampling of the game combined with all score events, so possession changes and non-scoring context appear too.

### Libraries
`yt-dlp`, `ffmpeg`, `PaddleOCR` or `pytesseract` (scoreboard OCR — Tier 1), `librosa`/`ffmpeg astats` (crowd noise), `ultralytics` YOLOv8 (Tier 2, action detection).

## 5. API contract (already implemented, stable)

```
POST /api/clipper/jobs      { url, aspectRatio, targetDuration, clipCount } → { jobId }
POST /api/beatsync/jobs     { videoUrls[1..5], musicUrl, totalDuration, style } → { jobId }
POST /api/highlights/jobs   { url, totalDuration, sport, focus } → { jobId }
GET  /api/jobs/{jobId}      → Job { id, tool, status, message, progress, title, clips[], events?[], error? }
```

`status` values already model the real pipelines' phases: `queued → fetching_info → downloading → transcribing|detecting_beats|detecting_events → analyzing → rendering → done` (or `error`). Swapping simulation for real processing means the same `update_job(...)` calls happen from inside real pipeline steps instead of `run_phases()` — **no frontend changes required.**

## 6. Storage & serving

Right now `SAMPLE_CLIPS` in `app/services/sample_assets.py` are hardcoded public demo URLs. Real implementation needs:
- Rendered clips written to object storage (S3-compatible: AWS S3, Cloudflare R2, or local disk behind a static file route for self-hosting) with a signed/expiring URL or a `/media/{jobId}/{file}` route, mirroring the static-file pattern already used in the earlier Node prototype (`/output/:jobId/:file`).
- A cleanup job (cron or Celery beat) to delete source downloads and old rendered clips after N days.

## 7. Phased roadmap

| Phase | Scope | Outcome |
|---|---|---|
| **P0 (done)** | Frontend + FastAPI skeleton, simulated pipelines | Fully demoable UI/UX, correct API contract |
| **P1** | Clipper v1: yt-dlp + ffmpeg audio-energy scoring + blur-pad reframe (i.e., port the working single-tool prototype into this architecture) | First real feature live |
| **P2** | Move job execution to Celery + Redis; add object storage | Production-ready job runner |
| **P3** | Beat-Synced Edit: librosa beat/onset detection + EDL builder + ffmpeg concat/xfade | Second real feature live |
| **P4** | Sports Highlights Tier 1: scoreboard OCR + crowd-noise peaks | Third real feature live (score-accurate) |
| **P5** | Clipper v2: subject tracking (mediapipe/YOLO) + auto-captions | Quality bar raised on flagship feature |
| **P6** | Sports Highlights Tier 2: fine-tuned action detection model | "Big Plays" mode quality raised beyond OCR-only |

## 8. Local dev

```bash
# Backend
cd backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to :8000
```
