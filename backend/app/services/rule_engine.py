from math import isclose

from app.schemas import CoreLandmarks, FeatureObservation, Observations


def line_direction(left_y: float, right_y: float) -> str:
    if isclose(left_y, right_y, rel_tol=0, abs_tol=1e-9):
        return "aligned_with_image_horizontal"
    if left_y < right_y:
        return "left_landmark_higher_in_image"
    return "right_landmark_higher_in_image"


def torso_direction(shoulder_x: float, hip_x: float) -> str:
    if isclose(shoulder_x, hip_x, rel_tol=0, abs_tol=1e-9):
        return "no_lateral_offset"
    if shoulder_x < hip_x:
        return "leftward_lateral_offset"
    return "rightward_lateral_offset"


def observe(landmarks: CoreLandmarks) -> Observations:
    shoulders = landmarks.left_shoulder, landmarks.right_shoulder
    hips = landmarks.left_hip, landmarks.right_hip
    shoulder_midpoint_x = (shoulders[0].x + shoulders[1].x) / 2
    hip_midpoint_x = (hips[0].x + hips[1].x) / 2
    return Observations(
        shoulder=FeatureObservation(direction=line_direction(shoulders[0].y, shoulders[1].y)),
        hip=FeatureObservation(direction=line_direction(hips[0].y, hips[1].y)),
        torso=FeatureObservation(direction=torso_direction(shoulder_midpoint_x, hip_midpoint_x)),
    )
