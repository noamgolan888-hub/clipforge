from typing import List, Literal, Optional
from pydantic import BaseModel, Field

AspectRatio = Literal["9:16", "1:1", "16:9"]
EditStyle = Literal["aggressive", "smooth", "cinematic"]
SportFocus = Literal["all_scores", "big_plays", "full_summary"]


class ClipperRequest(BaseModel):
    url: str
    aspectRatio: AspectRatio
    targetDuration: int = Field(ge=5, le=180)
    clipCount: int = Field(ge=1, le=5)


class BeatSyncRequest(BaseModel):
    videoUrls: List[str] = Field(min_length=1, max_length=5)
    musicUrl: str
    totalDuration: int = Field(ge=5, le=180)
    style: EditStyle


class HighlightsRequest(BaseModel):
    url: str
    totalDuration: int = Field(ge=30, le=1800)
    sport: str
    focus: SportFocus


class CreateJobResponse(BaseModel):
    jobId: str


class ResultClip(BaseModel):
    id: str
    url: str
    label: str
    start: float
    end: float
    durationSeconds: float
    meta: Optional[str] = None


class DetectedEvent(BaseModel):
    id: str
    label: str
    timestamp: float
    confidence: float


class Job(BaseModel):
    id: str
    tool: Literal["clipper", "beatsync", "highlights"]
    status: str = "queued"
    message: str = "Queued..."
    progress: float = 0
    title: str = ""
    createdAt: float
    clips: List[ResultClip] = []
    events: Optional[List[DetectedEvent]] = None
    error: Optional[str] = None
