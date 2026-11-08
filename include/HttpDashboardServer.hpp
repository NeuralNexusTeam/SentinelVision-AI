#pragma once
#include <winsock2.h>
#include <windows.h>
#include <string>
#include <sstream>
#include <fstream>
#include <iostream>
#include <iomanip>
#include <algorithm>
#include "FaceMonitor.hpp"
#include "HistoryRingBuffer.hpp"
#include "NativeAlarmSystem.hpp"
#include "ThreadSync.hpp"

namespace Monitor {

class HttpDashboardServer {
public:
    HttpDashboardServer(int port, FaceMonitor& monitor, HistoryRingBuffer& history, NativeAlarmSystem& alarm)
        : m_port(port), m_monitor(monitor), m_history(history), m_alarm(alarm),
          m_running(false), m_serverSocket(INVALID_SOCKET), m_hThread(NULL) {}

    ~HttpDashboardServer() {
        stop();
    }

    bool start() {
        WSADATA wsaData;
        int res = WSAStartup(MAKEWORD(2, 2), &wsaData);
        if (res != 0) {
            std::cerr << "[HttpServer] WSAStartup failed: " << res << std::endl;
            return false;
        }

        m_serverSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (m_serverSocket == INVALID_SOCKET) {
            std::cerr << "[HttpServer] Socket creation failed: " << WSAGetLastError() << std::endl;
            WSACleanup();
            return false;
        }

        BOOL opt = TRUE;
        setsockopt(m_serverSocket, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));

        sockaddr_in serverAddr;
        serverAddr.sin_family = AF_INET;
        serverAddr.sin_addr.s_addr = INADDR_ANY;
        serverAddr.sin_port = htons(m_port);

        if (bind(m_serverSocket, (sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
            std::cerr << "[HttpServer] Bind failed on port " << m_port << ": " << WSAGetLastError() << std::endl;
            closesocket(m_serverSocket);
            WSACleanup();
            return false;
        }

        if (listen(m_serverSocket, 15) == SOCKET_ERROR) {
            std::cerr << "[HttpServer] Listen failed: " << WSAGetLastError() << std::endl;
            closesocket(m_serverSocket);
            WSACleanup();
            return false;
        }

        m_running = true;
        m_hThread = CreateThread(NULL, 0, serverThreadEntry, this, 0, NULL);
        std::cout << "[HttpServer] SentinelVision C++ Web Dashboard active at http://localhost:" << m_port << std::endl;
        return true;
    }

    void stop() {
        if (!m_running) return;
        m_running = false;

        if (m_serverSocket != INVALID_SOCKET) {
            closesocket(m_serverSocket);
            m_serverSocket = INVALID_SOCKET;
        }

        if (m_hThread != NULL) {
            WaitForSingleObject(m_hThread, 500);
            CloseHandle(m_hThread);
            m_hThread = NULL;
        }
        WSACleanup();
    }

private:
    struct ClientHandlerArgs {
        HttpDashboardServer* self;
        SOCKET sock;
    };

    static DWORD WINAPI serverThreadEntry(LPVOID param) {
        HttpDashboardServer* self = (HttpDashboardServer*)param;
        self->serverLoop();
        return 0;
    }

    static DWORD WINAPI clientThreadFunc(LPVOID param) {
        ClientHandlerArgs* a = (ClientHandlerArgs*)param;
        a->self->handleClient(a->sock);
        delete a;
        return 0;
    }

    void serverLoop() {
        while (m_running) {
            sockaddr_in clientAddr;
            int clientLen = sizeof(clientAddr);
            SOCKET clientSocket = accept(m_serverSocket, (sockaddr*)&clientAddr, &clientLen);

            if (clientSocket == INVALID_SOCKET) {
                if (!m_running) break;
                continue;
            }

            ClientHandlerArgs* args = new ClientHandlerArgs{this, clientSocket};
            HANDLE hClient = CreateThread(NULL, 0, clientThreadFunc, args, 0, NULL);
            if (hClient) CloseHandle(hClient);
        }
    }

    void handleClient(SOCKET clientSocket) {
        char buffer[8192];
        int bytesRead = recv(clientSocket, buffer, sizeof(buffer) - 1, 0);
        if (bytesRead <= 0) {
            closesocket(clientSocket);
            return;
        }
        buffer[bytesRead] = '\0';

        std::string request(buffer);
        std::istringstream reqStream(request);
        std::string method, path, protocol;
        reqStream >> method >> path >> protocol;

        // Strip query string if present
        size_t qPos = path.find('?');
        std::string cleanPath = (qPos != std::string::npos) ? path.substr(0, qPos) : path;

        // Extract body if POST
        std::string body = "";
        size_t headerEnd = request.find("\r\n\r\n");
        if (headerEnd != std::string::npos) {
            body = request.substr(headerEnd + 4);
        }

        std::string response;

        if (cleanPath == "/" || cleanPath == "/index.html") {
            response = serveStaticFile("templates/index.html", "text/html; charset=UTF-8");
        } else if (cleanPath == "/static/css/dashboard.css") {
            response = serveStaticFile("static/css/dashboard.css", "text/css; charset=UTF-8");
        } else if (cleanPath == "/static/js/app.js") {
            response = serveStaticFile("static/js/app.js", "application/javascript; charset=UTF-8");
        } else if (cleanPath == "/static/sounds/alarm.wav" || cleanPath == "/sounds/alarm.wav") {
            response = serveStaticBinaryFile("sounds/alarm.wav", "audio/wav");
        } else if (cleanPath == "/static/sounds/warning.wav" || cleanPath == "/sounds/warning.wav") {
            response = serveStaticBinaryFile("sounds/warning.wav", "audio/wav");
        } else if (cleanPath == "/api/status") {
            response = serveStatusJson();
        } else if (cleanPath == "/api/history") {
            response = serveHistoryJson();
        } else if (cleanPath == "/api/history/clear" && method == "POST") {
            m_history.clear();
            response = createJsonResponse(200, "{\"success\":true,\"message\":\"History cleared\"}");
        } else if (cleanPath == "/api/history/export_csv") {
            response = serveHistoryCsv();
        } else if (cleanPath == "/api/settings" && method == "GET") {
            response = serveSettingsJson();
        } else if (cleanPath == "/api/settings" && method == "POST") {
            parseAndUpdateSettings(body);
            response = createJsonResponse(200, "{\"success\":true,\"message\":\"Settings saved\"}");
        } else if ((cleanPath == "/api/monitor/start" || cleanPath == "/api/start") && method == "POST") {
            m_monitor.startMonitoring();
            response = createJsonResponse(200, "{\"success\":true,\"message\":\"Monitoring started\"}");
        } else if ((cleanPath == "/api/monitor/stop" || cleanPath == "/api/stop") && method == "POST") {
            m_monitor.stopMonitoring();
            response = createJsonResponse(200, "{\"success\":true,\"message\":\"Monitoring stopped\"}");
        } else if (cleanPath == "/api/alarm/test" && method == "POST") {
            NativeAlarmSystem::triggerBeep(1200, 300);
            response = createJsonResponse(200, "{\"success\":true,\"message\":\"Alarm test triggered\"}");
        } else if (cleanPath == "/api/alarm/mute_toggle" && method == "POST") {
            m_alarm.setMuted(!m_alarm.isMuted());
            std::string json = "{\"success\":true,\"muted\":" + std::string(m_alarm.isMuted() ? "true" : "false") + "}";
            response = createJsonResponse(200, json);
        } else if (cleanPath == "/api/telemetry" && method == "POST") {
            parseTelemetryFeed(body);
            response = serveStatusJson();
        } else {
            response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        }

        send(clientSocket, response.c_str(), (int)response.length(), 0);
        closesocket(clientSocket);
    }

    void parseTelemetryFeed(const std::string& body) {
        // Simple JSON extractor for { "face_detected": bool, "face_covered": bool, "left_ear": float, "right_ear": float, "fps": float }
        bool face = (body.find("\"face_detected\":true") != std::string::npos || body.find("\"face_detected\": true") != std::string::npos);
        bool covered = (body.find("\"face_covered\":true") != std::string::npos || body.find("\"face_covered\": true") != std::string::npos);

        float leftEAR = extractFloat(body, "left_ear", 0.0f);
        float rightEAR = extractFloat(body, "right_ear", 0.0f);
        float fps = extractFloat(body, "fps", 30.0f);

        m_monitor.update(face, covered, leftEAR, rightEAR, fps);
    }

    void parseAndUpdateSettings(const std::string& body) {
        auto cfg = m_monitor.getConfig();
        float earThresh = extractFloat(body, "ear_threshold", cfg.earThreshold);
        float eyeClosedLimit = extractFloat(body, "eye_closed_time_sec", cfg.eyeClosedDurationLimit);
        float faceHiddenLimit = extractFloat(body, "face_hidden_time_sec", cfg.faceHiddenDurationLimit);
        float personAbsentLimit = extractFloat(body, "person_absent_time_sec", cfg.personAbsentDurationLimit);
        float vol = extractFloat(body, "alarm_volume", (float)cfg.alarmVolume / 100.0f);

        cfg.earThreshold = earThresh;
        cfg.eyeClosedDurationLimit = eyeClosedLimit;
        cfg.faceHiddenDurationLimit = faceHiddenLimit;
        cfg.personAbsentDurationLimit = personAbsentLimit;
        cfg.alarmVolume = (int)(vol * 100.0f);
        m_monitor.setConfig(cfg);
    }

    float extractFloat(const std::string& text, const std::string& key, float defaultVal) {
        size_t pos = text.find("\"" + key + "\"");
        if (pos == std::string::npos) return defaultVal;
        size_t colon = text.find(':', pos);
        if (colon == std::string::npos) return defaultVal;
        size_t start = colon + 1;
        while (start < text.length() && (text[start] == ' ' || text[start] == '\"')) start++;
        try {
            return std::stof(text.substr(start));
        } catch (...) {
            return defaultVal;
        }
    }

    std::string serveStatusJson() {
        auto t = m_monitor.getTelemetry();
        auto cfg = m_monitor.getConfig();

        std::ostringstream oss;
        oss << "{";
        oss << "\"is_monitoring\":" << (t.isMonitoring ? "true" : "false") << ",";
        oss << "\"face_status\":\"" << faceStatusToString(t.faceStatus) << "\",";
        oss << "\"eye_status\":\"" << eyeStatusToString(t.eyeStatus) << "\",";
        oss << "\"alarm_state\":\"" << alarmStateToString(t.alarmState) << "\",";
        oss << "\"current_ear\":" << std::fixed << std::setprecision(3) << t.currentEAR << ",";
        oss << "\"left_ear\":" << std::fixed << std::setprecision(3) << t.leftEAR << ",";
        oss << "\"right_ear\":" << std::fixed << std::setprecision(3) << t.rightEAR << ",";
        oss << "\"ear_threshold\":" << std::fixed << std::setprecision(3) << cfg.earThreshold << ",";
        oss << "\"fps\":" << std::fixed << std::setprecision(1) << t.fps << ",";
        oss << "\"blink_count\":" << t.blinkCount << ",";
        oss << "\"eye_closed_incidents\":" << t.eyeClosedIncidentCount << ",";
        oss << "\"face_covered_incidents\":" << t.faceCoveredIncidentCount << ",";
        oss << "\"person_absent_incidents\":" << t.personAbsentIncidentCount << ",";
        oss << "\"total_incidents\":" << t.totalIncidents << ",";
        oss << "\"eye_closed_limit\":" << std::fixed << std::setprecision(1) << cfg.eyeClosedDurationLimit << ",";
        oss << "\"face_hidden_limit\":" << std::fixed << std::setprecision(1) << cfg.faceHiddenDurationLimit << ",";
        oss << "\"person_absent_limit\":" << std::fixed << std::setprecision(1) << cfg.personAbsentDurationLimit << ",";
        oss << "\"eyes_closed_timer\":" << std::fixed << std::setprecision(1) << t.eyesClosedTimer << ",";
        oss << "\"face_hidden_timer\":" << std::fixed << std::setprecision(1) << t.faceHiddenTimer << ",";
        oss << "\"person_absent_timer\":" << std::fixed << std::setprecision(1) << t.personAbsentTimer << ",";
        oss << "\"warning_message\":\"" << t.activeWarningMessage << "\",";
        oss << "\"session_uptime\":" << std::fixed << std::setprecision(1) << t.sessionUptime << ",";
        oss << "\"alarm_muted\":" << (t.alarmMuted ? "true" : "false") << ",";
        oss << "\"alarm_volume\":" << cfg.alarmVolume;
        oss << "}";

        return createJsonResponse(200, oss.str());
    }

    std::string serveSettingsJson() {
        auto cfg = m_monitor.getConfig();
        std::ostringstream oss;
        oss << "{";
        oss << "\"ear_threshold\":" << std::fixed << std::setprecision(3) << cfg.earThreshold << ",";
        oss << "\"eye_closed_time_sec\":" << std::fixed << std::setprecision(1) << cfg.eyeClosedDurationLimit << ",";
        oss << "\"face_hidden_time_sec\":" << std::fixed << std::setprecision(1) << cfg.faceHiddenDurationLimit << ",";
        oss << "\"person_absent_time_sec\":" << std::fixed << std::setprecision(1) << cfg.personAbsentDurationLimit << ",";
        oss << "\"alarm_enabled\":" << (cfg.alarmEnabled ? "true" : "false") << ",";
        oss << "\"alarm_volume\":" << (float)cfg.alarmVolume / 100.0f << ",";
        oss << "\"auto_silence_on_recovery\":" << (cfg.autoSilenceOnRecovery ? "true" : "false");
        oss << "}";
        return createJsonResponse(200, oss.str());
    }

    std::string serveHistoryJson() {
        std::string json = "{\"incidents\":" + m_history.toJSON() + "}";
        return createJsonResponse(200, json);
    }

    std::string serveHistoryCsv() {
        std::string csv = m_history.toCSV();
        std::ostringstream ss;
        ss << "HTTP/1.1 200 OK\r\n";
        ss << "Content-Type: text/csv; charset=UTF-8\r\n";
        ss << "Content-Disposition: attachment; filename=incident_history.csv\r\n";
        ss << "Content-Length: " << csv.length() << "\r\n";
        ss << "Connection: close\r\n\r\n";
        ss << csv;
        return ss.str();
    }

    std::string createJsonResponse(int statusCode, const std::string& body) {
        std::ostringstream ss;
        ss << "HTTP/1.1 " << statusCode << " OK\r\n";
        ss << "Content-Type: application/json; charset=UTF-8\r\n";
        ss << "Access-Control-Allow-Origin: *\r\n";
        ss << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
        ss << "Access-Control-Allow-Headers: Content-Type\r\n";
        ss << "Content-Length: " << body.length() << "\r\n";
        ss << "Connection: close\r\n\r\n";
        ss << body;
        return ss.str();
    }

    std::string serveStaticFile(const std::string& filepath, const std::string& contentType) {
        std::ifstream file(filepath.c_str());
        if (!file.is_open()) {
            return "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        }
        std::stringstream ss;
        ss << file.rdbuf();
        std::string content = ss.str();

        std::ostringstream resp;
        resp << "HTTP/1.1 200 OK\r\n";
        resp << "Content-Type: " << contentType << "\r\n";
        resp << "Access-Control-Allow-Origin: *\r\n";
        resp << "Cache-Control: no-cache, no-store, must-revalidate\r\n";
        resp << "Content-Length: " << content.length() << "\r\n";
        resp << "Connection: close\r\n\r\n";
        resp << content;
        return resp.str();
    }

    std::string serveStaticBinaryFile(const std::string& filepath, const std::string& contentType) {
        std::ifstream file(filepath.c_str(), std::ios::binary);
        if (!file.is_open()) {
            return "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        }
        std::stringstream ss;
        ss << file.rdbuf();
        std::string content = ss.str();

        std::ostringstream resp;
        resp << "HTTP/1.1 200 OK\r\n";
        resp << "Content-Type: " << contentType << "\r\n";
        resp << "Content-Length: " << content.length() << "\r\n";
        resp << "Connection: close\r\n\r\n";
        resp << content;
        return resp.str();
    }

    int m_port;
    FaceMonitor& m_monitor;
    HistoryRingBuffer& m_history;
    NativeAlarmSystem& m_alarm;
    volatile bool m_running;
    SOCKET m_serverSocket;
    HANDLE m_hThread;
};

} // namespace Monitor
