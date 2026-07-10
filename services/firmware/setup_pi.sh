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
# ⚠️  Ne jamais committer ce fichier — il contient des secrets.
# Les noms correspondent EXACTEMENT à ceux lus par config.py / agent.py.

# ── Identité du distributeur (REQUIS — agent crashe au boot si vide) ──
DEVICE_ID=REPLACE_WITH_DEVICE_UUID            # UUID du distributeur, matché côté API
DEVICE_API_KEY=REPLACE_WITH_DEVICE_API_KEY    # clé d'authent device → API REST

# ── JWT offline (REQUIS — même secret HS256 que l'API et l'app citoyenne) ──
JWT_DEVICE_SECRET=change_me_min_32_chars

# ── MQTT (EMQX Cloud) ──
# TLS prod : mqtts://<host>.emqxsl.com:8883   |   dev clair : mqtt://host:1883
# ⚠️  Sans le préfixe mqtts:// la connexion reste EN CLAIR (le CA n'est pas utilisé).
MQTT_URL=mqtts://your-broker.emqxsl.com:8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
# Requis dès que MQTT_URL est en mqtts:// — sinon MQTTClient.connect() échoue volontairement.
MQTT_CA_CERT_PATH=/etc/sportlocker/emqxsl-ca.crt

# ── Casiers ──
LOCKER_COUNT=8
# Mapping lockerId → pin BCM dans un fichier séparé (généré ci-dessous, à compléter).
CALIBRATION_PATH=/etc/sportlocker/calibration.json

# ── Persistance locale (anti-replay + cache réservations + events en attente) ──
FIRMWARE_DB_PATH=/var/lib/sportlocker/agent.db

# ── Sentry (optionnel — laisser SENTRY_DSN vide pour désactiver) ──
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
EOF
  echo "  → .env créé — compléter DEVICE_ID, DEVICE_API_KEY, JWT_DEVICE_SECRET, MQTT_* avant de lancer"
else
  echo "  → .env déjà présent, ignoré"
fi

# ── 5. Certificat MQTT + calibration GPIO ─────────────────────────────────────
mkdir -p /etc/sportlocker

if [ -f "$FIRMWARE_DIR/emqxsl-ca.crt" ]; then
  cp "$FIRMWARE_DIR/emqxsl-ca.crt" /etc/sportlocker/emqxsl-ca.crt
  echo "▶ Certificat MQTT copié dans /etc/sportlocker/"
fi

# calibration.json : mapping lockerId (UUID côté API) → pin GPIO BCM.
# agent.py le lit via CALIBRATION_PATH. Sans mapping, TOUT unlock renvoie
# UNKNOWN_LOCKER et aucun casier ne s'ouvre → template obligatoire à compléter.
CALIB_FILE=/etc/sportlocker/calibration.json
if [ ! -f "$CALIB_FILE" ]; then
  echo "▶ Création du template calibration.json (à compléter avec les vrais UUID)..."
  cat > "$CALIB_FILE" << 'EOF'
{
  "REPLACE-WITH-LOCKER-UUID-1": 17,
  "REPLACE-WITH-LOCKER-UUID-2": 27,
  "REPLACE-WITH-LOCKER-UUID-3": 22,
  "REPLACE-WITH-LOCKER-UUID-4": 23,
  "REPLACE-WITH-LOCKER-UUID-5": 24,
  "REPLACE-WITH-LOCKER-UUID-6": 25,
  "REPLACE-WITH-LOCKER-UUID-7": 5,
  "REPLACE-WITH-LOCKER-UUID-8": 6
}
EOF
  echo "  → $CALIB_FILE créé — remplacer les clés par les UUID de casiers de la base,"
  echo "    et vérifier que les pins BCM correspondent au câblage du relais 8 canaux."
else
  echo "  → calibration.json déjà présent, ignoré"
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
echo "  1. Compléter $ENV_FILE (DEVICE_ID, DEVICE_API_KEY, JWT_DEVICE_SECRET, MQTT_*)"
echo "  2. Compléter /etc/sportlocker/calibration.json (UUID casiers → pins BCM)"
echo "  3. sudo systemctl start sportlocker-firmware"
echo "  4. sudo journalctl -fu sportlocker-firmware"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
