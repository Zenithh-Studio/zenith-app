FROM python:3.12-slim AS package

ARG MUSE2API_REF=3a20b5e7aa4056c99c0eb8c732d73ce3804d5dbf

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN pip wheel --no-cache-dir --wheel-dir=/wheels \
  "git+https://github.com/www222fff/muse2api.git@${MUSE2API_REF}"

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  MUSE2API_HOST=0.0.0.0 \
  MUSE2API_DATA_DIR=/app/data \
  MUSE2API_CHROMIUM_PATH=/usr/local/bin/muse2api-chromium

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-wqy-zenhei ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 muse \
  && useradd --system --uid 1001 --gid muse --create-home muse \
  && mkdir -p /app/data /run/muse2api-auth \
  && chown -R 1001:1001 /app /run/muse2api-auth

RUN mkdir -p /run/muse2api-admin && chown 1001:1001 /run/muse2api-admin

COPY --from=package /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels muse2api \
  && rm -rf /wheels

WORKDIR /app
COPY --chown=1001:1001 entrypoint.sh /usr/local/bin/muse2api-entrypoint
COPY --chown=1001:1001 chromium.sh /usr/local/bin/muse2api-chromium
RUN chmod 755 /usr/local/bin/muse2api-entrypoint /usr/local/bin/muse2api-chromium

USER 1001:1001
EXPOSE 18610
ENTRYPOINT ["/usr/local/bin/muse2api-entrypoint"]
CMD ["muse2api"]
