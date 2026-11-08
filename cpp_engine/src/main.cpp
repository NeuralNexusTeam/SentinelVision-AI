#include "../include/Types.hpp"
#include "../include/ThreadSync.hpp"
#include "../include/EyeAspectCalculator.hpp"
#include "../include/HistoryRingBuffer.hpp"
#include "../include/NativeAlarmSystem.hpp"
#include "../include/FaceMonitor.hpp"
#include "../include/HttpStreamServer.hpp"

#include <iostream>
#include <iomanip>
#include <csignal>
#include <windows.h>
#include <shellapi.h>

#ifdef ENABLE_OPENCV_CPP
#include <opencv2/opencv.hpp>
#endif

volatile bool g_running = true;

BOOL WINAPI consoleCtrlHandler(DWORD ctrlType) {
    if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_CLOSE_EVENT) {
        std::cout << "\n[Shutdown] Termination requested. Stopping system..." << std::endl;
        g_running = false;
        return TRUE;
    }
    return FALSE;
}

int main(int argc, char* argv[]) {
    SetConsoleCtrlHandler(consoleCtrlHandler, TRUE);

    std::cout << "=================================================================" << std::endl;
    std::cout << "    AI-BASED REAL-TIME FACE & EYE MONITORING SYSTEM (C++ ENGINE) " << std::endl;
    std::cout << "=================================================================" << std::endl;
    std::cout << "[Init] Initializing high-performance monitoring core..." << std::endl;

    Monitor::HistoryRingBuffer history(150);
    Monitor::NativeAlarmSystem alarm;
    alarm.setSoundPath("sounds/alarm.wav");

    Monitor::FaceMonitor monitor(history, alarm);
    Monitor::ConfigSettings config;
    config.earThreshold = 0.22f;
    config.eyeClosedDurationLimit = 2.0f;
    config.faceHiddenDurationLimit = 1.5f;
    config.personAbsentDurationLimit = 2.5f;
    config.alarmEnabled = true;
    config.alarmVolume = 85;
    monitor.setConfig(config);

    // Start Embedded Web Dashboard Server on port 8080
    int webPort = 8080;
    Monitor::HttpStreamServer webServer(webPort, monitor, history);
    if (!webServer.start()) {
        std::cerr << "[Warning] Failed to launch web server on port " << webPort << std::endl;
    } else {
        std::cout << "[Ready] Web Dashboard accessible at: http://localhost:" << webPort << std::endl;
        // Open dashboard in default browser
        ShellExecuteA(NULL, "open", "http://localhost:8080", NULL, NULL, SW_SHOWNORMAL);
    }

    monitor.startMonitoring();
    std::cout << "[System] Monitoring ACTIVE. Press Ctrl+C in this console to terminate." << std::endl;

    DWORD lastPrintTick = GetTickCount();

    while (g_running) {
        DWORD nowTick = GetTickCount();
        if (nowTick - lastPrintTick >= 1000) {
            auto t = monitor.getTelemetry();
            std::cout << "\r[Status] Face: " << Monitor::faceStatusToString(t.faceStatus)
                      << " | Eye: " << Monitor::eyeStatusToString(t.eyeStatus)
                      << " | EAR: " << std::fixed << std::setprecision(2) << t.currentEAR
                      << " | Blinks: " << t.blinkCount
                      << " | Incidents: " << t.totalIncidents
                      << " | Alarm: " << Monitor::alarmStateToString(t.alarmState)
                      << "        " << std::flush;
            lastPrintTick = nowTick;
        }

        Sleep(33); // ~30 FPS
    }

    std::cout << "\n[Cleanup] Stopping services..." << std::endl;
    monitor.stopMonitoring();
    webServer.stop();
    alarm.stopAlarm();
    std::cout << "[Shutdown] C++ Monitoring Engine exited cleanly." << std::endl;
    return 0;
}
