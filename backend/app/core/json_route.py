import asyncio
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.routing import APIRoute
from starlette.types import Message

from app.core.errors import ApiError

MAX_JSON_BYTES = 128 * 1024
JSON_READ_TIMEOUT_SECONDS = 10


class BoundedJSONRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        handle = super().get_route_handler()

        async def bounded(request: Request) -> Response:
            def too_large() -> ApiError:
                return ApiError(413, "REQUEST_TOO_LARGE", "The request body is too large.")

            try:
                content_length = int(request.headers.get("content-length", "0"))
            except ValueError:
                raise ApiError(400, "INVALID_REQUEST", "The request has an invalid content length.") from None
            if content_length < 0:
                raise ApiError(400, "INVALID_REQUEST", "The request has an invalid content length.")
            if content_length > MAX_JSON_BYTES:
                raise too_large()
            received = 0
            deadline = asyncio.get_running_loop().time() + JSON_READ_TIMEOUT_SECONDS

            async def receive() -> Message:
                nonlocal received
                try:
                    async with asyncio.timeout_at(deadline):
                        message = await request.receive()
                except TimeoutError:
                    raise ApiError(408, "REQUEST_TIMEOUT", "The request timed out. Please try again.") from None
                received += len(message.get("body", b""))
                if received > MAX_JSON_BYTES:
                    raise too_large()
                return message

            return await handle(Request(request.scope, receive))

        return bounded
