#!/usr/bin/env python3
"""
SentinelVision AI: Real-Time Face and Eye Monitoring System
Main entry point launcher.
"""

import sys
import os
import time
import webbrowser
import threading
import uvicorn
import argparse

# Add current workspace to python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from src.config import MonitorConfig
from src.alarm_manager import AlarmManager
from src.history_buffer import HistoryBuffer
from src.ear_calculator import EyeAspectCalculator
from src.state_monitor import StateMonitor
from src.vision_tracker import VisionTracker
from src.web_server import create_app

def main():
    parser = argparse.ArgumentParser(description="SentinelVision AI - Face & Eye Monitoring System")
    parser.add_argument("--port", type=int, default=8000, help="Web dashboard port (default: 8000)")
    parser.add_argument("--camera", type=int, default=0, help="Webcam device index (default: 0)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically launch web browser")
    args = parser.parse_args()

    print("=" * 70)
    print("   SENTINELVISION AI: REAL-TIME FACE & EYE MONITORING SYSTEM")
    print("=" * 70)

    # 1. Initialize Configuration
    config = MonitorConfig(camera_index=args.camera)

    # 2. Initialize Subsystems
    print("[1/4] Initializing Audio & Alarm subsystem...")
    alarm_mgr = AlarmManager(
        alarm_sound_path=config.alarm_sound_path,
        warning_sound_path=config.warning_sound_path,
        volume=config.alarm_volume
    )

    print("[2/4] Initializing History and State Machine...")
    history_buf = HistoryBuffer(max_incidents=300)
    state_mon = StateMonitor(
        config=config,
        alarm_manager=alarm_mgr,
        history_buffer=history_buf
    )

    print("[3/4] Initializing MediaPipe Computer Vision Engine...")
    ear_calc = EyeAspectCalculator()
    tracker = VisionTracker(
        config=config,
        state_monitor=state_mon,
        ear_calculator=ear_calc
    )

    # Start camera capture
    camera_started = tracker.start_camera()
    if not camera_started:
        print("[Warning] Could not initialize webcam index", config.camera_index)
        print("          System will start in fallback standby mode.")

    # 3. Create Web Application
    print(f"[4/4] Starting Dashboard Server on port {args.port}...")
    app = create_app(
        config=config,
        tracker=tracker,
        monitor=state_mon,
        history=history_buf,
        alarm=alarm_mgr
    )

    dashboard_url = f"http://localhost:{args.port}"

    # Auto-open browser after 1.2s delay
    if not args.no_browser:
        def _open():
            time.sleep(1.2)
            print(f"[Browser] Launching dashboard at {dashboard_url} ...")
            webbrowser.open(dashboard_url)
        threading.Thread(target=_open, daemon=True).start()

    print(f"\n[READY] Web Dashboard: {dashboard_url}")
    print("[INFO] Press Ctrl+C in this terminal window to stop the server.\n")

    try:
        uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="warning")
    except KeyboardInterrupt:
        print("\n[Shutdown] Shutting down...")
    finally:
        state_mon.stop_monitoring()
        tracker.stop_camera()
        alarm_mgr.stop_alarm()
        print("[Shutdown] SentinelVision AI stopped cleanly.")

if __name__ == "__main__":
    main()
