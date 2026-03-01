#!/bin/sh
set -e

python - <<'PY'
import os
import socket
import time

host = os.getenv("DB_HOST", "db")
port = int(os.getenv("DB_PORT", "5432"))

for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit(f"Database is not reachable at {host}:{port}")
PY

python manage.py migrate --noinput

exec python manage.py runserver 0.0.0.0:8080
