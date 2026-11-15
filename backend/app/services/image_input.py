import asyncio
from io import BytesIO

import numpy as np
from fastapi import Request
from PIL import Image, ImageOps, UnidentifiedImageError
from python_multipart.exceptions import MultipartParseError
from python_multipart.multipart import MultipartParser, parse_options_header
from starlette.requests import ClientDisconnect

from app.core.errors import ApiError

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_MULTIPART_OVERHEAD_BYTES = 16 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MAX_IMAGE_SIDE = 8192
SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP"}
UPLOAD_TIMEOUT_SECONDS = 20


def invalid_upload() -> ApiError:
    return ApiError(400, "INVALID_IMAGE", "Upload one still image in the multipart file field.")


def upload_too_large() -> ApiError:
    return ApiError(413, "IMAGE_TOO_LARGE", "The photo exceeds the 8 MiB upload limit.")


class InMemoryFilePart:
    def __init__(self, output: BytesIO) -> None:
        self.output = output
        self.started = False
        self.finished = False
        self.header_name = bytearray()
        self.header_value = bytearray()
        self.header_bytes = 0
        self.disposition: bytes | None = None

    def start(self) -> None:
        if self.started:
            raise invalid_upload()
        self.started = True

    def _add_header(self, target: bytearray, data: bytes, start: int, end: int) -> None:
        self.header_bytes += end - start
        if self.header_bytes > MAX_MULTIPART_OVERHEAD_BYTES:
            raise invalid_upload()
        target.extend(data[start:end])

    def add_header_name(self, data: bytes, start: int, end: int) -> None:
        self._add_header(self.header_name, data, start, end)

    def add_header_value(self, data: bytes, start: int, end: int) -> None:
        self._add_header(self.header_value, data, start, end)

    def end_header(self) -> None:
        if self.header_name.lower() == b"content-disposition":
            if self.disposition is not None:
                raise invalid_upload()
            self.disposition = bytes(self.header_value)
        self.header_name.clear()
        self.header_value.clear()

    def end_headers(self) -> None:
        disposition, options = parse_options_header(self.disposition)
        if disposition != b"form-data" or options.get(b"name") != b"file" or b"filename" not in options:
            raise invalid_upload()

    def add_data(self, data: bytes, start: int, end: int) -> None:
        if self.output.tell() + end - start > MAX_UPLOAD_BYTES:
            raise upload_too_large()
        self.output.write(memoryview(data)[start:end])

    def finish(self) -> None:
        self.finished = True


async def read_image_upload(request: Request, output: BytesIO) -> None:
    """Stream a single file part into RAM without an UploadFile or temporary file."""
    content_type, options = parse_options_header(request.headers.get("content-type"))
    boundary = options.get(b"boundary")
    if content_type != b"multipart/form-data" or not boundary or len(boundary) > 70:
        raise invalid_upload()

    limit = MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES
    try:
        content_length = int(request.headers.get("content-length", "0"))
    except ValueError:
        raise invalid_upload() from None
    if content_length < 0:
        raise invalid_upload()
    if content_length > limit:
        raise upload_too_large()

    part = InMemoryFilePart(output)
    parser = MultipartParser(
        boundary,
        {
            "on_part_begin": part.start,
            "on_header_field": part.add_header_name,
            "on_header_value": part.add_header_value,
            "on_header_end": part.end_header,
            "on_headers_finished": part.end_headers,
            "on_part_data": part.add_data,
            "on_end": part.finish,
        },
    )
    received = 0
    try:
        async with asyncio.timeout(UPLOAD_TIMEOUT_SECONDS):
            async for chunk in request.stream():
                received += len(chunk)
                if received > limit:
                    raise upload_too_large()
                if chunk:
                    parser.write(chunk)
        parser.finalize()
    except TimeoutError:
        raise ApiError(408, "REQUEST_TIMEOUT", "The photo upload timed out. Please try again.") from None
    except (MultipartParseError, ClientDisconnect):
        raise invalid_upload() from None

    if not part.finished or output.tell() == 0:
        raise invalid_upload()
    output.seek(0)


def decoded_image_too_large() -> ApiError:
    return ApiError(
        413,
        "IMAGE_TOO_LARGE",
        "The decoded photo must be at most 20 megapixels and 8192 pixels on each side.",
    )


def decode_image(source: BytesIO) -> np.ndarray:
    try:
        with Image.open(source) as image:
            if image.format not in SUPPORTED_FORMATS:
                raise ApiError(400, "UNSUPPORTED_IMAGE_TYPE", "Use a JPEG, PNG, or WebP photo.")
            width, height = image.size
            if width * height > MAX_IMAGE_PIXELS or max(width, height) > MAX_IMAGE_SIDE:
                raise decoded_image_too_large()
            if getattr(image, "n_frames", 1) != 1:
                raise ApiError(400, "UNSUPPORTED_IMAGE_TYPE", "Upload a single still image.")
            # Transpose the open image in place to avoid retaining another full-size copy.
            ImageOps.exif_transpose(image, in_place=True)
            with image.convert("RGB") as rgb:
                return np.array(rgb, dtype=np.uint8)
    except Image.DecompressionBombError:
        raise decoded_image_too_large() from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, OverflowError):
        raise ApiError(400, "INVALID_IMAGE", "The photo could not be decoded. Retake it and try again.") from None
