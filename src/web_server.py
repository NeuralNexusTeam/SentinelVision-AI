import asyncio
import json
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Response
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os

from .config import MonitorConfig
from .vision_tracker import VisionTracker
from .state_monitor import StateMonitor
from .history_buffer import HistoryBuffer
from .alarm_manager import AlarmManager

class SettingsPayload(BaseModel):
    ear_threshold: float
    eye_closed_time_sec: float
    face_hidden_time_sec: float
    person_absent_time_sec: float
    alarm_enabled: bool
    alarm_volume: float
    auto_silence_on_recovery: bool

def create_app(config: MonitorConfig, tracker: VisionTracker, monitor: StateMonitor,
               history: HistoryBuffer, alarm: AlarmManager) -> FastAPI:
    app = FastAPI(title="SentinelVision AI Monitoring", version="2.0")

    # Static files and templates
    static_dir = os.path.join(config.base_dir, "static")
    templates_dir = os.path.join(config.base_dir, "templates")

    os.makedirs(static_dir, exist_ok=True)
    os.makedirs(templates_dir, exist_ok=True)

    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    index_file = os.path.join(templates_dir, "index.html")

    @app.get("/", response_class=FileResponse)
    async def get_index():
        return FileResponse(index_file)

    @app.get("/video_feed")
    def video_feed():
        def frame_generator():
            while True:
                jpeg = tracker.get_latest_jpeg()
                if jpeg is not None:
                    yield (b"--frame\r\n"
                           b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n")
                time.sleep(0.033)  # ~30 FPS

        return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

    @app.websocket("/ws")
    async def websocket_telemetry(websocket: WebSocket):
        await websocket.accept()
        try:
            while True:
                payload = monitor.get_status_payload(ear=tracker.current_ear, fps=tracker.fps)
                await websocket.send_text(json.dumps(payload))
                await asyncio.sleep(0.04)  # 25 updates/sec
        except WebSocketDisconnect:
            pass
        except Exception:
            pass

    @app.post("/api/monitor/start")
    def start_monitoring():
        monitor.start_monitoring()
        return {"success": True, "message": "Monitoring started"}

    @app.post("/api/monitor/stop")
    def stop_monitoring():
        monitor.stop_monitoring()
        return {"success": True, "message": "Monitoring stopped"}

    @app.get("/api/status")
    def get_status():
        return monitor.get_status_payload(ear=tracker.current_ear, fps=tracker.fps)

    @app.get("/api/history")
    def get_history(limit: int = 50):
        return {"incidents": history.get_incidents(limit)}

    @app.post("/api/history/clear")
    def clear_history():
        history.clear()
        return {"success": True, "message": "History cleared"}

    @app.get("/api/history/export_csv")
    def export_csv():
        csv_data = history.to_csv()
        return Response(content=csv_data, media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=incident_history.csv"})

    @app.get("/api/settings")
    def get_settings():
        return {
            "ear_threshold": config.ear_threshold,
            "eye_closed_time_sec": config.eye_closed_time_sec,
            "face_hidden_time_sec": config.face_hidden_time_sec,
            "person_absent_time_sec": config.person_absent_time_sec,
            "alarm_enabled": config.alarm_enabled,
            "alarm_volume": config.alarm_volume,
            "auto_silence_on_recovery": config.auto_silence_on_recovery
        }

    @app.post("/api/settings")
    def update_settings(payload: SettingsPayload):
        config.ear_threshold = payload.ear_threshold
        config.eye_closed_time_sec = payload.eye_closed_time_sec
        config.face_hidden_time_sec = payload.face_hidden_time_sec
        config.person_absent_time_sec = payload.person_absent_time_sec
        config.alarm_enabled = payload.alarm_enabled
        config.alarm_volume = payload.alarm_volume
        config.auto_silence_on_recovery = payload.auto_silence_on_recovery

        alarm.set_volume(payload.alarm_volume)
        return {"success": True, "message": "Settings updated successfully"}

    @app.post("/api/alarm/test")
    def test_alarm():
        alarm.trigger_test_beep()
        return {"success": True, "message": "Audio test triggered"}

    @app.post("/api/alarm/mute_toggle")
    def toggle_mute():
        alarm.set_muted(not alarm.muted)
        return {"success": True, "muted": alarm.muted}

    return app
