#pragma once
#include "Types.hpp"
#include "ThreadSync.hpp"
#include "EyeAspectCalculator.hpp"
#include "HistoryRingBuffer.hpp"
#include "NativeAlarmSystem.hpp"
#include <iostream>

namespace Monitor {

class FaceMonitor {
public:
    FaceMonitor(HistoryRingBuffer& history, NativeAlarmSystem& alarm)
        : m_history(history), m_alarm(alarm), m_startTick(0), m_lastTick(0),
          m_eyeClosedStartTick(0), m_faceHiddenStartTick(0), m_personAbsentStartTick(0) {}

    void setConfig(const ConfigSettings& config) {
        LockGuard lock(m_mutex);
        m_config = config;
    }

    ConfigSettings getConfig() const {
        LockGuard lock(const_cast<Mutex&>(m_mutex));
        return m_config;
    }

    SystemTelemetry getTelemetry() const {
        LockGuard lock(const_cast<Mutex&>(m_mutex));
        SystemTelemetry copy = m_telemetry;
        if (copy.isMonitoring && m_startTick != 0) {
            copy.sessionUptime = (GetTickCount() - m_startTick) / 1000.0f;
        }
        copy.alarmMuted = m_alarm.isMuted();
        return copy;
    }

    void startMonitoring() {
        LockGuard lock(m_mutex);
        m_telemetry.isMonitoring = true;
        m_startTick = GetTickCount();
        m_lastTick = m_startTick;
        m_eyeClosedStartTick = 0;
        m_faceHiddenStartTick = 0;
        m_personAbsentStartTick = 0;
        m_activeIncident = IncidentType::NONE;
        m_telemetry.alarmState = AlarmState::NORMAL;
        m_telemetry.activeWarningMessage = "";
    }

    void stopMonitoring() {
        LockGuard lock(m_mutex);
        m_telemetry.isMonitoring = false;
        m_alarm.stopAlarm();
        m_telemetry.alarmState = AlarmState::NORMAL;
        m_telemetry.activeWarningMessage = "";
        m_telemetry.eyesClosedTimer = 0.0f;
        m_telemetry.faceHiddenTimer = 0.0f;
        m_telemetry.personAbsentTimer = 0.0f;
    }

    void update(bool faceFound, bool faceCovered, float leftEAR, float rightEAR, float fps = 30.0f) {
        LockGuard lock(m_mutex);

        DWORD nowTick = GetTickCount();
        if (m_lastTick == 0) m_lastTick = nowTick;
        m_lastTick = nowTick;

        if (!m_telemetry.isMonitoring) {
            m_telemetry.faceStatus = FaceStatus::ABSENT;
            m_telemetry.eyeStatus = EyeStatus::UNKNOWN;
            return;
        }

        m_telemetry.fps = fps;

        // Calculate Average EAR
        float avgEAR = 0.0f;
        if (leftEAR > 0.0f && rightEAR > 0.0f) {
            avgEAR = (leftEAR + rightEAR) / 2.0f;
        } else if (leftEAR > 0.0f) {
            avgEAR = leftEAR;
        } else if (rightEAR > 0.0f) {
            avgEAR = rightEAR;
        }

        m_telemetry.leftEAR = leftEAR;
        m_telemetry.rightEAR = rightEAR;
        m_telemetry.currentEAR = m_earCalc.smoothEAR(avgEAR);

        // 1. Determine Face Status
        if (!faceFound && !faceCovered) {
            m_telemetry.faceStatus = FaceStatus::ABSENT;
        } else if (faceCovered) {
            m_telemetry.faceStatus = FaceStatus::HIDDEN_OR_COVERED;
        } else {
            m_telemetry.faceStatus = FaceStatus::DETECTED;
        }

        // 2. Determine Eye Status
        if (m_telemetry.faceStatus == FaceStatus::DETECTED) {
            if (m_telemetry.currentEAR < m_config.earThreshold) {
                m_telemetry.eyeStatus = EyeStatus::CLOSED;
            } else {
                m_telemetry.eyeStatus = EyeStatus::OPEN;
            }
        } else {
            m_telemetry.eyeStatus = EyeStatus::UNKNOWN;
        }

        // 3. Process State Timers and Incident Detection
        processEyeClosure(nowTick);
        processFaceOcclusion(nowTick);
        processPersonAbsence(nowTick);

        // 4. Update Alarm State
        evaluateAlarmState();
    }

private:
    void processEyeClosure(DWORD nowTick) {
        if (m_telemetry.faceStatus == FaceStatus::DETECTED && m_telemetry.eyeStatus == EyeStatus::CLOSED) {
            if (m_eyeClosedStartTick == 0) {
                m_eyeClosedStartTick = nowTick;
            }
            float duration = (nowTick - m_eyeClosedStartTick) / 1000.0f;
            m_telemetry.eyesClosedTimer = duration;

            if (duration >= m_config.eyeClosedDurationLimit) {
                if (m_activeIncident != IncidentType::PROLONGED_EYES_CLOSED) {
                    m_activeIncident = IncidentType::PROLONGED_EYES_CLOSED;
                    m_telemetry.eyeClosedIncidentCount++;
                    m_telemetry.totalIncidents++;
                    m_telemetry.activeWarningMessage = "CRITICAL: Eyes closed for extended duration (>= 1s)!";
                    m_history.addIncident("Eyes Closed", "Critical", duration, "Subject eyes closed for >= " + std::to_string((int)duration) + "s");
                }
            }
        } else {
            if (m_eyeClosedStartTick != 0) {
                float duration = (nowTick - m_eyeClosedStartTick) / 1000.0f;
                // Natural blink filter (0.08s to 0.4s)
                if (duration >= 0.08f && duration < m_config.eyeClosedDurationLimit) {
                    m_telemetry.blinkCount++;
                }
                m_eyeClosedStartTick = 0;
                m_telemetry.eyesClosedTimer = 0.0f;

                if (m_activeIncident == IncidentType::PROLONGED_EYES_CLOSED) {
                    m_activeIncident = IncidentType::NONE;
                }
            }
        }
    }

    void processFaceOcclusion(DWORD nowTick) {
        if (m_telemetry.faceStatus == FaceStatus::HIDDEN_OR_COVERED) {
            if (m_faceHiddenStartTick == 0) {
                m_faceHiddenStartTick = nowTick;
            }
            float duration = (nowTick - m_faceHiddenStartTick) / 1000.0f;
            m_telemetry.faceHiddenTimer = duration;

            if (duration >= m_config.faceHiddenDurationLimit) {
                if (m_activeIncident != IncidentType::FACE_COVERED) {
                    m_activeIncident = IncidentType::FACE_COVERED;
                    m_telemetry.faceCoveredIncidentCount++;
                    m_telemetry.totalIncidents++;
                    m_telemetry.activeWarningMessage = "ALERT: Face is covered or obstructed!";
                    m_history.addIncident("Face Covered", "High", duration, "Face obstructed by hands or objects >= " + std::to_string((int)duration) + "s");
                }
            }
        } else {
            if (m_faceHiddenStartTick != 0) {
                m_faceHiddenStartTick = 0;
                m_telemetry.faceHiddenTimer = 0.0f;
                if (m_activeIncident == IncidentType::FACE_COVERED) {
                    m_activeIncident = IncidentType::NONE;
                }
            }
        }
    }

    void processPersonAbsence(DWORD nowTick) {
        if (m_telemetry.faceStatus == FaceStatus::ABSENT) {
            if (m_personAbsentStartTick == 0) {
                m_personAbsentStartTick = nowTick;
            }
            float duration = (nowTick - m_personAbsentStartTick) / 1000.0f;
            m_telemetry.personAbsentTimer = duration;

            if (duration >= m_config.personAbsentDurationLimit) {
                if (m_activeIncident != IncidentType::PERSON_ABSENT) {
                    m_activeIncident = IncidentType::PERSON_ABSENT;
                    m_telemetry.personAbsentIncidentCount++;
                    m_telemetry.totalIncidents++;
                    m_telemetry.activeWarningMessage = "ALERT: Person left camera view / No face visible!";
                    m_history.addIncident("Person Absent", "High", duration, "No face detected in camera view >= " + std::to_string((int)duration) + "s");
                }
            }
        } else {
            if (m_personAbsentStartTick != 0) {
                m_personAbsentStartTick = 0;
                m_telemetry.personAbsentTimer = 0.0f;
                if (m_activeIncident == IncidentType::PERSON_ABSENT) {
                    m_activeIncident = IncidentType::NONE;
                }
            }
        }
    }

    void evaluateAlarmState() {
        if (m_activeIncident != IncidentType::NONE) {
            m_telemetry.alarmState = AlarmState::ACTIVE_ALARM;
            if (m_config.alarmEnabled && !m_alarm.isAlarming()) {
                m_alarm.startAlarm(m_config.alarmVolume);
            }
        } else {
            m_telemetry.alarmState = AlarmState::NORMAL;
            m_telemetry.activeWarningMessage = "";
            if (m_config.autoSilenceOnRecovery && m_alarm.isAlarming()) {
                m_alarm.stopAlarm();
            }
        }
    }

    mutable Mutex m_mutex;
    ConfigSettings m_config;
    SystemTelemetry m_telemetry;
    HistoryRingBuffer& m_history;
    NativeAlarmSystem& m_alarm;
    EyeAspectCalculator m_earCalc;

    DWORD m_startTick;
    DWORD m_lastTick;
    DWORD m_eyeClosedStartTick;
    DWORD m_faceHiddenStartTick;
    DWORD m_personAbsentStartTick;
    IncidentType m_activeIncident = IncidentType::NONE;
};

} // namespace Monitor
