from __future__ import annotations

import importlib.util
import pickle
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import pandas as pd

ARCHIVE = Path(__file__).resolve().parents[1] / "SkyGuard_Final_Integrated.zip"
MODEL_NAMES = {"anomaly_model.pkl", "model.pkl", "model.joblib"}
SOURCE_NAMES = {"predict_integrated.py", "predict.py"}


class OriginalModelAdapter:
    """Loads the model shipped in the original ZIP when its dependencies are available.

    The adapter deliberately keeps the original archive untouched. It first looks for
    an exported prediction function, then tries the serialized estimator directly.
    """

    def __init__(self) -> None:
        self.model: Any = None
        self.predict_function: Any = None
        self.status = "baseline"
        self.error: str | None = None
        self._load()

    def _load(self) -> None:
        if not ARCHIVE.exists():
            self.error = "Original ZIP was not copied into the runtime image"
            return
        try:
            self.temp_dir = Path(tempfile.mkdtemp(prefix="skyguard-original-"))
            with zipfile.ZipFile(ARCHIVE) as archive:
                archive.extractall(self.temp_dir)
            source = next((p for p in self.temp_dir.rglob("*") if p.name in SOURCE_NAMES), None)
            model_path = next((p for p in self.temp_dir.rglob("*") if p.name in MODEL_NAMES), None)
            if source:
                spec = importlib.util.spec_from_file_location("skyguard_original_predict", source)
                module = importlib.util.module_from_spec(spec)
                sys.modules[spec.name] = module
                if spec.loader:
                    spec.loader.exec_module(module)
                for name in ("predict", "predict_anomaly", "detect_anomalies", "run_prediction"):
                    candidate = getattr(module, name, None)
                    if callable(candidate):
                        self.predict_function = candidate
                        self.status = "original-function"
                        return
            if model_path:
                with model_path.open("rb") as handle:
                    self.model = pickle.load(handle)
                self.status = "original-model"
            else:
                self.error = "No supported prediction function or model file found"
        except Exception as exc:  # keep the API available if legacy dependencies fail
            self.error = f"Original model unavailable: {type(exc).__name__}: {exc}"

    def predict(self, frame: pd.DataFrame) -> list[bool] | None:
        if self.predict_function:
            output = self.predict_function(frame)
        elif self.model is not None and hasattr(self.model, "predict"):
            output = self.model.predict(frame)
        else:
            return None
        values = list(output)
        return [bool(value == -1 or value is True or value == "anomaly" or value == "anomalous") for value in values]


original_model = OriginalModelAdapter()
