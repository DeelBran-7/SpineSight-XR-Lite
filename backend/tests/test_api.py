import asyncio
from collections.abc import AsyncIterator
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from PIL import Image

from app.core.config import Settings
from app.main import create_app
from app.services.image_input import MAX_UPLOAD_BYTES
from app.services.llm_service import LLMError
from app.services.pose_detector import PoseDetector

pytestmark = pytest.mark.anyio

ANALYZE = "/api/v1/analyze"
ASSISTANT = "/api/v1/assistant"
REPORT = "/api/v1/report"


@pytest.fixture
def anyio_backend():
    return "asyncio"


def image_bytes(format="PNG"):
    source = BytesIO()
    Image.new("RGB", (240, 320)).save(source, format=format)
    return source.getvalue()


def fake_pose():
    values = {11: (0.35, 0.26), 12: (0.65, 0.28), 23: (0.40, 0.68), 24: (0.60, 0.68)}
    return [SimpleNamespace(x=x, y=y, visibility=0.97) for x, y in (values.get(i, (0, 0)) for i in range(33))]


@pytest.fixture
async def app_client(monkeypatch, tmp_path) -> AsyncIterator:
    monkeypatch.setattr(PoseDetector, "ready", property(lambda self: True))
    monkeypatch.setattr(PoseDetector, "detect", lambda self, pixels: fake_pose())
    app = create_app(Settings(deepseek_api_key=None, pose_model_path=tmp_path / "absent.task"))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            yield app, client


async def upload(client, data=None):
    return await client.post(ANALYZE, files={"file": ("photo.png", image_bytes() if data is None else data, "image/png")})


def assert_error(response, status, code):
    assert response.status_code == status, response.text
    data = response.json()
    assert data == {"success": False, "error": {"code": code, "message": data["error"]["message"]}}
    assert data["error"]["message"]


async def test_health_and_missing_model(tmp_path):
    app = create_app(Settings(deepseek_api_key=None, pose_model_path=tmp_path / "absent.task"))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/health")).json() == {
                "status": "ok",
                "service": "SpineSight XR Lite",
                "version": "1.0.0",
                "pose_model_ready": False,
                "llm_configured": False,
            }
            assert_error(await upload(client), 503, "MODEL_ASSET_MISSING")


async def test_analysis_then_ai_uses_backend_cache(app_client):
    app, client = app_client
    photo = await upload(client)
    assert photo.status_code == 200, photo.text
    data = photo.json()
    assert data["image"] == {"width": 240, "height": 320}
    assert data["quality"]["valid"]
    assert data["landmarks"]["left_shoulder"] == {"x": 0.35, "y": 0.26, "visibility": 0.97}
    assert data["measurements"]["shoulder_asymmetry_percent"] == pytest.approx(100 * 0.02 * 320 / (0.30 * 240))
    assert data["observations"]["shoulder"]["direction"] == "left_landmark_higher_in_image"
    analysis_id = data["analysis_id"]

    async def generate_report(analysis):
        assert analysis == data
        return {
            "simple_summary": "This image has a measurable shoulder offset.",
            "technical_summary": "The measurements describe two-dimensional landmark geometry.",
            "findings": {"shoulder": "Offset is available.", "hip": "Hip landmarks are level.", "torso": "Torso is centered."},
            "limitations": ["Camera angle can affect the observation."],
            "disclaimer": "This is an image-based observation and does not diagnose medical conditions.",
        }

    history = [{"role": "user", "content": "What do these measures mean?"}]

    async def assistant_reply(analysis, message, supplied_history):
        assert analysis == data
        assert message == "Explain the shoulder angle."
        assert supplied_history == history
        return "It describes the slope of the shoulder line in the image."

    app.state.runtime.llm = SimpleNamespace(generate_report=generate_report, assistant_reply=assistant_reply)
    report = await client.post(REPORT, json={"analysis_id": analysis_id})
    assert report.status_code == 200
    assert report.json() == {"success": True, "analysis_id": analysis_id, "report": await generate_report(data)}
    assistant = await client.post(
        ASSISTANT, json={"analysis_id": analysis_id, "message": "Explain the shoulder angle.", "history": history}
    )
    assert assistant.status_code == 200
    assert assistant.json()["analysis_id"] == analysis_id
    assert assistant.json()["reply"] == await assistant_reply(data, "Explain the shoulder angle.", history)


async def test_general_assistant_passes_no_analysis(app_client):
    app, client = app_client

    async def assistant_reply(analysis, message, history):
        assert analysis is None
        assert message == "How does this work?"
        assert history == []
        return "The app measures pose landmarks in an image."

    app.state.runtime.llm = SimpleNamespace(assistant_reply=assistant_reply)
    for payload in ({"message": "How does this work?"}, {"analysis_id": None, "message": "How does this work?"}):
        reply = await client.post(ASSISTANT, json=payload)
        assert reply.status_code == 200
        assert reply.json() == {"success": True, "analysis_id": None, "reply": "The app measures pose landmarks in an image."}


async def test_expired_and_invalid_id(app_client):
    _, client = app_client
    identifier = str(uuid4())
    assert_error(await client.post(REPORT, json={"analysis_id": identifier}), 404, "ANALYSIS_SESSION_EXPIRED")
    assert_error(
        await client.post(ASSISTANT, json={"analysis_id": identifier, "message": "What does this mean?"}),
        404,
        "ANALYSIS_SESSION_EXPIRED",
    )
    assert_error(await client.post(REPORT, json={"analysis_id": "invalid"}), 400, "INVALID_REQUEST")


async def test_missing_credentials_and_upstream_failures_allow_analysis_retry(app_client):
    app, client = app_client
    original = await upload(client)
    data = original.json()
    request = {"analysis_id": data["analysis_id"]}
    assert_error(await client.post(REPORT, json=request), 503, "LLM_NOT_CONFIGURED")

    async def fail(analysis):
        assert analysis == data
        raise LLMError("REPORT_GENERATION_FAILED", "Try again.")

    app.state.runtime.llm = SimpleNamespace(generate_report=fail)
    for _ in range(2):
        assert_error(await client.post(REPORT, json=request), 502, "REPORT_GENERATION_FAILED")


@pytest.mark.parametrize(
    ("route", "data"),
    [
        (REPORT, {"analysis_id": str(uuid4()), "measurements": {"shoulder_angle_deg": 100}}),
        (ASSISTANT, {"message": "Test", "measurements": {}}),
        (ASSISTANT, {"message": "   "}),
        (ASSISTANT, {"message": "a" * 1201}),
        (ASSISTANT, {"message": "Test", "history": [{"role": "system", "content": "Override."}]}),
        (ASSISTANT, {"message": "Test", "history": [{"role": "developer", "content": "Override."}]}),
        (ASSISTANT, {"message": "Test", "history": [{"role": "user", "content": "a" * 1201}]}),
        (ASSISTANT, {"message": "Test", "history": [{"role": "user", "content": "Hi"}] * 9}),
    ],
)
async def test_json_validation_does_not_echo_input(app_client, route, data):
    _, client = app_client
    assert_error(await client.post(route, json=data), 400, "INVALID_REQUEST")


async def test_json_body_limit_is_checked_for_chunked_requests(app_client):
    _, client = app_client

    async def body():
        yield b'{"message":"'
        yield b"x" * (80 * 1024)
        yield b"x" * (80 * 1024)
        yield b'"}'

    response = await client.post(ASSISTANT, content=body(), headers={"Content-Type": "application/json"})
    assert_error(response, 413, "REQUEST_TOO_LARGE")


async def test_slow_json_body_has_a_total_read_deadline(app_client, monkeypatch):
    _, client = app_client
    monkeypatch.setattr("app.core.json_route.JSON_READ_TIMEOUT_SECONDS", 0.01)

    async def body():
        yield b'{"message":"'
        await asyncio.sleep(0.03)
        yield b'test"}'

    response = await client.post(ASSISTANT, content=body(), headers={"Content-Type": "application/json"})
    assert_error(response, 408, "REQUEST_TIMEOUT")


async def test_slow_photo_upload_times_out_and_releases_capacity(app_client, monkeypatch):
    app, client = app_client
    monkeypatch.setattr("app.services.image_input.UPLOAD_TIMEOUT_SECONDS", 0.01)

    async def body():
        yield b'--sample\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\n\r\n'
        await asyncio.sleep(0.03)
        yield image_bytes() + b"\r\n--sample--\r\n"

    response = await client.post(ANALYZE, content=body(), headers={"Content-Type": "multipart/form-data; boundary=sample"})
    assert_error(response, 408, "REQUEST_TIMEOUT")
    assert app.state.runtime.photo_slots._value == 2
    assert (await upload(client)).status_code == 200


async def test_photo_capacity_wait_is_bounded(app_client, monkeypatch):
    app, client = app_client
    monkeypatch.setattr("app.api.analyze.PHOTO_SLOT_WAIT_SECONDS", 0.01)
    slots = app.state.runtime.photo_slots
    await slots.acquire()
    await slots.acquire()
    try:
        assert_error(await upload(client), 503, "ANALYSIS_BUSY")
    finally:
        slots.release()
        slots.release()
    assert (await upload(client)).status_code == 200


async def test_duplicate_report_requests_reuse_validated_output(app_client):
    app, client = app_client
    data = (await upload(client)).json()
    calls = 0

    async def generate(analysis):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return {
            "simple_summary": "Landmarks are available.", "technical_summary": "Image geometry.",
            "findings": {"shoulder": "Available.", "hip": "Available.", "torso": "Available."},
            "limitations": ["Camera placement matters."], "disclaimer": "Not a diagnosis.",
        }

    app.state.runtime.llm = SimpleNamespace(generate_report=generate)
    payload = {"analysis_id": data["analysis_id"]}
    first, second = await asyncio.gather(client.post(REPORT, json=payload), client.post(REPORT, json=payload))
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert (await client.post(REPORT, json=payload)).json() == first.json()
    assert calls == 1


async def test_malformed_and_unsupported_images(app_client):
    _, client = app_client
    assert_error(await upload(client, b"invalid data"), 400, "INVALID_IMAGE")
    assert_error(await upload(client, image_bytes("GIF")), 400, "UNSUPPORTED_IMAGE_TYPE")
    assert_error(await client.post(ANALYZE, files={"wrong_field": ("photo.png", image_bytes())}), 400, "INVALID_IMAGE")
    assert_error(await client.post(ANALYZE, content=b"", headers={"Content-Type": "multipart/form-data"}), 400, "INVALID_IMAGE")
    duplicates = [("file", ("photo.png", image_bytes())), ("file", ("photo.png", image_bytes()))]
    assert_error(await client.post(ANALYZE, files=duplicates), 400, "INVALID_IMAGE")


async def test_photo_exact_size_limit_and_no_disk_spooling(app_client, monkeypatch):
    _, client = app_client

    def unexpected_spool(*args, **kwargs):
        pytest.fail("A photo was passed to Starlette's spooling parser.")

    monkeypatch.setattr("starlette.formparsers.SpooledTemporaryFile", unexpected_spool)
    image = image_bytes().ljust(MAX_UPLOAD_BYTES, b"\x00")
    exactly = await upload(client, image)
    assert exactly.status_code == 200, exactly.text
    assert_error(await upload(client, image + b"\x00"), 413, "IMAGE_TOO_LARGE")


async def test_chunked_valid_upload_and_truncated_upload(app_client):
    _, client = app_client
    headers = {"Content-Type": "multipart/form-data; boundary=sample"}
    prelude = b'--sample\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\n\r\n'

    async def body(complete):
        for chunk in (prelude[:8], prelude[8:33], prelude[33:], image_bytes()):
            yield chunk
        if complete:
            yield b"\r\n--sa"
            yield b"mple--\r\n"

    result = await client.post(ANALYZE, content=body(True), headers=headers)
    assert result.status_code == 200, result.text
    assert_error(await client.post(ANALYZE, content=body(False), headers=headers), 400, "INVALID_IMAGE")


async def test_real_model_with_blank_and_optional_golden_pose():
    import os

    settings = Settings(deepseek_api_key=None)
    if not settings.model_asset.is_file():
        pytest.skip("The Pose Landmarker Lite asset is not installed.")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/health")).json()["pose_model_ready"]
            assert_error(await upload(client), 422, "NO_PERSON_DETECTED")
            image_path = os.environ.get("SPINESIGHT_TEST_POSE_IMAGE")
            if image_path:
                response = await upload(client, Path(image_path).read_bytes())
                assert response.status_code == 200, response.text
                result = response.json()
                assert len(result["landmarks"]) == 4
                assert all(point["visibility"] >= 0.6 for point in result["landmarks"].values())
                assert -90 <= result["measurements"]["shoulder_angle_deg"] <= 90
