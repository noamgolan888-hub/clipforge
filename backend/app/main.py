import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import beatsync, clipper, highlights, jobs
from app.services.paths import OUTPUT_DIR

app = FastAPI(title="ClipForge API", version="0.1.0")

# FRONTEND_ORIGIN holds the deployed frontend's URL in production (comma
# separated if there's more than one, e.g. a Vercel preview + prod domain).
_extra_origins = [o.strip() for o in os.environ.get("FRONTEND_ORIGIN", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", *_extra_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clipper.router)
app.include_router(beatsync.router)
app.include_router(highlights.router)
app.include_router(jobs.router)

app.mount("/media", StaticFiles(directory=OUTPUT_DIR), name="media")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
