FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run typecheck && npm run build

FROM golang:1.26.0-alpine AS backend
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=10000 FRONTEND_DIR=/app/frontend
COPY database/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --timeout 120 -r /tmp/requirements.txt \
    && useradd --uid 10001 --create-home app
COPY --from=backend /out/api /app/api
COPY --from=frontend /src/dist /app/frontend
COPY --chown=10001:10001 database/ /app/database/
COPY deployment/start.py /app/deployment/start.py
USER 10001:10001
EXPOSE 10000
CMD ["python", "/app/deployment/start.py"]
