# SentinelVision AI: Real-Time Face and Eye Monitoring System (C++)

SentinelVision AI is a commercial-grade, high-performance C++ intelligent computer vision and real-time safety monitoring system designed for laptops and desktop workstations. It continuously monitors user alertness, eye state, and presence through the laptop's built-in webcam.

Built entirely in **modern C++** with native Windows WinSock2 networking, Win32 multimedia sound, high-speed circular buffers, and an interactive dark-themed dashboard.

---

## 1. Core Capabilities & Detection Logic

### 👁️ Real-Time Eye & Drowsiness Tracking
- **Eye Aspect Ratio (EAR) Algorithm**: Computes exact Euclidean eye aspect ratios from eyelid landmarks:
  $$\text{EAR} = \frac{\|P_2 - P_6\| + \|P_3 - P_5\|}{2 \cdot \|P_1 - P_4\|}$$
- **Natural Blink Discrimination**: Differentiates natural human blinks ($<0.4\text{s}$) from prolonged eye closures, incrementing the natural blink counter without triggering false alarms.
- **Prolonged Eye Closure Alarm**: Triggers an immediate audible siren and visual warning when eyes remain closed beyond the configurable threshold (default: $2.0\text{s}$).

### 👤 Face Occlusion & Covering Detection
- **Hand & Object Covering Detection**: Detects when a subject covers their face using their hands, clothing, or objects.
- **Occlusion Alert**: Triggers an alert when the face remains obstructed beyond the timeout (default: $1.5\text{s}$).

### 🚶 Person Absence Detection
- **Continuous Presence Verification**: Tracks whether an active subject is present in the webcam frame.
- **Departure Timeout Trigger**: Activates warning sirens and logs an incident if the user vacates the workstation (default: $2.5\text{s}$).

### 🚨 Audible Alarm System
- **Win32 Multimedia Audio (`PlaySoundA` / `Beep`)**: Hardware-accelerated local audio alarm playback with fallback.
- **Auto-Silence on Recovery**: Automatically ceases sirens the instant normal conditions return.
- **De-bouncing**: Prevents duplicate alarm triggers during continuous events.

---

## 2. Project Structure

```text
cameera/
├── include/
│   ├── Types.hpp                 # C++ Telemetry structs, enums, incident records
│   ├── ThreadSync.hpp            # Win32 Mutex, LockGuard, and synchronization
│   ├── EyeAspectCalculator.hpp   # Euclidean EAR mathematical algorithm
│   ├── HistoryRingBuffer.hpp     # O(1) circular ring buffer with JSON & CSV export
│   ├── NativeAlarmSystem.hpp     # Multi-threaded Win32 PlaySound & Beep audio controller
│   ├── FaceMonitor.hpp           # State machine, blink filter, duration tracking
│   └── HttpDashboardServer.hpp   # Embedded WinSock2 HTTP REST and dashboard server
├── src/
│   └── main.cpp                  # C++ application entry point
├── static/
│   ├── css/
│   │   └── dashboard.css         # Modern dark-themed dashboard styling
│   └── js/
│       └── app.js                # Live telemetry client, HUD rendering, REST API
├── templates/
│   └── index.html                # Professional operator dashboard UI
├── sounds/
│   ├── alarm.wav                 # Multi-tone emergency siren
│   └── warning.wav               # Notification alert beep
├── sentinel_vision.exe           # Pre-compiled standalone Windows executable (C++)
├── build.bat                     # One-click C++ compilation script
├── run.bat                       # One-click C++ launcher
├── CMakeLists.txt                # CMake build configuration for Visual Studio / MinGW
└── README.md                     # Documentation
```

---

## 3. How to Run on Windows 10 & Windows 11

### 1-Click Launch (Pre-Compiled Binary)
1. In File Explorer, open `c:\Users\shyni\Downloads\cameera`
2. **Double-click** `run.bat` (or double-click `sentinel_vision.exe`)
3. The C++ engine starts and opens the dashboard at:
   ```
   http://localhost:8080
   ```

### 📱 Using Iriun Webcam (Phone as Webcam)
If your computer lacks an internal webcam and you use **Iriun Webcam**:
1. **Open Iriun on your Phone**: Launch the Iriun Webcam app on your smartphone.
2. **Open Iriun on PC**: Make sure the desktop Iriun application is open and connected (both phone and laptop should be on the same Wi-Fi network or connected via USB).
3. **Verify Preview**: In the Iriun PC window, verify that your phone's camera feed is live (not a black screen).
4. **Allow Browser Access**: When `http://localhost:8080` opens, click **Allow** on the browser's camera permission prompt.
5. **Select Camera**: In the dashboard, choose **"Iriun Webcam"** from the camera dropdown (or click the **"Change Cam"** button).

### 1-Click Build from Source (MinGW g++)
If you want to recompile the C++ source code:
- **Double-click** `build.bat`
- Or run:
  ```powershell
  g++ -std=c++14 -O2 src/main.cpp -o sentinel_vision.exe -lws2_32 -lwinmm -lshell32
  ```

---

## 4. How to Test the System

1. **Start Monitoring**:
   - In the dashboard, click the green **"Start Monitoring"** button. The status changes to **`MONITORING ACTIVE`**.
2. **Test Normal Blinking**:
   - Blink naturally at your webcam. Notice the **Natural Blinks** counter increments with **no false alarm**.
3. **Test Prolonged Eye Closure**:
   - Close your eyes for $\ge 2.0\text{s}$.
   - The status turns red, the audible siren sounds, and the alert banner displays.
   - Open your eyes: the alarm **auto-silences immediately**.
4. **Test Face Covering**:
   - Cover your face with your hands for $\ge 1.5\text{s}$.
   - Status switches to `HIDDEN`, and the alarm sounds.
5. **Test Person Absence**:
   - Step out of camera view for $\ge 2.5\text{s}$.
   - Status switches to `ABSENT`, and the alarm sounds.
6. **Export Logs**:
   - Check the **Detection Incident History** table and click **"Export CSV"** to download the audit log.
