from io import BytesIO
from math import atan, degrees
from types import SimpleNamespace
from uuid import uuid4

import pytest
from PIL import Image

from app.core.errors import ApiError
from app.schemas import ImageSize
from app.services.image_input import decode_image
from app.services.posture_analyzer import analyze_photo, extract_landmarks, measure
from app.services.rule_engine import observe
from app.services.session_cache import SessionCache

IMAGE_SIZE = ImageSize(width=1080, height=1440)
CORE_POINTS = {11: (0.35, 0.28), 12: (0.65, 0.28), 23: (0.40, 0.68), 24: (0.60, 0.68)}


def make_pose(points=None):
    pose = [None] * 33
    for index, (x, y) in (points or CORE_POINTS).items():
        pose[index] = SimpleNamespace(x=x, y=y, visibility=0.99)
    return pose


def test_horizontal_shoulders_hips_and_no_torso_lean():
    landmarks = extract_landmarks(make_pose(), 0.60)
    measured = measure(landmarks, IMAGE_SIZE)
    assert measured.shoulder_angle_deg == 0
    assert measured.shoulder_asymmetry_percent == 0
    assert measured.hip_angle_deg == 0
    assert measured.hip_asymmetry_percent == 0
    assert measured.torso_lean_angle_deg == 0
    assert observe(landmarks).shoulder.direction == "aligned_with_image_horizontal"
    assert observe(landmarks).torso.direction == "no_lateral_offset"


@pytest.mark.parametrize("reverse_anatomical_order", [False, True])
@pytest.mark.parametrize("sign", [-1, 1])
def test_signed_screen_angles_and_pixel_scaling(reverse_anatomical_order, sign):
    shoulders = [(0.35, 0.28), (0.65, 0.28 + sign * 0.04)]
    hips = [(0.40, 0.68), (0.60, 0.68 - sign * 0.02)]
    if reverse_anatomical_order:
        shoulders.reverse()
        hips.reverse()
    points = dict(zip(CORE_POINTS, shoulders + hips))
    landmarks = extract_landmarks(make_pose(points), 0.6)
    measured = measure(landmarks, IMAGE_SIZE)
    shoulder_slope = sign * 0.04 * IMAGE_SIZE.height / (0.30 * IMAGE_SIZE.width)
    hip_slope = -sign * 0.02 * IMAGE_SIZE.height / (0.20 * IMAGE_SIZE.width)
    assert measured.shoulder_angle_deg == pytest.approx(degrees(atan(shoulder_slope)))
    assert measured.shoulder_asymmetry_percent == pytest.approx(100 * abs(shoulder_slope))
    assert measured.hip_angle_deg == pytest.approx(degrees(atan(hip_slope)))
    assert measured.hip_asymmetry_percent == pytest.approx(100 * abs(hip_slope))
    height_direction = "left" if (sign > 0) != reverse_anatomical_order else "right"
    assert observe(landmarks).shoulder.direction == f"{height_direction}_landmark_higher_in_image"


@pytest.mark.parametrize(("sign", "direction"), [(1, "rightward"), (-1, "leftward")])
def test_torso_lean_uses_screen_x_and_actual_aspect_ratio(sign, direction):
    points = {**CORE_POINTS, 11: (0.35 + sign * 0.1, 0.28), 12: (0.65 + sign * 0.1, 0.28)}
    landmarks = extract_landmarks(make_pose(points), 0.60)
    measured = measure(landmarks, IMAGE_SIZE)
    assert measured.torso_lean_angle_deg == pytest.approx(degrees(atan(sign * 108 / 576)))
    assert observe(landmarks).torso.direction == f"{direction}_lateral_offset"


@pytest.mark.parametrize(
    "points",
    [
        {**CORE_POINTS, 12: (0.35, 0.28)},
        {**CORE_POINTS, 24: (0.4001, 0.68)},
        {**CORE_POINTS, 23: (0.40, 0.25), 24: (0.60, 0.25)},
    ],
)
def test_degenerate_geometry(points):
    with pytest.raises(ApiError) as caught:
        measure(extract_landmarks(make_pose(points), 0.60), IMAGE_SIZE)
    assert caught.value.code == "DEGENERATE_GEOMETRY"


@pytest.mark.parametrize(
    ("landmark", "error_code"),
    [
        (None, "INSUFFICIENT_LANDMARKS"),
        (SimpleNamespace(x=float("nan"), y=0.2, visibility=0.9), "INSUFFICIENT_LANDMARKS"),
        (SimpleNamespace(x=1.01, y=0.2, visibility=0.9), "INSUFFICIENT_LANDMARKS"),
        (SimpleNamespace(x=0.8, y=0.2, visibility=0.59), "LOW_LANDMARK_VISIBILITY"),
        (SimpleNamespace(x=0.8, y=0.2, visibility=None), "INSUFFICIENT_LANDMARKS"),
    ],
)
def test_unusable_landmark(landmark, error_code):
    pose = make_pose()
    pose[12] = landmark
    with pytest.raises(ApiError) as caught:
        extract_landmarks(pose, 0.6)
    assert caught.value.code == error_code


def test_missing_pose_elements():
    with pytest.raises(ApiError) as caught:
        extract_landmarks(make_pose()[:20], 0.6)
    assert caught.value.code == "INSUFFICIENT_LANDMARKS"


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP"])
def test_image_formats_decode_to_rgb(format):
    source = BytesIO()
    Image.new("RGB", (12, 24), "red").save(source, format=format)
    source.seek(0)
    result = decode_image(source)
    assert result.shape == (24, 12, 3)
    assert result[0, 0, 0] > 245
    assert result[0, 0, 2] < 10


def test_exif_orientation_applies_before_dimensions_are_read():
    source = BytesIO()
    image = Image.new("RGB", (50, 100), "red")
    image.paste("blue", (0, 0, 50, 50))
    exif = image.getexif()
    exif[274] = 6
    image.save(source, format="JPEG", exif=exif)
    source.seek(0)
    result = decode_image(source)
    assert result.shape == (50, 100, 3)
    assert result[25, 20, 0] > 245
    assert result[25, 80, 2] > 245


def test_decoded_dimension_limit():
    source = BytesIO()
    Image.new("L", (8193, 10)).save(source, format="PNG")
    source.seek(0)
    with pytest.raises(ApiError) as caught:
        decode_image(source)
    assert caught.value.status_code == 413
    assert caught.value.code == "IMAGE_TOO_LARGE"


def test_animated_webp_is_rejected():
    source = BytesIO()
    frames = [Image.new("RGB", (20, 40), color) for color in ["red", "blue"]]
    frames[0].save(source, format="WEBP", save_all=True, append_images=frames[1:], duration=100)
    source.seek(0)
    with pytest.raises(ApiError) as caught:
        decode_image(source)
    assert caught.value.code == "UNSUPPORTED_IMAGE_TYPE"


def test_cache_expires_with_monotonic_clock_and_eviction():
    current = 100.0
    cache = SessionCache(max_entries=2, clock=lambda: current)
    source = BytesIO()
    Image.new("RGB", (120, 200)).save(source, format="PNG")
    source.seek(0)
    first = analyze_photo(source, SimpleNamespace(detect=lambda _: make_pose()), 0.6)
    second = first.model_copy(update={"analysis_id": uuid4()})
    third = first.model_copy(update={"analysis_id": uuid4()})
    cache.add(first)
    assert cache.require(first.analysis_id) is first
    cache.add(second)
    cache.add(third)
    with pytest.raises(ApiError) as evicted:
        cache.require(first.analysis_id)
    assert evicted.value.code == "ANALYSIS_SESSION_EXPIRED"
    current += 1799.9
    assert cache.require(second.analysis_id) is second
    current += 0.1
    with pytest.raises(ApiError) as expired:
        cache.require(second.analysis_id)
    assert expired.value.status_code == 404
    assert expired.value.code == "ANALYSIS_SESSION_EXPIRED"
