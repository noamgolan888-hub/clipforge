import librosa
import numpy as np


def detect_tempo(audio_path: str) -> float:
    """Returns detected tempo in BPM using librosa's beat tracker."""
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    value = float(np.atleast_1d(tempo)[0])
    if value <= 0:
        return 100.0  # sane fallback if detection fails on quiet/atonal audio
    return value
