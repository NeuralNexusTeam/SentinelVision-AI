import numpy as np

class EyeAspectCalculator:
    """
    Computes Eye Aspect Ratio (EAR) based on the Soukupova and Cech (2016) formulation:
    EAR = (|p2 - p6| + |p3 - p5|) / (2.0 * |p1 - p4|)
    """
    # MediaPipe Face Landmark indices for 6-point EAR calculation
    # P1: outer corner, P2: top-left, P3: top-right, P4: inner corner, P5: bottom-right, P6: bottom-left
    LEFT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144]
    RIGHT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380]

    # Full eye contours for visual mesh HUD
    LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
    RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]

    def __init__(self, smoothing_alpha: float = 0.65):
        self.smoothing_alpha = smoothing_alpha
        self.smooth_left_ear = 0.0
        self.smooth_right_ear = 0.0
        self.smooth_avg_ear = 0.0

    @staticmethod
    def _euclidean_dist(pt1: np.ndarray, pt2: np.ndarray) -> float:
        return float(np.linalg.norm(pt1 - pt2))

    def calculate_ear_from_points(self, p1: np.ndarray, p2: np.ndarray, p3: np.ndarray,
                                   p4: np.ndarray, p5: np.ndarray, p6: np.ndarray) -> float:
        vertical_a = self._euclidean_dist(p2, p6)
        vertical_b = self._euclidean_dist(p3, p5)
        horizontal = self._euclidean_dist(p1, p4)

        if horizontal <= 1e-6:
            return 0.0

        return (vertical_a + vertical_b) / (2.0 * horizontal)

    def compute(self, landmarks, img_w: int, img_h: int):
        """
        Extract eye coordinates and compute EAR for both eyes.
        Returns: (avg_ear, left_ear, right_ear, left_pts, right_pts)
        """
        if not landmarks or len(landmarks) < 468:
            return 0.0, 0.0, 0.0, [], []

        # Extract coordinates for left eye 6 points
        left_pts = []
        for idx in self.LEFT_EYE_LANDMARKS:
            lm = landmarks[idx]
            left_pts.append(np.array([lm.x * img_w, lm.y * img_h], dtype=np.float32))

        # Extract coordinates for right eye 6 points
        right_pts = []
        for idx in self.RIGHT_EYE_LANDMARKS:
            lm = landmarks[idx]
            right_pts.append(np.array([lm.x * img_w, lm.y * img_h], dtype=np.float32))

        left_ear = self.calculate_ear_from_points(*left_pts)
        right_ear = self.calculate_ear_from_points(*right_pts)

        avg_ear = (left_ear + right_ear) / 2.0

        # Apply Exponential Moving Average filter
        if self.smooth_avg_ear <= 0.0:
            self.smooth_left_ear = left_ear
            self.smooth_right_ear = right_ear
            self.smooth_avg_ear = avg_ear
        else:
            self.smooth_left_ear = (self.smoothing_alpha * left_ear) + ((1.0 - self.smoothing_alpha) * self.smooth_left_ear)
            self.smooth_right_ear = (self.smoothing_alpha * right_ear) + ((1.0 - self.smoothing_alpha) * self.smooth_right_ear)
            self.smooth_avg_ear = (self.smoothing_alpha * avg_ear) + ((1.0 - self.smoothing_alpha) * self.smooth_avg_ear)

        return self.smooth_avg_ear, self.smooth_left_ear, self.smooth_right_ear, left_pts, right_pts

    def reset(self):
        self.smooth_left_ear = 0.0
        self.smooth_right_ear = 0.0
        self.smooth_avg_ear = 0.0
