import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TMP_DIR = os.path.join(BACKEND_DIR, "tmp")
OUTPUT_DIR = os.path.join(BACKEND_DIR, "output")

os.makedirs(TMP_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def job_output_dir(job_id: str) -> str:
    path = os.path.join(OUTPUT_DIR, job_id)
    os.makedirs(path, exist_ok=True)
    return path


def media_url(job_id: str, filename: str) -> str:
    return f"/media/{job_id}/{filename}"
