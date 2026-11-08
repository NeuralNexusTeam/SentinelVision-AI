#pragma once
#include <string>
#include <chrono>
#include <vector>

namespace Monitor {

enum class EyeStatus {
    OPEN,
    CLOSED,
    UNKNOWN
};

enum class FaceStatus {
    DETECTED,
    HIDDEN_OR_COVERED,
    ABSENT
};

enum class AlarmState {
    NORMAL,
    WARNING,
    ACTIVE_ALARM
};

enum class IncidentType {
    NONE,
    PROLONGED_EYES_CLOSED,
    FACE_COVERED,
    PERSON_ABSENT
};

struct Point2D {
    float x = 0.0f;
    float y = 0.0f;
};

struct ConfigSettings {
    float earThreshold = 0.22f;
    float eyeClosedDurationLimit = 2.0f;   // seconds
    float faceHiddenDurationLimit = 1.5f;   // seconds
    float personAbsentDurationLimit = 2.5f; // seconds
    bool alarmEnabled = true;
    int alarmVolume = 80;                   // 0-100
    int cameraIndex = 0;
};

struct IncidentRecord {
    int id = 0;
    std::string timestamp;
    std::string type;
    std::string severity;
    float durationSeconds = 0.0f;
    std::string details;
};

struct SystemTelemetry {
    bool isMonitoring = false;
    FaceStatus faceStatus = FaceStatus::ABSENT;
    EyeStatus eyeStatus = EyeStatus::UNKNOWN;
    AlarmState alarmState = AlarmState::NORMAL;
    float currentEAR = 0.0f;
    float leftEAR = 0.0f;
    float rightEAR = 0.0f;
    float fps = 0.0f;
    int blinkCount = 0;
    int eyeClosedIncidentCount = 0;
    int faceCoveredIncidentCount = 0;
    int personAbsentIncidentCount = 0;
    float eyesClosedTimer = 0.0f;
    float faceHiddenTimer = 0.0f;
    float personAbsentTimer = 0.0f;
    std::string activeWarningMessage = "";
    int totalIncidents = 0;
};

inline std::string eyeStatusToString(EyeStatus s) {
    switch (s) {
        case EyeStatus::OPEN: return "OPEN";
        case EyeStatus::CLOSED: return "CLOSED";
        default: return "UNKNOWN";
    }
}

inline std::string faceStatusToString(FaceStatus s) {
    switch (s) {
        case FaceStatus::DETECTED: return "DETECTED";
        case FaceStatus::HIDDEN_OR_COVERED: return "HIDDEN_OR_COVERED";
        case FaceStatus::ABSENT: return "ABSENT";
        default: return "UNKNOWN";
    }
}

inline std::string alarmStateToString(AlarmState s) {
    switch (s) {
        case AlarmState::NORMAL: return "NORMAL";
        case AlarmState::WARNING: return "WARNING";
        case AlarmState::ACTIVE_ALARM: return "ACTIVE_ALARM";
        default: return "NORMAL";
    }
}

} // namespace Monitor
