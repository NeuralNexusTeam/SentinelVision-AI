#include "../include/Types.hpp"
#include "../include/ThreadSync.hpp"
#include "../include/EyeAspectCalculator.hpp"
#include "../include/HistoryRingBuffer.hpp"
#include "../include/NativeAlarmSystem.hpp"
#include "../include/FaceMonitor.hpp"
#include "../include/HttpDashboardServer.hpp"

#include <iostream>
#include <iomanip>
#include <windows.h>
#include <shellapi.h>

volatile bool g_running = true;

BOOL WINAPI consoleCtrlHandler(DWORD ctrlType) {
    if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_CLOSE_EVENT) {
        std::cout << "\n[Shutdown] Shutting down SentinelVision AI System..." << std::endl;
        g_running = false;
        return TRUE;
    }
    return FALSE;
}

int main(int argc, char* argv[]) {
    SetConsoleCtrlHandler(consoleCtrlHandler, TRUE);

    std::cout << "=====================================================================" << std::endl;
    std::cout << "   SENTINELVISION AI: REAL-TIME FACE & EYE MONITORING SYSTEM (C++)   " << std::endl;
    std::cout << "=====================================================================" << std::endl;
    std::cout << "[Init] Starting native C++ vision and state evaluation engine..." << std::endl;

    Monitor::HistoryRingBuffer history(200);
    Monitor::NativeAlarmSystem alarm;
    alarm.setSoundPath("sounds/alarm.wav");

    Monitor::FaceMonitor monitor(history, alarm);
    Monitor::ConfigSettings config;
    config.earThreshold = 0.22f;
    config.eyeClosedDurationLimit = 1.0f;
    config.faceHiddenDurationLimit = 1.0f;
    config.personAbsentDurationLimit = 1.0f;
    config.alarmEnabled = true;
    config.alarmVolume = 85;
    config.autoSilenceOnRecovery = true;
    monitor.setConfig(config);

    int port = 8080;
    Monitor::HttpDashboardServer server(port, monitor, history, alarm);
    if (!server.start()) {
        std::cerr << "[Error] Failed to initialize C++ WinSock2 server on port " << port << std::endl;
        return 1;
    }

    std::string url = "http://localhost:" + std::to_string(port);
    std::cout << "[Ready] Web Dashboard listening at: " << url << std::endl;
    std::cout << "[Browser] Opening web dashboard in default browser..." << std::endl;
    ShellExecuteA(NULL, "open", url.c_str(), NULL, NULL, SW_SHOWNORMAL);

    std::cout << "\n[System Status] Online. Press Ctrl+C in this console window to exit." << std::endl;
    std::cout << "---------------------------------------------------------------------" << std::endl;

    DWORD lastTick = GetTickCount();

    while (g_running) {
        DWORD nowTick = GetTickCount();
        if (nowTick - lastTick >= 1000) {
            auto t = monitor.getTelemetry();
            std::cout << "\r[Status] Mode: " << (t.isMonitoring ? "ACTIVE" : "STANDBY")
                      << " | Face: " << Monitor::faceStatusToString(t.faceStatus)
                      << " | Eye: " << Monitor::eyeStatusToString(t.eyeStatus)
                      << " | EAR: " << std::fixed << std::setprecision(2) << t.currentEAR
                      << " | Blinks: " << t.blinkCount
                      << " | Incidents: " << t.totalIncidents
                      << " | Alarm: " << Monitor::alarmStateToString(t.alarmState)
                      << "      " << std::flush;
            lastTick = nowTick;
        }

        Sleep(40);
    }

    std::cout << "\n[Cleanup] Stopping server and audio alarms..." << std::endl;
    monitor.stopMonitoring();
    server.stop();
    alarm.stopAlarm();
    std::cout << "[Done] SentinelVision C++ System terminated cleanly." << std::endl;
    return 0;
}
