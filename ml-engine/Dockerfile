# ===== SMART-Mataram — ML Engine (Python 3.11) =====
# Dijalankan on-demand: docker compose --profile ml run --rm ml-engine python -m src.pipeline
FROM python:3.11-slim

# libgomp1 = runtime xgboost. Wheel sklearn/xgboost sudah prebuilt (tak perlu compiler).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/ml-engine

# Jaringan homelab lambat/putus-putus → pip tahan-banting (retry banyak, timeout longgar)
ENV PIP_DEFAULT_TIMEOUT=300 \
    PIP_RETRIES=10 \
    PIP_PREFER_BINARY=1

# Wheel berat (scikit-learn + xgboost + scipy) di layer terpisah → kalau sukses
# ter-cache, retry build berikutnya tak mengulang download besar dari nol.
RUN pip install --no-cache-dir scipy scikit-learn xgboost

COPY ml-engine/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ml-engine ./

# Default: diam (idle). Perintah nyata diberikan lewat `docker compose run`.
CMD ["python", "-c", "print('ml-engine siap. Jalankan modul, mis: python -m src.pipeline / src.sync_gangguan')"]
