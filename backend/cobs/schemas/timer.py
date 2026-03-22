from pydantic import BaseModel


class TimerSetRequest(BaseModel):
    minutes: int | None  # None or 0 to clear
