# SportLocker — Firmware agent

Agent Python embarqué qui tourne sur chaque distributeur (Raspberry Pi CM4).
Lit les QR au scanner caméra, vérifie le JWT offline, pulse le GPIO de la
serrure, publie les événements sur MQTT (EMQX Cloud).

## Architecture

```
src/sportlocker_firmware/
  agent.py          orchestration asyncio (MQTT + QR + heartbeat + controller)
  __main__.py       entry point — `python -m sportlocker_firmware`
  config.py         load_config() depuis variables d'environnement
  mqtt_client.py    wrapper paho-mqtt async + reconnect exponentiel borné
  qr_reader.py      capture caméra (cv2 + pyzbar), debounce, forward au controller
  locker_ctrl.py    orchestre JWT verify + anti-replay + GPIO + MQTT signé
  jwt_verify.py     HS256 offline + claims requis + check distributeur cible
  nonce_store.py    SQLite anti-replay (rétention 24 h, purge périodique)
  state_machine.py  miroir Python de l'enum SQL locker_state
  heartbeat.py      télémétrie périodique (CPU temp, mem, uptime) → MQTT
```

## Sécurité critique — ne PAS modifier sans review

- `jwt_verify.py` : la signature HS256 et le check `distributorId` sont
  les seuls remparts entre un QR forgé et l'ouverture d'une serrure
  publique. Toute modification doit être couverte par les tests.
- `nonce_store.py` : la contrainte UNIQUE sur `jti` est l'anti-replay
  atomique. Garder le check + insert dans la même transaction.
- `locker_ctrl.py` : GPIO fail-secure (HIGH au repos, pulse LOW à
  l'ouverture, retour HIGH). Tout event publié est signé HMAC-SHA256.

## Variables d'environnement

| Variable             | Requis | Description                                |
|----------------------|--------|--------------------------------------------|
| `DEVICE_ID`          | oui    | UUID du distributeur (matché côté API)     |
| `DEVICE_API_KEY`     | oui    | clé d'authent device → API REST            |
| `JWT_DEVICE_SECRET`  | oui    | secret HS256 partagé avec app + API        |
| `MQTT_URL`           | non    | par défaut `mqtt://localhost:1883`         |
| `MQTT_USERNAME`      | non    |                                            |
| `MQTT_PASSWORD`      | non    |                                            |
| `LOCKER_COUNT`       | non    | par défaut 8                               |
| `CALIBRATION_PATH`   | non    | `/etc/sportlocker/calibration.json`        |
| `FIRMWARE_DB_PATH`   | non    | `/var/lib/sportlocker/agent.db`            |

`calibration.json` mappe `lockerId → pin BCM` :

```json
{
  "locker-uuid-1": 17,
  "locker-uuid-2": 27,
  "locker-uuid-3": 22
}
```

## Développement local

```bash
# Setup
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Tests + coverage (cible ≥ 80%)
pytest --cov=src/sportlocker_firmware --cov-report=term-missing --cov-fail-under=80

# Lint + types
ruff check src tests
mypy src

# Lancer l'agent (GPIO en mode mock si pas sur un Pi)
DEVICE_ID=dev-local DEVICE_API_KEY=k JWT_DEVICE_SECRET=s \
  python -m sportlocker_firmware
```

## Déploiement Balena

```bash
# Initial — depuis services/firmware/ avec le CLI Balena installé :
balena login
balena push sportlocker-fleet

# Push OTA pour update à toute la flotte :
balena push sportlocker-fleet --debug

# Voir les logs en direct sur un device :
balena logs <device-uuid> --tail
```

L'image Docker multi-stage cible `balenalib/raspberrypi4-64-python:3.11-bookworm-run` —
les libs natives (`libzbar0`, `libgl1`) sont installées au runtime, et le
volume `/var/lib/sportlocker` persiste le SQLite entre redémarrages.

## Topics MQTT

| Topic                                  | Sens  | QoS | Description                          |
|----------------------------------------|-------|-----|--------------------------------------|
| `sportlocker/{deviceId}/heartbeat`     | pub   | 0   | toutes les 60s (uptime, CPU, mem)    |
| `sportlocker/{deviceId}/event`         | pub   | 1   | unlock, return, fault — signé HMAC   |
| `sportlocker/{deviceId}/cmd`           | sub   | 1   | reservation_push, force_unlock, ...  |

Format d'un event signé :

```json
{
  "data": {
    "type": "door_unlocked",
    "deviceId": "...",
    "lockerId": "...",
    "reservationId": "...",
    "jti": "...",
    "openedAt": 1715692800,
    "mode": "online"
  },
  "sig": "<hex hmac-sha256 du JSON canonique de data>"
}
```
