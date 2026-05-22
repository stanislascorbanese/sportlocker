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

## Démo / dev sans Raspberry Pi physique

Quand on ne dispose pas d'un Pi (démos commerciales, dev local, CI E2E), la
stack `docker-compose.dev.yml` lance Mosquitto + un container `firmware-sim`
qui exécute exactement le même agent Python mais sans GPIO ni caméra
(fail-soft transparent).

```bash
# 1. Boot la stack (postgres + redis + mosquitto + firmware-sim)
docker compose -f infra/docker/docker-compose.dev.yml up -d

# 2. Optionnel : observer tout le trafic MQTT en parallèle
docker run --rm --network host eclipse-mosquitto:2 \
  mosquitto_sub -h localhost -p 1883 -v -t 'sportlocker/#'

# 3. Simuler un scan QR — mint un JWT device et publie sur cmd/open.
#    Le firmware-sim reçoit, vérifie la signature, "ouvre" le casier
#    (pulse GPIO simulé), et publie l'event signé en retour.
python -m sportlocker_firmware.tools.demo_unlock \
  --broker mqtt://localhost:1883 \
  --secret dev-jwt-device-secret-change-me \
  --device 00000000-0000-0000-0000-000000000000 \
  --locker 11111111-1111-1111-1111-111111111111
```

Les UUIDs `00000000-…` (device) et `11111111-…` à `44444444-…` (lockers) sont
ceux pré-câblés dans `infra/docker/firmware-sim/calibration.json` — adapte-les
pour matcher les vrais UUIDs de ta base si tu joues le scénario E2E avec
l'API en sus.

Pour obtenir juste le JWT (sans publier sur le broker, ex. pour le coller
dans Postman ou debug API) :

```bash
python -m sportlocker_firmware.tools.demo_unlock \
  --secret dev-jwt-device-secret-change-me \
  --device 00000000-0000-0000-0000-000000000000 \
  --locker 11111111-1111-1111-1111-111111111111 \
  --print-only
```

⚠️ **N'utilise jamais cette CLI avec le vrai secret prod en argument bash** :
il finit dans l'historique shell. En prod, le JWT device est minté par
l'app citoyenne (et par l'API pour les forces-unlock opérateur), jamais par
ce tool.

### E2E complet API + DB (regression test)

`demo_unlock` (ci-dessus) teste juste le couple firmware ↔ broker. Pour
valider la chaîne **citoyen → API → MQTT → firmware → MQTT → API → DB**
en une commande :

```bash
# One-shot : docker up, seed, scan, extend, return, vérifie, cleanup.
./scripts/e2e-firmware-sim.sh

# Variante : garde les containers up à la fin pour debug interactif.
./scripts/e2e-firmware-sim.sh --keep-running
```

Le script orchestre :
1. Docker compose (postgres + mosquitto + firmware-sim x86)
2. Schema + migrations + truncate
3. `pnpm --filter @sportlocker/api db:seed-fw-sim` (distributeur fixe
   `00000000-…` + 4 casiers `11111111-…`, `22222222-…`, etc.)
4. API en arrière-plan avec `MQTT_SUBSCRIBER_ENABLED=true` et le même
   `JWT_DEVICE_SECRET` que le firmware-sim
5. `POST /v1/dev/simulate-scan` → vérifie résa → `active`
6. `PATCH /v1/reservations/:id/extend` → vérifie `due_at +1h`
7. `POST /v1/reservations/:id/return` → vérifie résa → `returned`
8. Audit `locker_events` = `[opened, extended, returned]`

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

| Topic                                  | Sens  | QoS | Retain | Description                                              |
|----------------------------------------|-------|-----|--------|----------------------------------------------------------|
| `sportlocker/{deviceId}/heartbeat`     | pub   | 0   | non    | toutes les 30s (uptime, CPU, mem)                        |
| `sportlocker/{deviceId}/status`        | pub   | 1   | oui    | `{"online": bool}` — LWT armé pour les coupures brutales |
| `sportlocker/{deviceId}/event`         | pub   | 1   | non    | unlock, return, fault — signé HMAC                       |
| `sportlocker/{deviceId}/cmd/+`         | sub   | 1   | non    | sous-topics : `open` (force-unlock), …                   |

### Commande `cmd/open`

Payload attendu : `{"token": "<jwt>"}`. Le firmware applique le même chemin
de sécurité que pour un QR scanné en local (HS256 + anti-replay + cohérence
locker + cache réservation). Permet au backend de déclencher une ouverture
distante (réservation poussée, force-unlock par opérateur).

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
