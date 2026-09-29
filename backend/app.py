from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from model_adapter import original_model

app = FastAPI(title="SkyGuard API", version="1.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

REQUIRED_FIELDS = ["temperature", "humidity", "pressure", "wind_speed"]


def numeric(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def baseline_detect(frame: pd.DataFrame) -> list[dict[str, Any]]:
    stats = {}
    for key in REQUIRED_FIELDS:
        values = frame[key].tolist()
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        stats[key] = (mean, variance**0.5)
    output = []
    for index, row in frame.iterrows():
        scores = [abs(row[key] - stats[key][0]) / stats[key][1] if stats[key][1] else 0 for key in REQUIRED_FIELDS]
        score = max(scores)
        output.append({"row": index + 1, "anomaly": score >= 3, "score": round(score, 3), "values": row.to_dict(), "detector": "baseline"})
    return output


def detect(rows: list[dict[str, Any]]) -> dict[str, Any]:
    frame = pd.DataFrame(rows)
    missing = [key for key in REQUIRED_FIELDS if key not in frame.columns]
    if missing:
        raise HTTPException(400, f"CSV is missing required columns: {', '.join(missing)}")
    for key in REQUIRED_FIELDS:
        frame[key] = pd.to_numeric(frame[key], errors="coerce")
    frame = frame.dropna(subset=REQUIRED_FIELDS).reset_index(drop=True)
    if frame.empty:
        raise HTTPException(400, "CSV has no valid numeric weather readings")

    predictions = None
    detector = "baseline"
    try:
        predictions = original_model.predict(frame[REQUIRED_FIELDS])
        detector = original_model.status if predictions is not None else detector
    except Exception:
        predictions = None
    results = baseline_detect(frame)
    if predictions is not None and len(predictions) == len(results):
        for item, anomaly in zip(results, predictions):
            item["anomaly"] = anomaly
            item["detector"] = detector
    anomalies = sum(item["anomaly"] for item in results)
    return {"total": len(results), "anomalies": anomalies, "normal": len(results) - anomalies, "detector": detector, "model_error": original_model.error, "results": results}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/model-status")
def model_status() -> dict[str, str | None]:
    return {"detector": original_model.status, "error": original_model.error}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Upload a CSV file")
    try:
        text = (await file.read()).decode("utf-8-sig")
        return detect(pd.read_csv(__import__("io").StringIO(text)).to_dict("records"))
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "CSV must be UTF-8 encoded") from exc
    except pd.errors.ParserError as exc:
        raise HTTPException(400, "Invalid CSV format") from exc


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "SkyGuard API is running", "docs": "/docs"}
