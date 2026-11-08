import threading
import time
from collections import deque
from typing import List, Dict, Any

class HistoryBuffer:
    """
    Maintains a sliding-window buffer of recent monitoring frames
    and a structured record of all detection incidents.
    """
    def __init__(self, max_incidents: int = 200, max_telemetry_points: int = 120):
        self.max_incidents = max_incidents
        self.max_telemetry_points = max_telemetry_points
        self._incidents = deque(maxlen=max_incidents)
        self._telemetry_history = deque(maxlen=max_telemetry_points)
        self._incident_counter = 0
        self._lock = threading.Lock()

    def add_telemetry(self, timestamp: float, ear: float, is_face_detected: bool, is_eye_closed: bool, is_alarm: bool):
        with self._lock:
            self._telemetry_history.append({
                "time": timestamp,
                "ear": round(ear, 3),
                "face": is_face_detected,
                "eye_closed": is_eye_closed,
                "alarm": is_alarm
            })

    def add_incident(self, incident_type: str, severity: str, duration: float, details: str):
        with self._lock:
            self._incident_counter += 1
            now_str = time.strftime("%Y-%m-%d %H:%M:%S")
            record = {
                "id": self._incident_counter,
                "timestamp": now_str,
                "type": incident_type,
                "severity": severity,
                "duration": round(duration, 1),
                "details": details
            }
            self._incidents.append(record)
            return record

    def get_incidents(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock:
            # Return newest incidents first
            records = list(self._incidents)
            records.reverse()
            return records[:limit]

    def get_telemetry_series(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._telemetry_history)

    def clear(self):
        with self._lock:
            self._incidents.clear()
            self._telemetry_history.clear()

    def to_csv(self) -> str:
        with self._lock:
            lines = ["ID,Timestamp,Type,Severity,Duration (s),Details"]
            for r in self._incidents:
                clean_details = r["details"].replace(",", ";")
                lines.append(f"{r['id']},{r['timestamp']},{r['type']},{r['severity']},{r['duration']},{clean_details}")
            return "\n".join(lines)
