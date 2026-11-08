#pragma once
#include "Types.hpp"
#include "ThreadSync.hpp"
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>

namespace Monitor {

class HistoryRingBuffer {
public:
    explicit HistoryRingBuffer(size_t capacity = 100)
        : m_capacity(capacity), m_incidents() {
        m_incidents.reserve(capacity);
    }

    void addIncident(const std::string& type, const std::string& severity, float duration, const std::string& details) {
        LockGuard lock(m_mutex);
        m_counter++;
        
        IncidentRecord rec;
        rec.id = m_counter;
        rec.timestamp = getFormattedTimestamp();
        rec.type = type;
        rec.severity = severity;
        rec.durationSeconds = duration;
        rec.details = details;

        if (m_incidents.size() >= m_capacity) {
            m_incidents.erase(m_incidents.begin());
        }
        m_incidents.push_back(rec);
    }

    std::vector<IncidentRecord> getRecentIncidents(size_t count = 50) const {
        LockGuard lock(const_cast<Mutex&>(m_mutex));
        if (m_incidents.empty()) return {};

        size_t startIdx = (m_incidents.size() > count) ? (m_incidents.size() - count) : 0;
        std::vector<IncidentRecord> result(m_incidents.begin() + startIdx, m_incidents.end());
        return result;
    }

    void clear() {
        LockGuard lock(m_mutex);
        m_incidents.clear();
    }

    size_t size() const {
        LockGuard lock(const_cast<Mutex&>(m_mutex));
        return m_incidents.size();
    }

    std::string toJSON() const {
        LockGuard lock(const_cast<Mutex&>(m_mutex));
        std::ostringstream oss;
        oss << "[";
        for (size_t i = 0; i < m_incidents.size(); ++i) {
            const auto& r = m_incidents[m_incidents.size() - 1 - i]; // Most recent first
            oss << "{";
            oss << "\"id\":" << r.id << ",";
            oss << "\"timestamp\":\"" << r.timestamp << "\",";
            oss << "\"type\":\"" << r.type << "\",";
            oss << "\"severity\":\"" << r.severity << "\",";
            oss << "\"duration\":" << std::fixed << std::setprecision(1) << r.durationSeconds << ",";
            oss << "\"details\":\"" << r.details << "\"";
            oss << "}";
            if (i + 1 < m_incidents.size()) oss << ",";
        }
        oss << "]";
        return oss.str();
    }

private:
    size_t m_capacity;
    int m_counter = 0;
    mutable Mutex m_mutex;
    std::vector<IncidentRecord> m_incidents;
};

} // namespace Monitor
