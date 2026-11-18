# SkillSpector and Ronne's scan service (features 135 and 156; docs/knowledge/skill-scanner.md).
# The reviewed commit, 54824463814a0be01360792523ec7245a69190fc (v2.13.4), comes from git in the
# build, so the context is this folder alone:
#   docker build -t skillspector:2.13.4 scripts/skill-scanner
# (the tag `skillspector-sandbox` runs). Ronne's compose file builds it on the server as
# ronne-skillspector (156). The entrypoint is the scan service; the `skillspector` command is still
# in the image, which the wrapper runs with --entrypoint skillspector.
FROM ghcr.io/astral-sh/uv:0.13.8@sha256:5cc1805e2426484abca4ad46ea783bab281fdb225fd82d8ce6d66a81254bac85 AS uv

FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df AS builder
COPY --from=uv /uv /usr/local/bin/uv
ADD https://github.com/NVIDIA/SkillSpector.git#54824463814a0be01360792523ec7245a69190fc /app
WORKDIR /app
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python3

FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
# Debian's security updates, as the app image does: a fix Debian publishes before the Python image
# is rebuilt with it still gets in, so the scan doesn't block every build meanwhile.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
RUN useradd --uid 10001 --no-create-home --home-dir /tmp --shell /usr/sbin/nologin scanner
COPY --from=builder /app/.venv /app/.venv
COPY scan-service.py /app/scan-service.py
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001
WORKDIR /tmp
EXPOSE 8080
ENTRYPOINT ["/app/.venv/bin/python", "-I", "/app/scan-service.py"]
