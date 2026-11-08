import time
import threading
from typing import Dict, Any, Optional
from .config import MonitorConfig
from .alarm_manager import AlarmManager
from .history_buffer import HistoryBuffer

class StateMonitor:
    """
    Core state evaluation engine. Tracks temporal transitions for:
    - Prolonged eye closure (filters out natural blinking)
    - Face occlusion/covering
    - Person absence
    """
    def __init__(self, config: MonitorConfig, alarm_manager: AlarmManager, history_buffer: HistoryBuffer):
        self.config = config
        self.alarm_mgr = alarm_manager
        self.history = history_buffer

        self.is_monitoring = False
        self._lock = threading.Lock()

        # Timers (stores timestamp when condition started)
        self._eyes_closed_start: Optional[float] = None
        self._face_hidden_start: Optional[float] = None
        self._person_absent_start: Optional[float] = None

        # Statistics & Metrics
        self.blink_count = 0
        self.eye_closed_incident_count = 0
        self.face_covered_incident_count = 0
        self.person_absent_incident_count = 0
        self.session_start_time: Optional[float] = None

        # Current State
        self.face_status = "ABSENT"        # DETECTED | HIDDEN | ABSENT
        self.eye_status = "UNKNOWN"         # OPEN | CLOSED | UNKNOWN
        self.alarm_state = "NORMAL"         # NORMAL | ACTIVE_ALARM
        self.active_warning = ""
        self.active_incident_type = None

        # Real-time timers in seconds
        self.eyes_closed_duration = 0.0
        self.face_hidden_duration = 0.0
        self.person_absent_duration = 0.0

    def start_monitoring(self):
        with self._lock:
            self.is_monitoring = True
            self.session_start_time = time.time()
            self._eyes_closed_start = None
            self._face_hidden_start = None
            self._person_absent_start = None
            self.active_incident_type = None
            self.alarm_state = "NORMAL"
            self.active_warning = ""

    def stop_monitoring(self):
        with self._lock:
            self.is_monitoring = False
            self.alarm_mgr.stop_alarm()
            self.alarm_state = "NORMAL"
            self.active_warning = ""
            self.eyes_closed_duration = 0.0
            self.face_hidden_duration = 0.0
            self.person_absent_duration = 0.0

    def update(self, face_detected: bool, face_covered: bool, ear: float, left_ear: float, right_ear: float):
        with self._lock:
            if not self.is_monitoring:
                self.face_status = "IDLE"
                self.eye_status = "IDLE"
                return

            now = time.time()

            # 1. Determine Face Status
            if not face_detected and not face_covered:
                self.face_status = "ABSENT"
            elif face_covered:
                self.face_status = "HIDDEN"
            else:
                self.face_status = "DETECTED"

            # 2. Determine Eye Status
            if self.face_status == "DETECTED":
                if ear < self.config.ear_threshold:
                    self.eye_status = "CLOSED"
                else:
                    self.eye_status = "OPEN"
            else:
                self.eye_status = "UNKNOWN"

            # 3. Process Eye Closure Duration
            self._process_eye_closure(now)

            # 4. Process Face Hidden Duration
            self._process_face_hidden(now)

            # 5. Process Person Absence Duration
            self._process_person_absent(now)

            # 6. Evaluate Alarm State
            self._evaluate_alarm()

            # Record telemetry point
            self.history.add_telemetry(
                timestamp=now,
                ear=ear,
                is_face_detected=(self.face_status == "DETECTED"),
                is_eye_closed=(self.eye_status == "CLOSED"),
                is_alarm=(self.alarm_state == "ACTIVE_ALARM")
            )

    def _process_eye_closure(self, now: float):
        if self.face_status == "DETECTED" and self.eye_status == "CLOSED":
            if self._eyes_closed_start is None:
                self._eyes_closed_start = now
            self.eyes_closed_duration = now - self._eyes_closed_start

            # Trigger condition
            if self.eyes_closed_duration >= self.config.eye_closed_time_sec:
                if self.active_incident_type != "PROLONGED_EYES_CLOSED":
                    self.active_incident_type = "PROLONGED_EYES_CLOSED"
                    self.eye_closed_incident_count += 1
                    self.active_warning = "CRITICAL: Eyes closed for extended duration!"
                    self.history.add_incident(
                        incident_type="Eyes Closed",
                        severity="Critical",
                        duration=self.eyes_closed_duration,
                        details=f"Subject eyes closed for >= {self.config.eye_closed_time_sec:.1f}s"
                    )
        else:
            # Eyes are open or face is not detected
            if self._eyes_closed_start is not None:
                duration = now - self._eyes_closed_start
                # Natural blink filter
                if 0.08 <= duration <= self.config.blink_max_duration_sec:
                    self.blink_count += 1

                self._eyes_closed_start = None
                self.eyes_closed_duration = 0.0

                if self.active_incident_type == "PROLONGED_EYES_CLOSED":
                    self.active_incident_type = None

    def _process_face_hidden(self, now: float):
        if self.face_status == "HIDDEN":
            if self._face_hidden_start is None:
                self._face_hidden_start = now
            self.face_hidden_duration = now - self._face_hidden_start

            if self.face_hidden_duration >= self.config.face_hidden_time_sec:
                if self.active_incident_type != "FACE_COVERED":
                    self.active_incident_type = "FACE_COVERED"
                    self.face_covered_incident_count += 1
                    self.active_warning = "ALERT: Face is covered or obstructed!"
                    self.history.add_incident(
                        incident_type="Face Covered",
                        severity="High",
                        duration=self.face_hidden_duration,
                        details=f"Face covered by hands or objects >= {self.config.face_hidden_time_sec:.1f}s"
                    )
        else:
            if self._face_hidden_start is not None:
                self._face_hidden_start = None
                self.face_hidden_duration = 0.0
                if self.active_incident_type == "FACE_COVERED":
                    self.active_incident_type = None

    def _process_person_absent(self, now: float):
        if self.face_status == "ABSENT":
            if self._person_absent_start is None:
                self._person_absent_start = now
            self.person_absent_duration = now - self._person_absent_start

            if self.person_absent_duration >= self.config.person_absent_time_sec:
                if self.active_incident_type != "PERSON_ABSENT":
                    self.active_incident_type = "PERSON_ABSENT"
                    self.person_absent_incident_count += 1
                    self.active_warning = "ALERT: Person left camera frame / No face visible!"
                    self.history.add_incident(
                        incident_type="Person Absent",
                        severity="High",
                        duration=self.person_absent_duration,
                        details=f"No subject detected in frame >= {self.config.person_absent_time_sec:.1f}s"
                    )
        else:
            if self._person_absent_start is not None:
                self._person_absent_start = None
                self.person_absent_duration = 0.0
                if self.active_incident_type == "PERSON_ABSENT":
                    self.active_incident_type = None

    def _evaluate_alarm(self):
        if self.active_incident_type is not None:
            self.alarm_state = "ACTIVE_ALARM"
            if self.config.alarm_enabled and not self.alarm_mgr.is_alarm_active:
                self.alarm_mgr.start_alarm(loop=True)
        else:
            self.alarm_state = "NORMAL"
            self.active_warning = ""
            if self.config.auto_silence_on_recovery and self.alarm_mgr.is_alarm_active:
                self.alarm_mgr.stop_alarm()

    def get_status_payload(self, ear: float, fps: float) -> Dict[str, Any]:
        with self._lock:
            uptime = round(time.time() - self.session_start_time, 1) if (self.is_monitoring and self.session_start_time) else 0.0
            return {
                "is_monitoring": self.is_monitoring,
                "face_status": self.face_status,
                "eye_status": self.eye_status,
                "alarm_state": self.alarm_state,
                "current_ear": round(ear, 3),
                "ear_threshold": self.config.ear_threshold,
                "fps": round(fps, 1),
                "blink_count": self.blink_count,
                "eye_closed_incidents": self.eye_closed_incident_count,
                "face_covered_incidents": self.face_covered_incident_count,
                "person_absent_incidents": self.person_absent_incident_count,
                "total_incidents": (self.eye_closed_incident_count + self.face_covered_incident_count + self.person_absent_incident_count),
                "eyes_closed_timer": round(self.eyes_closed_duration, 1),
                "face_hidden_timer": round(self.face_hidden_duration, 1),
                "person_absent_timer": round(self.person_absent_duration, 1),
                "warning_message": self.active_warning,
                "session_uptime": uptime,
                "alarm_muted": self.alarm_mgr.muted,
                "alarm_volume": int(self.config.alarm_volume * 100)
            }
