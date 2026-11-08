#!/usr/bin/env python3
"""
SentinelVision AI: Automated System Test & Verification Script
Runs end-to-end unit tests on all core vision, audio, state, API, and C++ components.
"""

import sys
import os
import time
import subprocess
import urllib.request
import numpy as np

# Ensure root directory in path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

def run_tests():
    print("=" * 65)
    print("      SENTINELVISION AI: FULL SYSTEM VERIFICATION SUITE       ")
    print("=" * 65)

    passed_count = 0
    total_tests = 5

    # -------------------------------------------------------------
    # TEST 1: Webcam & Hardware Capture
    # -------------------------------------------------------------
    print("\n[TEST 1/5] Checking Laptop Webcam Access...")
    import cv2
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)

    if cap.isOpened():
        ret, frame = cap.read()
        if ret and frame is not None:
            h, w, c = frame.shape
            print(f"  [PASS] Camera 0 online & operational ({w}x{h}, {c} channels).")
            passed_count += 1
        else:
            print("  [WARN] Camera opened but frame returned None.")
        cap.release()
    else:
        print("  [WARN] Camera 0 could not be opened (may be in use by another app).")

    # -------------------------------------------------------------
    # TEST 2: Neural Models Integrity
    # -------------------------------------------------------------
    print("\n[TEST 2/5] Checking MediaPipe Neural Network Models...")
    face_model_path = os.path.join(current_dir, "models", "face_landmarker.task")
    hand_model_path = os.path.join(current_dir, "models", "hand_landmarker.task")

    face_exists = os.path.exists(face_model_path) and os.path.getsize(face_model_path) > 1000000
    hand_exists = os.path.exists(hand_model_path) and os.path.getsize(hand_model_path) > 1000000

    print(f"  -> Face Mesh Model ({face_model_path}): {'EXISTS (' + str(os.path.getsize(face_model_path)) + ' bytes)' if face_exists else 'MISSING'}")
    print(f"  -> Hand Model ({hand_model_path}): {'EXISTS (' + str(os.path.getsize(hand_model_path)) + ' bytes)' if hand_exists else 'MISSING'}")

    if face_exists and hand_exists:
        print("  [PASS] All neural models validated.")
        passed_count += 1
    else:
        print("  [FAIL] Neural model files missing.")

    # -------------------------------------------------------------
    # TEST 3: State Machine, Blink Filter & Alarm Triggers
    # -------------------------------------------------------------
    print("\n[TEST 3/5] Testing EAR Mathematics, Blink Discrimination & Alarms...")
    from src.config import MonitorConfig
    from src.alarm_manager import AlarmManager
    from src.history_buffer import HistoryBuffer
    from src.state_monitor import StateMonitor

    cfg = MonitorConfig()
    alarm_mgr = AlarmManager(cfg.alarm_sound_path, cfg.warning_sound_path)
    hist_buf = HistoryBuffer()
    monitor = StateMonitor(cfg, alarm_mgr, hist_buf)
    monitor.start_monitoring()

    # Step A: Normal state
    monitor.update(face_detected=True, face_covered=False, ear=0.33, left_ear=0.33, right_ear=0.33)
    s1 = monitor.get_status_payload(0.33, 30.0)
    assert s1["face_status"] == "DETECTED" and s1["eye_status"] == "OPEN", "Normal state failed"

    # Step B: Blink filter (0.12s closure) -> NO alarm, blinks++
    monitor.update(face_detected=True, face_covered=False, ear=0.15, left_ear=0.15, right_ear=0.15)
    time.sleep(0.12)
    monitor.update(face_detected=True, face_covered=False, ear=0.33, left_ear=0.33, right_ear=0.33)
    s2 = monitor.get_status_payload(0.33, 30.0)
    assert s2["blink_count"] == 1 and s2["alarm_state"] == "NORMAL", "Blink filter failed"
    print(f"  -> Natural blink correctly detected (Blinks = {s2['blink_count']}, False Alarms = 0).")

    # Step C: Prolonged eye closure (1.1s closure) -> ALARM (User requested 1 sec)
    print("  -> Simulating prolonged closure for 1.1s...")
    for _ in range(12):
        monitor.update(face_detected=True, face_covered=False, ear=0.12, left_ear=0.12, right_ear=0.12)
        time.sleep(0.1)
    s3 = monitor.get_status_payload(0.12, 30.0)
    assert s3["alarm_state"] == "ACTIVE_ALARM", "Prolonged closure alarm failed"
    print(f"  -> Prolonged closure alarm triggered successfully: {s3['warning_message']}")

    # Step D: Recovery auto-silence
    monitor.update(face_detected=True, face_covered=False, ear=0.34, left_ear=0.34, right_ear=0.34)
    s4 = monitor.get_status_payload(0.34, 30.0)
    assert s4["alarm_state"] == "NORMAL", "Auto-silence failed"
    print("  -> Auto-silencing verified: Alarm stopped immediately upon eye opening.")

    # Step E: Face covered
    print("  -> Simulating face covered by hands for 1.1s...")
    for _ in range(12):
        monitor.update(face_detected=False, face_covered=True, ear=0.0, left_ear=0.0, right_ear=0.0)
        time.sleep(0.1)
    s5 = monitor.get_status_payload(0.0, 30.0)
    assert s5["alarm_state"] == "ACTIVE_ALARM" and s5["face_status"] == "HIDDEN", "Face covered failed"
    print(f"  -> Face covered alarm triggered successfully: {s5['warning_message']}")

    monitor.stop_monitoring()
    print("  [PASS] State Machine and Detection Logic validated 100%.")
    passed_count += 1

    # -------------------------------------------------------------
    # TEST 4: Live Web Server & Telemetry Endpoints
    # -------------------------------------------------------------
    print("\n[TEST 4/5] Testing FastAPI Server & Endpoints...")
    server_proc = subprocess.Popen(
        [sys.executable, "run.py", "--port", "8095", "--no-browser"],
        cwd=current_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # Wait for server to bind and respond
    server_online = False
    for attempt in range(20):
        time.sleep(0.5)
        try:
            with urllib.request.urlopen("http://localhost:8095/api/status", timeout=1.0) as r:
                if r.status == 200:
                    server_online = True
                    break
        except Exception:
            continue

    if not server_online:
        out, err = server_proc.communicate(timeout=2)
        print("  [FAIL] Server failed to start. Stdout:", out, "Stderr:", err)
        assert False, "Server did not respond within 10s"

    try:
        # Check Dashboard HTML
        with urllib.request.urlopen("http://localhost:8095/") as r:
            assert r.status == 200, "Dashboard root failed"
            html_bytes = len(r.read())
            print(f"  -> Dashboard HTML: HTTP 200 OK ({html_bytes} bytes rendered)")

        # Check API Status
        with urllib.request.urlopen("http://localhost:8095/api/status") as r:
            assert r.status == 200, "API status failed"
            print("  -> REST Endpoint /api/status: HTTP 200 OK")

        # Check API Settings
        with urllib.request.urlopen("http://localhost:8095/api/settings") as r:
            assert r.status == 200, "API settings failed"
            print("  -> REST Endpoint /api/settings: HTTP 200 OK")

        # Check History
        with urllib.request.urlopen("http://localhost:8095/api/history") as r:
            assert r.status == 200, "API history failed"
            print("  -> REST Endpoint /api/history: HTTP 200 OK")

        print("  [PASS] Web Dashboard & REST API endpoints operational.")
        passed_count += 1
    finally:
        server_proc.terminate()
        server_proc.wait()

    # -------------------------------------------------------------
    # TEST 5: Standalone C++ Engine
    # -------------------------------------------------------------
    print("\n[TEST 5/5] Testing Standalone C++ Monitoring Binary...")
    cpp_binary = os.path.join(current_dir, "cpp_engine", "monitor_cpp.exe")
    if os.path.exists(cpp_binary):
        print(f"  -> C++ Executable verified: {cpp_binary} ({os.path.getsize(cpp_binary)} bytes)")
        cpp_proc = subprocess.Popen([cpp_binary], cwd=os.path.join(current_dir, "cpp_engine"))
        
        cpp_online = False
        for _ in range(15):
            time.sleep(0.4)
            try:
                with urllib.request.urlopen("http://localhost:8080/api/status", timeout=1.0) as r:
                    if r.status == 200:
                        cpp_online = True
                        break
            except Exception:
                continue

        try:
            if cpp_online:
                print("  -> C++ WinSock2 Web API (port 8080): HTTP 200 OK")
                print("  [PASS] C++ Native Engine execution verified.")
                passed_count += 1
            else:
                print("  [FAIL] C++ server did not respond on port 8080.")
        finally:
            cpp_proc.terminate()
            cpp_proc.wait()
    else:
        print("  [FAIL] monitor_cpp.exe missing.")

    # -------------------------------------------------------------
    # FINAL SUMMARY
    # -------------------------------------------------------------
    print("\n" + "=" * 65)
    print(f"   FINAL VERIFICATION RESULT: {passed_count}/{total_tests} TESTS PASSED")
    print("=" * 65)
    if passed_count == total_tests:
        print(">> THE ENTIRE SYSTEM IS FULLY WORKING AND READY FOR LIVE USE! <<\n")
    else:
        print(">> SOME COMPONENTS REQUIRE ATTENTION. <<\n")

if __name__ == "__main__":
    run_tests()
