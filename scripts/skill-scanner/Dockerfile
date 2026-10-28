# SkillSpector from its uv.lock (Ronne, feature 135; docs/knowledge/skill-scanner.md). Build it from
# a checkout of the reviewed commit, abd82935b67f765a9541013c0866c6349251dcdf (v2.13.2):
#   docker build -f /path/to/ronne-marketplace/scripts/skill-scanner/Dockerfile -t skillspector:2.13.2 .
FROM ghcr.io/astral-sh/uv:0.13.0@sha256:cdc6093146eb3ff6a40107b38f008b789e050e77ad87865e381d9917da55a168 AS uv

FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b AS builder
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
COPY src/ src/
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python3

FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
WORKDIR /scan
ENTRYPOINT ["skillspector"]
