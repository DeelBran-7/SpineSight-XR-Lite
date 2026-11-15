from fastapi import HTTPException

from app.schemas import ErrorResponse


class ApiError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(status_code=status_code, detail=message)
        self.code = code


def error_responses(*statuses: int) -> dict:
    return {status: {"model": ErrorResponse} for status in statuses}
