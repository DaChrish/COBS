FROM tiangolo/uvicorn-gunicorn-fastapi:python3.11

WORKDIR /app

COPY optimizer_service.py .

# Install only ortools (base image already has fastapi + uvicorn)
RUN pip install --default-timeout=300 --retries=10 ortools

EXPOSE 8001

CMD ["uvicorn", "optimizer_service:app", "--host", "0.0.0.0", "--port", "8001"]
