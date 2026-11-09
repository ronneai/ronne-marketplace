# SkillSpector and Ronne's scan service (features 135 and 156; docs/knowledge/skill-scanner.md).
# The reviewed commit, abd82935b67f765a9541013c0866c6349251dcdf (v2.13.2), comes from git in the
# build, so the context is this folder alone:
#   docker build -t skillspector:2.13.2 scripts/skill-scanner
# (the tag `skillspector-sandbox` runs). Ronne's compose file builds it on the server as
# ronne-skillspector (156). The entrypoint is the scan service; the `skillspector` command is still
# in the image, which the wrapper runs with --entrypoint skillspector.
FROM ghcr.io/astral-sh/uv:0.13.7@sha256:96f40d3904aad8d0bd010539001d36c8e2188b981e1334471a90c4a1d93bb490 AS uv

FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337 AS builder
COPY --from=uv /uv /usr/local/bin/uv
ADD https://github.com/NVIDIA/SkillSpector.git#abd82935b67f765a9541013c0866c6349251dcdf /app
WORKDIR /app
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python3

FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337
RUN useradd --uid 10001 --no-create-home --home-dir /tmp --shell /usr/sbin/nologin scanner
COPY --from=builder /app/.venv /app/.venv
COPY scan-service.py /app/scan-service.py
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001
WORKDIR /tmp
EXPOSE 8080
ENTRYPOINT ["/app/.venv/bin/python", "-I", "/app/scan-service.py"]
