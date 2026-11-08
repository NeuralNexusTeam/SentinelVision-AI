#pragma once
#include "Types.hpp"
#include <cmath>
#include <vector>

namespace Monitor {

class EyeAspectCalculator {
public:
    EyeAspectCalculator() : m_filteredEAR(0.0f) {}

    static inline float euclideanDistance(const Point2D& p1, const Point2D& p2) {
        float dx = p1.x - p2.x;
        float dy = p1.y - p2.y;
        return std::sqrt(dx * dx + dy * dy);
    }

    /**
     * Compute Eye Aspect Ratio (EAR) given 6 eyelid landmark points:
     * p[0]: outer corner (P1)
     * p[1]: top-left (P2)
     * p[2]: top-right (P3)
     * p[3]: inner corner (P4)
     * p[4]: bottom-right (P5)
     * p[5]: bottom-left (P6)
     *
     * EAR = (|p2 - p6| + |p3 - p5|) / (2.0 * |p1 - p4|)
     */
    static float computeEAR(const std::vector<Point2D>& eyePoints) {
        if (eyePoints.size() < 6) {
            return 0.0f;
        }

        float verticalA = euclideanDistance(eyePoints[1], eyePoints[5]);
        float verticalB = euclideanDistance(eyePoints[2], eyePoints[4]);
        float horizontal = euclideanDistance(eyePoints[0], eyePoints[3]);

        if (horizontal <= 0.0001f) {
            return 0.0f;
        }

        return (verticalA + verticalB) / (2.0f * horizontal);
    }

    float smoothEAR(float rawEAR, float alpha = 0.65f) {
        if (m_filteredEAR <= 0.0f) {
            m_filteredEAR = rawEAR;
        } else {
            m_filteredEAR = (alpha * rawEAR) + ((1.0f - alpha) * m_filteredEAR);
        }
        return m_filteredEAR;
    }

    void reset() {
        m_filteredEAR = 0.0f;
    }

private:
    float m_filteredEAR;
};

} // namespace Monitor
