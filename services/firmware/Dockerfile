# SportLocker firmware — image Balena ARM64 (Raspberry Pi 4 CM4).
#
# Build :  balena push <appName>   (depuis services/firmware/)
# Run    :  systemd-managé par Balena, redémarrage auto sur crash.
#
# Multi-stage : on isole l'install pip dans builder pour garder
# l'image runtime sans toolchain (apt sources + gcc).

# ─── Stage 1 : build des deps Python ─────────────────────────────────────────
FROM balenalib/raspberrypi4-64-python:3.11-bookworm-build AS builder

WORKDIR /build

# Deps système nécessaires à la compilation cryptography + opencv + pyzbar.
RUN install_packages \
    build-essential \
    libssl-dev \
    libffi-dev \
    libzbar0 \
    libgl1-mesa-glx \
    libglib2.0-0

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─── Stage 2 : runtime minimal ───────────────────────────────────────────────
FROM balenalib/raspberrypi4-64-python:3.11-bookworm-run

WORKDIR /app

# Runtime-only deps (pas de toolchain — image plus légère pour OTA Balena).
RUN install_packages \
    libzbar0 \
    libgl1-mesa-glx \
    libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

# Code applicatif.
COPY pyproject.toml ./
COPY src/sportlocker_firmware ./sportlocker_firmware

# SQLite local (anti-replay + réservations cachées).
VOLUME ["/var/lib/sportlocker"]

# Healthcheck : présence du processus (Balena fait l'auto-restart).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD pgrep -f "sportlocker_firmware" > /dev/null || exit 1

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

CMD ["python", "-m", "sportlocker_firmware"]
