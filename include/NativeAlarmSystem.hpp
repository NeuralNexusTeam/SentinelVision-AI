#pragma once
#include <windows.h>
#include <mmsystem.h>
#include <string>
#include <iostream>
#include "ThreadSync.hpp"

namespace Monitor {

class NativeAlarmSystem {
public:
    NativeAlarmSystem() 
        : m_isPlaying(false), m_stopRequested(false), m_isMuted(false),
          m_hThread(NULL), m_soundPath("sounds/alarm.wav") {}

    ~NativeAlarmSystem() {
        stopAlarm();
    }

    void setSoundPath(const std::string& path) {
        m_soundPath = path;
    }

    void setMuted(bool muted) {
        m_isMuted = muted;
        if (muted && m_isPlaying) {
            stopAlarm();
        }
    }

    bool isMuted() const {
        return m_isMuted;
    }

    void startAlarm(int volumePercent = 85) {
        if (m_isPlaying || m_isMuted) {
            return;
        }

        m_isPlaying = true;
        m_stopRequested = false;
        m_hThread = CreateThread(NULL, 0, alarmThreadEntry, this, 0, NULL);
    }

    void stopAlarm() {
        if (!m_isPlaying) {
            return;
        }

        m_stopRequested = true;
        PlaySoundA(NULL, NULL, 0);

        if (m_hThread != NULL) {
            WaitForSingleObject(m_hThread, 500);
            CloseHandle(m_hThread);
            m_hThread = NULL;
        }
        m_isPlaying = false;
    }

    bool isAlarming() const {
        return m_isPlaying;
    }

    static DWORD WINAPI beepThreadFunc(LPVOID param) {
        DWORD* p = (DWORD*)param;
        Beep(p[0], p[1]);
        delete[] p;
        return 0;
    }

    static void triggerBeep(DWORD freq = 1100, DWORD durationMs = 250) {
        DWORD* p = new DWORD[2]{freq, durationMs};
        HANDLE h = CreateThread(NULL, 0, beepThreadFunc, p, 0, NULL);
        if (h) CloseHandle(h);
    }

private:
    static DWORD WINAPI alarmThreadEntry(LPVOID param) {
        NativeAlarmSystem* self = (NativeAlarmSystem*)param;
        self->alarmLoop();
        return 0;
    }

    void alarmLoop() {
        DWORD fileAttr = GetFileAttributesA(m_soundPath.c_str());
        bool hasWavFile = (fileAttr != INVALID_FILE_ATTRIBUTES && !(fileAttr & FILE_ATTRIBUTE_DIRECTORY));

        while (!m_stopRequested && !m_isMuted) {
            if (hasWavFile) {
                PlaySoundA(m_soundPath.c_str(), NULL, SND_FILENAME | SND_SYNC);
            } else {
                Beep(1300, 220);
                if (m_stopRequested || m_isMuted) break;
                Beep(920, 200);
                if (m_stopRequested || m_isMuted) break;
                Beep(1500, 250);
            }
            Sleep(100);
        }

        PlaySoundA(NULL, NULL, 0);
    }

    volatile bool m_isPlaying;
    volatile bool m_stopRequested;
    volatile bool m_isMuted;
    HANDLE m_hThread;
    std::string m_soundPath;
};

} // namespace Monitor
