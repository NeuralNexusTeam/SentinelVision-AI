#pragma once
#include <windows.h>
#include <string>
#include <sstream>
#include <iomanip>
#include <ctime>

namespace Monitor {

class Mutex {
public:
    Mutex() {
        InitializeCriticalSection(&m_cs);
    }
    ~Mutex() {
        DeleteCriticalSection(&m_cs);
    }
    void lock() {
        EnterCriticalSection(&m_cs);
    }
    void unlock() {
        LeaveCriticalSection(&m_cs);
    }
private:
    CRITICAL_SECTION m_cs;
    Mutex(const Mutex&) = delete;
    Mutex& operator=(const Mutex&) = delete;
};

class LockGuard {
public:
    explicit LockGuard(Mutex& m) : m_mutex(m) {
        m_mutex.lock();
    }
    ~LockGuard() {
        m_mutex.unlock();
    }
private:
    Mutex& m_mutex;
    LockGuard(const LockGuard&) = delete;
    LockGuard& operator=(const LockGuard&) = delete;
};

inline void SleepMs(DWORD ms) {
    Sleep(ms);
}

inline std::string getFormattedTimestamp() {
    std::time_t now = std::time(nullptr);
    std::tm* tm_now = std::localtime(&now);
    std::ostringstream ss;
    if (tm_now) {
        ss << std::put_time(tm_now, "%Y-%m-%d %H:%M:%S");
    } else {
        ss << "2026-11-08 14:00:00";
    }
    return ss.str();
}

} // namespace Monitor
