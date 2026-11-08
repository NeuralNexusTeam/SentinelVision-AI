import pygame
import threading
import time
import os
import sys

class AlarmManager:
    """
    Manages audible alarm playback using Pygame with multi-threading,
    auto-silence, volume control, and native fallback.
    """
    def __init__(self, alarm_sound_path: str, warning_sound_path: str, volume: float = 0.85):
        self.alarm_sound_path = alarm_sound_path
        self.warning_sound_path = warning_sound_path
        self.volume = max(0.0, min(1.0, volume))
        self.is_alarm_active = False
        self.muted = False
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._alarm_thread = None

        self._init_audio()

    def _init_audio(self):
        try:
            if not pygame.mixer.get_init():
                # Initialize pygame mixer with standard 44.1kHz 16-bit stereo
                pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
            pygame.mixer.set_num_channels(8)
            print("[AlarmManager] Pygame audio subsystem initialized.")
        except Exception as e:
            print(f"[AlarmManager] Warning: Audio device initialization error: {e}")

    def set_volume(self, volume: float):
        with self._lock:
            self.volume = max(0.0, min(1.0, volume))
            try:
                if pygame.mixer.get_init():
                    for ch in range(pygame.mixer.get_num_channels()):
                        channel = pygame.mixer.Channel(ch)
                        channel.set_volume(self.volume)
            except Exception:
                pass

    def set_muted(self, muted: bool):
        with self._lock:
            self.muted = muted
            if muted and self.is_alarm_active:
                self.stop_alarm()

    def start_alarm(self, loop: bool = True):
        with self._lock:
            if self.is_alarm_active or self.muted:
                return

            self.is_alarm_active = True
            self._stop_event.clear()
            self._alarm_thread = threading.Thread(target=self._alarm_worker, args=(loop,), daemon=True)
            self._alarm_thread.start()

    def stop_alarm(self):
        with self._lock:
            if not self.is_alarm_active:
                return

            self.is_alarm_active = False
            self._stop_event.set()

            try:
                if pygame.mixer.get_init():
                    pygame.mixer.stop()
            except Exception:
                pass

    def trigger_test_beep(self):
        """Play a single short notification sound."""
        def _beep():
            try:
                if pygame.mixer.get_init() and os.path.exists(self.warning_sound_path):
                    sound = pygame.mixer.Sound(self.warning_sound_path)
                    sound.set_volume(self.volume)
                    sound.play()
                elif sys.platform == "win32":
                    import winsound
                    winsound.Beep(1200, 250)
            except Exception:
                pass

        threading.Thread(target=_beep, daemon=True).start()

    def _alarm_worker(self, loop: bool):
        try:
            has_pygame = pygame.mixer.get_init() is not None
            has_sound_file = os.path.exists(self.alarm_sound_path)

            if has_pygame and has_sound_file:
                sound = pygame.mixer.Sound(self.alarm_sound_path)
                sound.set_volume(self.volume)

                while not self._stop_event.is_set():
                    channel = sound.play()
                    while channel and channel.get_busy():
                        if self._stop_event.is_set():
                            channel.stop()
                            break
                        time.sleep(0.05)

                    if not loop or self._stop_event.is_set():
                        break
                    time.sleep(0.1)
            else:
                # Native Windows fallback tone
                if sys.platform == "win32":
                    import winsound
                    while not self._stop_event.is_set():
                        winsound.Beep(1400, 250)
                        if self._stop_event.is_set():
                            break
                        winsound.Beep(950, 200)
                        time.sleep(0.1)
        except Exception as e:
            print(f"[AlarmManager] Error during alarm playback: {e}")
        finally:
            self.is_alarm_active = False
