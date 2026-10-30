# SkillSpector and Ronne's scan service (features 135 and 156; docs/knowledge/skill-scanner.md).
# The reviewed commit, abd82935b67f765a9541013c0866c6349251dcdf (v2.13.2), comes from git in the
# build, so the context is this folder alone:
#   docker build -t skillspector:2.13.2 scripts/skill-scanner
# (the tag `skillspector-sandbox` runs). Ronne's compose file builds it on the server as
# ronne-skillspector (156). The entrypoint is the scan service; the `skillspector` command is still
# in the image, which the wrapper runs with --entrypoint skillspector.
FROM ghcr.io/astral-sh/uv:0.13.6@sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0 AS uv

FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b AS builder
COPY --from=uv /uv /usr/local/bin/uv
ADD https://github.com/NVIDIA/SkillSpector.git#abd82935b67f765a9541013c0866c6349251dcdf /app
WORKDIR /app
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python3

FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b
RUN useradd --uid 10001 --no-create-home --home-dir /tmp --shell /usr/sbin/nologin scanner
COPY --from=builder /app/.venv /app/.venv
COPY scan-service.py /app/scan-service.py
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001
WORKDIR /tmp
EXPOSE 8080
ENTRYPOINT ["/app/.venv/bin/python", "-I", "/app/scan-service.py"]
