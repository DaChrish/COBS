FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install uv && uv pip install --system -e ".[dev]"

COPY . .

CMD ["uvicorn", "cobs.app:app", "--host", "0.0.0.0", "--port", "8000"]
