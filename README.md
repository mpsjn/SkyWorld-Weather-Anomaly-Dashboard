# SkyGuard Web Application

The website now attempts to use the original project contained in `SkyGuard_Final_Integrated.zip`.

## How the connection works

1. Docker copies the original ZIP into the API container.
2. `backend/model_adapter.py` extracts it at startup.
3. It searches for `predict_integrated.py` and `anomaly_model.pkl`.
4. If the original Python file exposes `predict`, `predict_anomaly`, `detect_anomalies`, or `run_prediction`, that function is used.
5. Otherwise it loads the pickle estimator and calls `.predict()`.
6. If the legacy code cannot load because of missing dependencies or a different input schema, the API stays usable with the transparent baseline detector and reports the reason at `/api/model-status`.

The original ZIP is not modified. The web application is organized as:

- `frontend/`: website UI and upload logic
- `backend/app.py`: API and CSV validation
- `backend/model_adapter.py`: compatibility layer for the original model
- `SkyGuard_Final_Integrated.zip`: original code and model archive
- `Dockerfile`: packages all of the above together

## Run

```bash
docker-compose up --build
```

Open `http://localhost:3000`. The API status is available at `http://localhost:8000/api/model-status` and interactive docs at `http://localhost:8000/docs`.

Expected CSV columns are `temperature`, `humidity`, `pressure`, and `wind_speed`. The adapter passes these columns in that order to the original model. If the original model requires additional engineered features, add that transformation in `OriginalModelAdapter.predict()`.
