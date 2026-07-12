import itertools
import time
from typing import Optional

from app.models.schemas import Job

_counter = itertools.count(1)
_jobs: dict[str, Job] = {}


def create_job(tool: str, title: str) -> Job:
    job_id = f"{int(time.time() * 1000)}_{next(_counter)}"
    job = Job(id=job_id, tool=tool, title=title, createdAt=time.time() * 1000)
    _jobs[job_id] = job
    return job


def get_job(job_id: str) -> Optional[Job]:
    return _jobs.get(job_id)


def update_job(job_id: str, **patch) -> Optional[Job]:
    job = _jobs.get(job_id)
    if not job:
        return None
    updated = Job.model_validate({**job.model_dump(), **patch})
    _jobs[job_id] = updated
    return updated
