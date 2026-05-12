# Architecture SportLocker

## Vue 10 000 m

```
┌────────────┐      ┌─────────────┐      ┌──────────────┐
│  App mobile│◀───▶│   API REST  │◀───▶│  PostgreSQL  │
│  (Expo)    │      │  (Fastify)  │      │   + PostGIS  │
└────┬───────┘      └──────┬──────┘      └──────────────┘
     │                     │ BullMQ ↕ Redis
     │ JWT QR              ▼
     │              ┌──────────────┐
     │              │   Workers    │ (expire / overdue / heartbeat)
     │              └──────┬───────┘
     │ MQTT                │
     ▼                     ▼
┌────────────┐      ┌──────────────┐
│ Distributeur│◀───▶│  EMQX Cloud  │
│ (RPi CM4)  │      │   (broker)   │
└────────────┘      └──────────────┘
```

## Flux nominal — emprunt

1. **Citoyen** ouvre l'app, autorise la géoloc.
2. App appelle `GET /v1/distributors/nearby` → marqueurs sur carte.
3. Sélection d'un distributeur → `GET /v1/distributors/:id` → liste casiers libres.
4. Choix d'un item → `POST /v1/reservations` :
   - Transaction PG : trouve un locker `idle` avec l'item demandé, passe à `reserved`.
   - Crée une `reservation` (status=`pending`, expires_at = now + 15 min, qr_jti).
   - API signe un JWT HS256 avec `JWT_DEVICE_SECRET` (claim `jti` = nonce anti-replay).
5. App affiche le QR (le JWT *est* le QR — texte encodé).
6. Citoyen scanne devant le distributeur :
   - Firmware lit le QR via OpenCV + pyzbar.
   - Vérifie la signature HS256 offline (clé partagée). Aucune connexion Internet requise.
   - Vérifie que `jti` n'a jamais été vu (cache local).
   - Active le GPIO du locker, publie `event` MQTT `{type: "opened"}`.
7. API reçoit l'event via worker MQTT (TODO) → transition `reservation.status = active`.
8. Au retour, citoyen scanne un autre QR de retour → cycle inverse.

## États

### Locker
```
idle → reserved → active → returning → idle
                              ↓
                             fault (intervention)
```

### Reservation
```
pending → active → returned
   ↓         ↓
expired   overdue (>24h)
   ↓
cancelled (action user)
```

## Crons (BullMQ)

| Job                  | Fréquence | Effet                                                        |
|----------------------|-----------|--------------------------------------------------------------|
| expire-reservations  | 2 min     | `pending` + `expires_at < now` → `expired` + locker → `idle` |
| detect-overdue       | 1 min     | `active` + `opened_at < now-24h` → `overdue` + push notif    |
| heartbeat-watchdog   | 3 min     | distributeur sans heartbeat depuis 5 min → `offline`         |

## Sécurité

- **JWT session (user)** : HS256, signé par l'API, validité 7j, dans le header `Authorization`.
- **JWT device (QR)** : HS256, secret partagé API ↔ firmware, validité 15 min, `jti` anti-replay.
- **Vérification offline** : le firmware ne contacte jamais l'API pour autoriser une ouverture.
  Cela permet de servir des terrains avec couverture 4G capricieuse.
- **RGPD** : tout user qui demande la suppression voit son `gdpr_delete_requested_at` posé ;
  un cron quotidien anonymise (email/displayName→`null`, firebase_uid→`deleted-{uuid}`) 30j après.

## Décisions clés

- **Pourquoi PostGIS et pas une lib JS** : queries de proximité < 50 ms même à 50 000 distributeurs ;
  index GIST natifs ; déjà utilisé par les communes pour leurs SIG.
- **Pourquoi BullMQ et pas pg_cron** : visibilité Bull Board, retry exponentiel, observabilité Redis,
  pas de dépendance à une extension PG en prod managé (RDS).
- **Pourquoi Drizzle et pas Prisma** : performances (pas de query engine Rust),
  SQL transparent, types inférés du schéma, migrations versionnées sans schema.prisma propriétaire.
- **Pourquoi Expo SDK 51 et pas bare RN** : OTA gratuit via EAS Update, expo-router type-safe,
  prebuild si besoin de modules natifs custom (BLE).
