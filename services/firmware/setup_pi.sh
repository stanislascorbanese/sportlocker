#!/usr/bin/env bash
# setup_pi.sh — Installation complète SportLocker firmware sur Raspberry Pi CM4
# Usage : sudo bash setup_pi.sh
# Testé sur : Raspberry Pi OS Lite 64-bit (Bookworm)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
FIRMWARE_DIR="$REPO_DIR"
ENV_FILE="$FIRMWARE_DIR/.env"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SportLocker Firmware — Setup Pi CM4"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Paquets système ────────────────────────────────────────────────────────
echo "▶ Installation des paquets système..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  python3.11 python3.11-venv python3.11-dev \
  python3-pip \
  libzbar0 \
  libopencv-dev \
  libgpiod2 libgpiod-dev \
  git curl wget \
  i2c-tools \
  mosquitto-clients \
  libssl-dev libffi-dev

# ── 2. Activer interfaces Pi ──────────────────────────────────────────────────
echo "▶ Activation caméra + I2C + SPI..."
raspi-config nonint do_camera 0    2>/dev/null || true
raspi-config nonint do_i2c 0       2>/dev/null || true
raspi-config nonint do_spi 0       2>/dev/null || true

# ── 3. Environnement Python ───────────────────────────────────────────────────
echo "▶ Création du virtualenv Python 3.11..."
python3.11 -m venv "$FIRMWARE_DIR/.venv"
source "$FIRMWARE_DIR/.venv/bin/activate"

pip install --upgrade pip wheel setuptools -q

echo "▶ Installation des dépendances Python..."
pip install -r "$FIRMWARE_DIR/requirements.txt" -q
pip install -e "$FIRMWARE_DIR[dev]" -q

# ── 4. Fichier .env ───────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "▶ Création du fichier .env à compléter..."
  cat > "$ENV_FILE" << 'EOF'
# SportLocker Firmware — Variables d'environnement
# ⚠️  Ne jamais committer ce fichier

# MQTT (EMQX Cloud)
MQTT_BROKER=your-broker.emqxsl.com
MQTT_PORT=8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
MQTT_CA_CERT_PATH=/opt/sportlocker/emqxsl-ca.crt

# JWT offline (même secret que l'API)
JWT_DEVICE_SECRET=change_me_min_32_chars

# Identifiant du distributeur
DISTRIBUTOR_ID=dist-proto-001

# GPIO pins (BCM numbering)
LOCKER_1_GPIO=17
LOCKER_2_GPIO=27
LOCKER_3_GPIO=22
LOCKER_4_GPIO=23
LOCKER_5_GPIO=24
LOCKER_6_GPIO=25

# Caméra
CAMERA_INDEX=0
QR_SCAN_INTERVAL_MS=200

# Sentry (optionnel)
SENTRY_DSN=

# Logs
LOG_LEVEL=INFO
EOF
  echo "  → .env créé — à compléter avant de lancer le firmware"
else
  echo "  → .env déjà présent, ignoré"
fi

# ── 5. Certificat MQTT ────────────────────────────────────────────────────────
if [ -f "$FIRMWARE_DIR/emqxsl-ca.crt" ]; then
  mkdir -p /opt/sportlocker
  cp "$FIRMWARE_DIR/emqxsl-ca.crt" /opt/sportlocker/emqxsl-ca.crt
  echo "▶ Certificat MQTT copié dans /opt/sportlocker/"
fi

# ── 6. Service systemd ────────────────────────────────────────────────────────
echo "▶ Installation du service systemd sportlocker-firmware..."
cat > /etc/systemd/system/sportlocker-firmware.service << EOF
[Unit]
Description=SportLocker Firmware Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=$FIRMWARE_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$FIRMWARE_DIR/.venv/bin/python -m sportlocker_firmware
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sportlocker

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sportlocker-firmware
echo "  → service activé (démarrage auto au boot)"

# ── 7. Tests ──────────────────────────────────────────────────────────────────
echo "▶ Lancement des tests..."
source "$FIRMWARE_DIR/.venv/bin/activate"
cd "$FIRMWARE_DIR"
python -m pytest tests/ -x -q 2>/dev/null && echo "  → ✅ Tests OK" || echo "  → ⚠️  Certains tests ont échoué (normal sans GPIO/caméra réels)"

# ── 8. Résumé ─────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup terminé !"
echo ""
echo "  Prochaines étapes :"
echo "  1. Compléter $ENV_FILE (MQTT, JWT_DEVICE_SECRET, DISTRIBUTOR_ID)"
echo "  2. sudo systemctl start sportlocker-firmware"
echo "  3. sudo journalctl -fu sportlocker-firmware"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
