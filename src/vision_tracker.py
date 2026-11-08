import cv2
import numpy as np
import time
import threading
import os
from typing import Tuple, Optional
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from .config import MonitorConfig
from .ear_calculator import EyeAspectCalculator
from .state_monitor import StateMonitor

class VisionTracker:
    """
    High-performance webcam capture and computer vision pipeline using MediaPipe
    Face and Hand Landmark models with real-time HUD rendering.
    """
    def __init__(self, config: MonitorConfig, state_monitor: StateMonitor, ear_calculator: EyeAspectCalculator):
        self.config = config
        self.state_monitor = state_monitor
        self.ear_calc = ear_calculator

        self.cap: Optional[cv2.VideoCapture] = None
        self.running = False
        self.lock = threading.Lock()

        # Latest processed frame and JPEG bytes for streaming
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_jpeg: Optional[bytes] = None

        # Telemetry metrics
        self.fps = 0.0
        self.current_ear = 0.0
        self.left_ear = 0.0
        self.right_ear = 0.0
        self.face_found = False
        self.face_covered = False
        self.last_face_seen_time = 0.0

        # MediaPipe models
        self.face_landmarker = None
        self.hand_landmarker = None

        self._init_models()

    def _init_models(self):
        try:
            print("[VisionTracker] Loading MediaPipe Face Landmarker model...")
            face_options = vision.FaceLandmarkerOptions(
                base_options=python.BaseOptions(model_asset_path=self.config.face_model_path),
                output_face_blendshapes=True,
                output_facial_transformation_matrixes=False,
                num_faces=1,
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            self.face_landmarker = vision.FaceLandmarker.create_from_options(face_options)
            print("[VisionTracker] Face Landmarker loaded successfully.")

            if os.path.exists(self.config.hand_model_path):
                print("[VisionTracker] Loading MediaPipe Hand Landmarker model...")
                hand_options = vision.HandLandmarkerOptions(
                    base_options=python.BaseOptions(model_asset_path=self.config.hand_model_path),
                    num_hands=2,
                    min_hand_detection_confidence=0.45,
                    min_hand_presence_confidence=0.45,
                    min_tracking_confidence=0.45
                )
                self.hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)
                print("[VisionTracker] Hand Landmarker loaded successfully.")
        except Exception as e:
            print(f"[VisionTracker] Error initializing MediaPipe models: {e}")

    def start_camera(self) -> bool:
        with self.lock:
            if self.running:
                return True

            active_index = self.config.camera_index
            print(f"[VisionTracker] Opening webcam (index {active_index})...")
            # Try DirectShow backend for faster Windows webcam binding
            self.cap = cv2.VideoCapture(active_index, cv2.CAP_DSHOW)
            if not self.cap.isOpened():
                self.cap = cv2.VideoCapture(active_index)

            # Check if camera opened and if another index has active illuminated video frames
            if self.cap.isOpened():
                ret, test_frame = self.cap.read()
                if ret and test_frame is not None and test_frame.mean() < 1.0:
                    print(f"[VisionTracker] Camera index {active_index} opened but returned black frames (Iriun waiting for phone). Scanning alternate cameras...")
                    for alt_idx in [1, 0, 2]:
                        if alt_idx == active_index:
                            continue
                        alt_cap = cv2.VideoCapture(alt_idx, cv2.CAP_DSHOW)
                        if alt_cap.isOpened():
                            a_ret, a_frame = alt_cap.read()
                            if a_ret and a_frame is not None and a_frame.mean() > 2.0:
                                print(f"[VisionTracker] Found active streaming camera at index {alt_idx}!")
                                self.cap.release()
                                self.cap = alt_cap
                                active_index = alt_idx
                                break
                            alt_cap.release()
            elif not self.cap.isOpened():
                for alt_idx in [1, 2, 0]:
                    print(f"[VisionTracker] Probing alternate camera index {alt_idx}...")
                    alt_cap = cv2.VideoCapture(alt_idx, cv2.CAP_DSHOW)
                    if alt_cap.isOpened():
                        self.cap = alt_cap
                        active_index = alt_idx
                        print(f"[VisionTracker] Connected to camera index {active_index}.")
                        break

            if not self.cap.isOpened():
                print("[VisionTracker] Failed to open webcam. Make sure your camera or Iriun Webcam is connected.")
                return False

            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.frame_width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.frame_height)
            self.cap.set(cv2.CAP_PROP_FPS, self.config.target_fps)

            self.running = True
            self.worker_thread = threading.Thread(target=self._processing_loop, daemon=True)
            self.worker_thread.start()
            print(f"[VisionTracker] Camera processing thread started on camera index {active_index}.")
            return True

    def stop_camera(self):
        with self.lock:
            self.running = False
            if self.cap:
                self.cap.release()
                self.cap = None
            print("[VisionTracker] Camera stopped.")

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self.lock:
            return self.latest_jpeg

    def _processing_loop(self):
        prev_time = time.time()
        frame_count = 0
        fps_timer = time.time()

        while self.running:
            if not self.cap or not self.cap.isOpened():
                time.sleep(0.05)
                continue

            ret, frame = self.cap.read()
            if not ret or frame is None:
                time.sleep(0.02)
                continue

            # Mirror frame horizontally for natural webcam interaction
            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape

            # Convert BGR to RGB for MediaPipe
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

            face_detected = False
            face_covered = False
            face_bbox = None
            landmarks = None

            # 1. Run Face Landmarker
            if self.face_landmarker:
                try:
                    face_result = self.face_landmarker.detect(mp_image)
                    if face_result.face_landmarks and len(face_result.face_landmarks) > 0:
                        landmarks = face_result.face_landmarks[0]
                        face_detected = True
                        self.last_face_seen_time = time.time()

                        # Compute face bounding box
                        xs = [int(lm.x * w) for lm in landmarks]
                        ys = [int(lm.y * h) for lm in landmarks]
                        min_x, max_x = max(0, min(xs)), min(w, max(xs))
                        min_y, max_y = max(0, min(ys)), min(h, max(ys))
                        face_bbox = (min_x, min_y, max_x - min_x, max_y - min_y)
                except Exception as e:
                    pass

            # 2. Run Hand Landmarker for face covering detection
            hand_in_face_area = False
            if self.hand_landmarker:
                try:
                    hand_result = self.hand_landmarker.detect(mp_image)
                    if hand_result.hand_landmarks and len(hand_result.hand_landmarks) > 0:
                        for hand in hand_result.hand_landmarks:
                            # If face exists, check if hand overlaps face bounding box
                            if face_bbox:
                                fx, fy, fw, fh = face_bbox
                                for h_lm in hand:
                                    hx, hy = int(h_lm.x * w), int(h_lm.y * h)
                                    if fx <= hx <= (fx + fw) and fy <= hy <= (fy + fh):
                                        hand_in_face_area = True
                                        break
                            else:
                                # If no face detected but hand is held right in front of center frame
                                for h_lm in hand:
                                    hx, hy = int(h_lm.x * w), int(h_lm.y * h)
                                    if (w * 0.25 <= hx <= w * 0.75) and (h * 0.2 <= hy <= h * 0.8):
                                        hand_in_face_area = True
                                        break
                            if hand_in_face_area:
                                break
                except Exception:
                    pass

            if hand_in_face_area:
                face_covered = True
            elif not face_detected and (time.time() - self.last_face_seen_time < 3.5) and frame.mean() > 8.0:
                # Subject was present, but face is now obstructed by hands, paper, phone or book
                face_covered = True

            # 3. Compute EAR and eye landmarks if face is detected
            avg_ear, left_ear, right_ear = 0.0, 0.0, 0.0
            left_pts, right_pts = [], []
            if face_detected and landmarks:
                avg_ear, left_ear, right_ear, left_pts, right_pts = self.ear_calc.compute(landmarks, w, h)

                # Check neural blendshapes for eye blink confirmation
                if hasattr(face_result, 'face_blendshapes') and face_result.face_blendshapes:
                    blink_l = 0.0
                    blink_r = 0.0
                    for category in face_result.face_blendshapes[0]:
                        if category.category_name == 'eyeBlinkLeft':
                            blink_l = category.score
                        elif category.category_name == 'eyeBlinkRight':
                            blink_r = category.score
                    if blink_l > 0.45 and blink_r > 0.45:
                        avg_ear = min(avg_ear, 0.12)

                self.current_ear = avg_ear
                self.left_ear = left_ear
                self.right_ear = right_ear
            else:
                self.ear_calc.reset()
                self.current_ear = 0.0

            self.face_found = face_detected
            self.face_covered = face_covered

            # 4. Update State Monitor
            self.state_monitor.update(
                face_detected=face_detected,
                face_covered=face_covered,
                ear=self.current_ear,
                left_ear=self.left_ear,
                right_ear=self.right_ear
            )

            # 5. Calculate FPS
            frame_count += 1
            now = time.time()
            if now - fps_timer >= 0.5:
                self.fps = frame_count / (now - fps_timer)
                frame_count = 0
                fps_timer = now

            # 6. Render HUD overlays on frame
            display_frame = self._render_hud(frame, face_bbox, landmarks, left_pts, right_pts)

            # 7. Compress to JPEG for Web Stream
            ret_encode, jpeg_bytes = cv2.imencode(".jpg", display_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ret_encode:
                with self.lock:
                    self.latest_frame = display_frame
                    self.latest_jpeg = jpeg_bytes.tobytes()

            # Maintain frame pacing (~30 FPS)
            elapsed = time.time() - prev_time
            sleep_time = max(0.001, (1.0 / self.config.target_fps) - elapsed)
            time.sleep(sleep_time)
            prev_time = time.time()

    def _render_hud(self, frame: np.ndarray, bbox, landmarks, left_pts, right_pts) -> np.ndarray:
        h, w, _ = frame.shape
        hud = frame.copy()

        is_alarm = (self.state_monitor.alarm_state == "ACTIVE_ALARM")
        is_monitoring = self.state_monitor.is_monitoring

        # Perimeter Alarm Warning Flasher
        if is_alarm:
            pulse = int(abs(np.sin(time.time() * 8.0)) * 255)
            border_color = (0, 0, pulse)
            cv2.rectangle(hud, (0, 0), (w - 1, h - 1), border_color, 8)
            # Alarm Banner
            cv2.rectangle(hud, (0, 0), (w, 50), (0, 0, 180), -1)
            cv2.putText(hud, f"!! ALARM: {self.state_monitor.active_warning} !!", (20, 35),
                        cv2.FONT_HERSHEY_DUPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)

        # Draw Face Bounding Box HUD
        if bbox:
            x, y, bw, bh = bbox
            color = (0, 230, 255) if not is_alarm else (0, 0, 255)
            # Modern corner brackets
            corner_len = int(min(bw, bh) * 0.2)
            t = 2
            # Top-Left
            cv2.line(hud, (x, y), (x + corner_len, y), color, t)
            cv2.line(hud, (x, y), (x, y + corner_len), color, t)
            # Top-Right
            cv2.line(hud, (x + bw, y), (x + bw - corner_len, y), color, t)
            cv2.line(hud, (x + bw, y), (x + bw, y + corner_len), color, t)
            # Bottom-Left
            cv2.line(hud, (x, y + bh), (x + corner_len, y + bh), color, t)
            cv2.line(hud, (x, y + bh), (x, y + bh - corner_len), color, t)
            # Bottom-Right
            cv2.line(hud, (x + bw, y + bh), (x + bw - corner_len, y + bh), color, t)
            cv2.line(hud, (x + bw, y + bh), (x + bw, y + bh - corner_len), color, t)

            # Face label
            face_tag = "FACE DETECTED" if not self.face_covered else "FACE COVERED / OCCLUDED"
            tag_color = (0, 255, 120) if not self.face_covered else (0, 140, 255)
            cv2.putText(hud, face_tag, (x, max(20, y - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, tag_color, 2, cv2.LINE_AA)

        # Draw Eye Landmark Contours
        if left_pts and right_pts:
            eye_color = (0, 255, 120) if self.state_monitor.eye_status == "OPEN" else (0, 0, 255)
            for pt in left_pts:
                cv2.circle(hud, (int(pt[0]), int(pt[1])), 2, eye_color, -1)
            for pt in right_pts:
                cv2.circle(hud, (int(pt[0]), int(pt[1])), 2, eye_color, -1)

        # Bottom-Left Telemetry Box
        box_y1 = h - 110
        cv2.rectangle(hud, (15, box_y1), (340, h - 15), (15, 23, 42), -1)
        cv2.rectangle(hud, (15, box_y1), (340, h - 15), (51, 65, 85), 1)

        status_text = "MONITORING ACTIVE" if is_monitoring else "SYSTEM STANDBY"
        status_col = (0, 255, 120) if is_monitoring else (148, 163, 184)
        cv2.putText(hud, status_text, (28, box_y1 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, status_col, 2, cv2.LINE_AA)

        ear_col = (0, 255, 120) if self.current_ear >= self.config.ear_threshold else (0, 0, 255)
        cv2.putText(hud, f"EAR: {self.current_ear:.3f} (Thresh: {self.config.ear_threshold:.2f})",
                    (28, box_y1 + 52), cv2.FONT_HERSHEY_SIMPLEX, 0.5, ear_col, 1, cv2.LINE_AA)

        cv2.putText(hud, f"Eye: {self.state_monitor.eye_status} | Face: {self.state_monitor.face_status}",
                    (28, box_y1 + 75), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (226, 232, 240), 1, cv2.LINE_AA)

        # Top-Right FPS and Status Tag
        cv2.putText(hud, f"{self.fps:.1f} FPS", (w - 110, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (148, 163, 184), 1, cv2.LINE_AA)

        if frame.mean() < 2.0:
            cv2.putText(hud, "Waiting for Iriun Webcam Feed...", (max(10, w // 2 - 220), h // 2 - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 210, 255), 2, cv2.LINE_AA)
            cv2.putText(hud, "Please ensure Iriun app is open on your phone", (max(10, w // 2 - 250), h // 2 + 25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1, cv2.LINE_AA)

        return hud
