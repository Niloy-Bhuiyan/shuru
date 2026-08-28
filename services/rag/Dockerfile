# Shuru retrieval service.
#
# Two things drive the shape of this file, and both are about fastembed:
#
#   1. The ONNX embedding model is ~90 MB and is downloaded on first use. If
#      that happens at request time the first question after every deploy
#      hangs for ~35 seconds and looks like the service is broken. So it is
#      baked into the image at build time instead.
#   2. The model must be the SAME one the index was built with. A different
#      model produces vectors in a different space, which does not error --
#      it silently returns nothing relevant. The model name is pinned here to
#      the value config.py validates against.

FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # fastembed caches the ONNX model here; must match the volume below if
    # one is mounted.
    FASTEMBED_CACHE_PATH=/opt/fastembed

WORKDIR /srv

# Dependencies first, so a code change does not re-download torch-free ONNX
# wheels on every build.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Warm the model into the image. Without this the cost lands on the first
# real user instead of on CI.
RUN python -c "\
from fastembed import TextEmbedding; \
TextEmbedding(model_name='BAAI/bge-small-en-v1.5'); \
print('embedding model cached')"

COPY app ./app

# Runs unprivileged. The service holds a Supabase service key and an Anthropic
# key in its environment; root buys nothing and costs blast radius.
RUN useradd --create-home --uid 10001 shuru \
 && chown -R shuru:shuru /srv /opt/fastembed
USER shuru

# Hosts inject PORT; default matches the local dev port in CONTEXT.md §10.
ENV PORT=8000
EXPOSE 8000

# /health is deliberately unauthenticated and does not touch the database, so
# a platform health check cannot be fooled by a working process with a broken
# connection -- use /ready (token-gated) for that.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",8000)}/health').read()"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
