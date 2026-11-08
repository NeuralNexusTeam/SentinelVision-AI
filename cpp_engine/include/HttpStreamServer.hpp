#pragma once
#include <winsock2.h>
#include <windows.h>
#include <string>
#include <sstream>
#include <fstream>
#include <iostream>
#include <iomanip>
#include "FaceMonitor.hpp"
#include "HistoryRingBuffer.hpp"
#include "ThreadSync.hpp"

namespace Monitor {

class HttpStreamServer {
public:
    HttpStreamServer(int port, FaceMonitor& monitor, HistoryRingBuffer& history)
        : m_port(port), m_monitor(monitor), m_history(history), m_running(false),
          m_serverSocket(INVALID_SOCKET), m_hThread(NULL) {}

    ~HttpStreamServer() {
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
            std::cerr << "[HttpServer] Bind failed: " << WSAGetLastError() << std::endl;
            closesocket(m_serverSocket);
            WSACleanup();
            return false;
        }

        if (listen(m_serverSocket, 10) == SOCKET_ERROR) {
            std::cerr << "[HttpServer] Listen failed: " << WSAGetLastError() << std::endl;
            closesocket(m_serverSocket);
            WSACleanup();
            return false;
        }

        m_running = true;
        m_hThread = CreateThread(NULL, 0, serverThreadEntry, this, 0, NULL);
        std::cout << "[HttpServer] AI Monitoring Web Dashboard available at http://localhost:" << m_port << std::endl;
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
        HttpStreamServer* self;
        SOCKET sock;
    };

    static DWORD WINAPI serverThreadEntry(LPVOID param) {
        HttpStreamServer* self = (HttpStreamServer*)param;
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
        char buffer[4096];
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

        std::string response;

        if (path == "/" || path == "/index.html") {
            response = serveIndexHtml();
        } else if (path == "/api/status") {
            response = serveStatusJson();
        } else if (path == "/api/history") {
            response = serveHistoryJson();
        } else if (path == "/api/start" && method == "POST") {
            m_monitor.startMonitoring();
            response = createJsonResponse(200, "{\"success\":true,\"message\":\"Monitoring started\"}");
        } else if (path == "/api/stop" && method == "POST") {
            m_monitor.stopMonitoring();
            response = createJsonResponse(200, "{\"success\":true,\"message\":\"Monitoring stopped\"}");
        } else if (path == "/api/test_alarm" && method == "POST") {
            NativeAlarmSystem::triggerBeep(1200, 300);
            response = createJsonResponse(200, "{\"success\":true,\"message\":\"Alarm test triggered\"}");
        } else {
            response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        }

        send(clientSocket, response.c_str(), (int)response.length(), 0);
        closesocket(clientSocket);
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
        oss << "\"eyes_closed_timer\":" << std::fixed << std::setprecision(1) << t.eyesClosedTimer << ",";
        oss << "\"face_hidden_timer\":" << std::fixed << std::setprecision(1) << t.faceHiddenTimer << ",";
        oss << "\"person_absent_timer\":" << std::fixed << std::setprecision(1) << t.personAbsentTimer << ",";
        oss << "\"warning_message\":\"" << t.activeWarningMessage << "\",";
        oss << "\"total_incidents\":" << t.totalIncidents;
        oss << "}";

        return createJsonResponse(200, oss.str());
    }

    std::string serveHistoryJson() {
        std::string json = m_history.toJSON();
        return createJsonResponse(200, json);
    }

    std::string createJsonResponse(int statusCode, const std::string& body) {
        std::ostringstream ss;
        ss << "HTTP/1.1 " << statusCode << " OK\r\n";
        ss << "Content-Type: application/json; charset=UTF-8\r\n";
        ss << "Access-Control-Allow-Origin: *\r\n";
        ss << "Content-Length: " << body.length() << "\r\n";
        ss << "Connection: close\r\n\r\n";
        ss << body;
        return ss.str();
    }

    std::string serveIndexHtml() {
        std::ifstream file("templates/index.html");
        std::string htmlContent;
        if (file.is_open()) {
            std::stringstream ss;
            ss << file.rdbuf();
            htmlContent = ss.str();
        } else {
            htmlContent = "<!DOCTYPE html><html><body style='background:#0a0f1d;color:#fff;'><h2>AI Monitoring Dashboard</h2></body></html>";
        }

        std::ostringstream ss;
        ss << "HTTP/1.1 200 OK\r\n";
        ss << "Content-Type: text/html; charset=UTF-8\r\n";
        ss << "Content-Length: " << htmlContent.length() << "\r\n";
        ss << "Connection: close\r\n\r\n";
        ss << htmlContent;
        return ss.str();
    }

    int m_port;
    FaceMonitor& m_monitor;
    HistoryRingBuffer& m_history;
    volatile bool m_running;
    SOCKET m_serverSocket;
    HANDLE m_hThread;
};

} // namespace Monitor
