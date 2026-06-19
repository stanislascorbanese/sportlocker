# Agent Office 🤖

Visualisation 3D « à la Sims » de la flotte d'agents SportLocker (Three.js, iso 3D claymation).
Deux variantes :

- **Dev / live** (ce dossier) — `server.mjs` + `index.html` : un serveur Node sans dépendance
  qui *tail* le transcript JSONL de la session Claude Code en cours et pousse chaque action
  (tool_use) en **SSE** ; les avatars réagissent en temps réel.
- **Prod / ambiant** — `apps/dashboard/public/agent-office.html` : version auto-contenue
  (mode ambiant, pas d'accès aux transcripts) affichée en iframe sur
  `ops.sportlocker.fr/super-admin/agent-office` (réservée super-admin).

## Lancer la version live (local)

```bash
node tools/agent-office/server.mjs       # → http://localhost:4567
# transcript par défaut : ~/.claude/projects/-Users-…-sportlocker
# override : AGENT_OFFICE_TRANSCRIPT_DIR=/chemin node tools/agent-office/server.mjs
# port :     PORT=5000 node tools/agent-office/server.mjs
```

Aussi câblé dans `.claude/launch.json` (config `agent-office`) pour le preview Claude Code.

## Contenu visuel
Salle isométrique bois + fenêtres + lounge + rack serveur, 6 agents SportLocker en robots
animés (yeux/cœur lumineux, barre de chargement, séparation anti-collision), portique de
sécurité franchi par des workers transitoires, feed d'activité, modes jour/nuit et caméra
cinématique. Three.js via CDN (unpkg) — aucune dépendance npm, aucun build.
