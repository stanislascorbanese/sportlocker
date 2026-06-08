# CDN devant la vitrine — analyse & décision

> **Statut : reporté (phase 2 infra).** Analysé le 2026-06-08 lors d'un audit latence
> de `www.sportlocker.fr`. Pas d'action immédiate — à reconsidérer au durcissement prod,
> après la mise en prod firmware (priorité Mai 2026).

## TL;DR

La vitrine est **déjà bien optimisée** : brotli à l'edge, HTTP/2, assets `_astro`
hashés en cache immutable 1 an, edge Railway en Europe (`europe-west4`, NL), TTFB ~70 ms.
Mettre **Cloudflare devant la vitrine** apporterait surtout de la **résilience et de la
sécurité** (cache edge, DDoS/WAF, HTTP/3), pas un gain de latence majeur pour une
audience franco-française. **ROI immédiat faible → reporté.**

## État actuel mesuré (2026-06-08)

| Cible | TTFB | Compression | Cache assets | HTTP | Edge |
|---|---|---|---|---|---|
| **www** (vitrine Astro) | ~70 ms | brotli | `_astro` immutable 1 an | h2 | EU `europe-west4` |
| **api** `/health` | ~62 ms | — | — | h2 | EU |
| **app** (PWA citizen) | ~195 ms → cache | brotli | `s-maxage=1an` | h2 | EU |

Architecture : Railway sert la vitrine depuis **une seule région** (NL). Pas de second
PoP, pas de cache HTML en périphérie, pas de HTTP/3.

> Réglage cache affiné depuis (PR #268) : polices `woff2/woff` en immutable 1 an,
> images en `max-age=604800 + stale-while-revalidate`. Voir `apps/web/public/serve.json`.

## Ce que Cloudflare (plan Free) apporterait

| Dimension | Aujourd'hui | Avec Cloudflare |
|---|---|---|
| Points de présence | 1 (NL) | ~330 villes, dont Paris/Marseille |
| TLS / handshake | terminé en NL | terminé près de l'utilisateur |
| Cache HTML | non (chaque hit → Railway NL) | oui, HTML statique à l'edge (TTFB ~10-20 ms) |
| HTTP/3 (QUIC) | non | oui, automatique |
| DDoS / WAF | basique Railway | DDoS L3/4 inclus, WAF configurable |
| Analytics edge | non | trafic + cache hit ratio gratuits |
| Coût | 0 € | 0 € (Free suffit pour un site statique) |

## Le gain réel, sans enrobage

- **Audience franco-française** : modeste. NL→France ≈ 15 ms. Le TTFB des pages cachées
  passerait de ~70 ms à ~15-20 ms (**~50 ms** sur le 1er octet). Perceptible en 4G,
  invisible en fibre. Quelques points Lighthouse (FCP/LCP).
- **Le vrai bénéfice est la résilience, pas la vitesse** : cache edge = la vitrine reste
  en ligne même si Railway tombe ou redéploie ; DDoS/WAF gratuits ; HTTP/3 pour réseaux
  mobiles instables.
- **API** : Cloudflare devant l'API est plus délicat (dynamique, WebSocket, pas de cache
  HTML) → bénéfice surtout sécurité, pas latence. **Ne le faire que pour la vitrine** en
  premier.

## Coûts cachés / risques

1. **Délégation DNS** : passer la zone `sportlocker.fr` sur les nameservers Cloudflare.
   Étape la plus engageante — impacte **tous** les sous-domaines, **MX e-mail compris**
   (ne pas casser la délivrabilité). À faire avec un inventaire DNS complet sous les yeux.
2. **Une couche de cache de plus** = une source supplémentaire de « pourquoi je vois
   l'ancienne version » (il faut connaître la purge cache). Même famille de souci que le
   bug favicon Safari réglé en PR #266.
3. **Origin lock** : pour éviter de contourner le CDN, restreindre Railway aux IP
   Cloudflare (config réseau supplémentaire).

## Décision

**Reporté.** Aujourd'hui la vitrine est déjà rapide pour des Français ; le ROI latence
immédiat est faible. À reconsidérer le jour où **l'un** de ces déclencheurs est vrai :

- audience plus large / internationale / fortement mobile ;
- besoin de protection DDoS/WAF + résilience (vitrine qui survit à un incident Railway) ;
- mutualisation Cloudflare devant www **et** app (tunnels, règles communes).

**Ordre suggéré le jour J** : inventaire DNS complet (dont MX) → ajout zone Cloudflare en
mode DNS-only d'abord → bascule proxy (orange cloud) sur www uniquement → vérif cache +
purge → origin lock Railway. Ne pas toucher à l'API au premier passage.
