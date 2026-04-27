FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml /app/
RUN pip install --upgrade pip && pip install -e .

COPY . /app

EXPOSE 8000

# Run migrations then start the API. Alembic is idempotent so this is
# safe on repeated container restarts.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
