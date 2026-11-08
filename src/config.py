from dataclasses import dataclass, field
import os

@dataclass
class MonitorConfig:
    # Camera settings
    camera_index: int = 0
    frame_width: int = 1280
    frame_height: int = 720
    target_fps: int = 30

    # Detection Thresholds
    ear_threshold: float = 0.22             # Eye Aspect Ratio threshold (below this is closed)
    eye_closed_time_sec: float = 1.0        # Duration eyes closed before alarm triggers (1.0s as requested)
    blink_max_duration_sec: float = 0.35    # Max duration for a normal natural blink
    
    face_hidden_time_sec: float = 1.0       # Duration face covered/hidden before alarm (1.0s)
    person_absent_time_sec: float = 1.0     # Duration person absent before alarm (1.0s)

    # Alarm and Audio settings
    alarm_enabled: bool = True
    alarm_volume: float = 0.85              # 0.0 to 1.0
    auto_silence_on_recovery: bool = True   # Automatically stop alarm when user recovers
    
    # Paths
    base_dir: str = field(default_factory=lambda: os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    face_model_path: str = ""
    hand_model_path: str = ""
    alarm_sound_path: str = ""
    warning_sound_path: str = ""

    def __post_init__(self):
        if not self.face_model_path:
            self.face_model_path = os.path.join(self.base_dir, "models", "face_landmarker.task")
        if not self.hand_model_path:
            self.hand_model_path = os.path.join(self.base_dir, "models", "hand_landmarker.task")
        if not self.alarm_sound_path:
            self.alarm_sound_path = os.path.join(self.base_dir, "sounds", "alarm.wav")
        if not self.warning_sound_path:
            self.warning_sound_path = os.path.join(self.base_dir, "sounds", "warning.wav")
