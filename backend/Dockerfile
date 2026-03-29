FROM python:3.12-slim

WORKDIR /app

# Copy everything first so hatchling can find the cobs package
COPY . .

RUN pip install uv && uv pip install --system ".[dev]"

CMD ["sh", "-c", "alembic upgrade head && uvicorn cobs.app:app --host 0.0.0.0 --port 8000"]
