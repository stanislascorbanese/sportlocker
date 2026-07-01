# Plan de test bench — CM4 physique

Procédure de validation **du banc vers l'armoire**, à dérouler quand le
Raspberry Pi CM4 + relais + solénoïdes arrivent. Objectif : prouver la chaîne
`boot eMMC → QR scan → JWT verify → GPIO → relais → solénoïde` **une étape à la
fois**, sans jamais câbler le 12V avant d'avoir validé la logique à sec.

> ⚠️ **Règle d'or** : on n'ajoute **jamais** deux inconnues à la fois. Chaque
> étape ci-dessous se valide isolément avant de brancher l'étage suivant.

Matériel de référence : CM4 2GB WiFi 16GB + IO Board officielle · caméra v3
(IMX708) · relais 8 canaux 5V · solénoïdes 12V ATOPLEE ×4 · armoire 9
compartiments.

---

## 0. Sécurité électrique (à lire avant tout branchement 12V)

- **Alimentation séparée** : les solénoïdes 12V ont leur **propre alim 12V**.
  Ne **jamais** tirer le 12V depuis le 5V/3V3 du Pi. Masse (GND) **commune**
  entre l'alim 12V, le relais et le Pi, sinon le relais ne commute pas.
- **Diode de roue libre (flyback)** : un solénoïde est une bobine. À la coupure
  il génère une surtension inductive. Beaucoup de cartes relais l'intègrent
  côté contact sec, mais **vérifier** ; sinon ajouter une diode (ex. 1N4007)
  en antiparallèle sur chaque solénoïde. Sans ça → relais/transistors grillés.
- **Fail-secure** : au repos le solénoïde est **hors tension = casier
  verrouillé**. L'ouverture = impulsion de ~0.5 s sous tension. Ne jamais
  laisser un solénoïde alimenté en continu (échauffement + fail-open).
- **Polarité du relais — POINT CRITIQUE** : le firmware est fail-secure avec
  GPIO `HIGH` au repos et **pulse `LOW`** pour ouvrir
  (`locker_ctrl._run_pulse_with_timeout`). Ça suppose une carte relais
  **active-LOW** (relais fermé quand l'entrée est LOW).
  - Active-LOW + HIGH-au-repos → relais OFF → solénoïde hors tension →
    **verrouillé** ✅ (cohérent).
  - Si la carte est **active-HIGH**, la polarité s'inverse : au repos les
    solénoïdes seraient **alimentés en permanence** (fail-open + surchauffe).
    → Vérifier la carte au multimètre **avant** de brancher le 12V. Si
    active-HIGH, il faut inverser la logique (câblage sur le contact NC, ou
    adapter le driver — à décider avec review, pas en douce).

---

## 1. Boot eMMC

1. Flasher **Raspberry Pi OS Lite 64-bit (Bookworm)** sur l'eMMC du CM4
   (`rpiboot` + Raspberry Pi Imager ; IO Board en mode `nRPIBOOT`).
2. Pré-configurer dans l'Imager : hostname, user `pi`, SSH activé, WiFi.
3. Premier boot → SSH.
4. Vérifier le socle :
   ```bash
   cat /etc/os-release            # Bookworm, arm64
   python3 --version              # doit exposer 3.11 (installé par setup_pi.sh sinon)
   vcgencmd measure_temp          # sanity check SoC
   ```

**Critère de succès** : SSH OK, eMMC monté en `/`, réseau up.

---

## 2. Installation firmware (à sec, sans relais ni 12V)

1. Copier le repo sur le Pi (git clone ou `rsync services/firmware/`).
2. Lancer l'installeur :
   ```bash
   sudo bash setup_pi.sh
   ```
3. Compléter les secrets **réels** :
   ```bash
   sudo nano /etc/sportlocker/.env         # DEVICE_ID, DEVICE_API_KEY,
                                           # JWT_DEVICE_SECRET, MQTT_URL (mqtts://…)
   sudo nano /etc/sportlocker/calibration.json   # UUID casiers → pins BCM
   ```
   > `calibration.json` doit contenir les **vrais UUID de casiers** issus de la
   > base : sans mapping, tout unlock renvoie `UNKNOWN_LOCKER`. Les pins BCM
   > doivent correspondre au câblage relais choisi à l'étape 4.
4. Vérifier l'install : `python -m pytest tests/ -q` (mode mock, GPIO simulé).

**Critère de succès** : tests verts, `.env` + `calibration.json` complétés.

---

## 3. Logique seule sur le Pi (GPIO réel, aucun étage de puissance)

Avant tout relais, valider que le firmware pilote bien les GPIO. Sur le Pi,
`RPi.GPIO` est présent → le pulse est **réel** (plus « simulated »).

1. Sur une broche de test (ex. BCM17), brancher une **LED + résistance
   220–330 Ω** vers GND (ou juste un multimètre en mode tension).
2. Jouer un scan local, sans broker :
   ```bash
   source .venv/bin/activate
   python -m sportlocker_firmware.tools.local_scan \
     --secret "$JWT_DEVICE_SECRET" \
     --device "$DEVICE_ID" --locker <UUID-casier-1> --pin 17
   ```
3. Observer : au repos la broche est **HIGH** ; pendant ~0.5 s elle passe
   **LOW** (LED s'éteint / tension chute) puis revient **HIGH**. Le log
   `gpio_pulse_ok simulated=False` confirme le pulse matériel.
4. Rejouer les cas d'erreur (aucun n'active la broche) :
   ```bash
   python -m sportlocker_firmware.tools.local_scan ... --replay          # replay bloqué
   python -m sportlocker_firmware.tools.local_scan ... --slot-start-in 3600  # hors créneau
   python -m sportlocker_firmware.tools.local_scan ... --offline --no-cache # refus offline
   ```

**Critère de succès** : pulse LOW visible uniquement sur le cas nominal, retour
HIGH systématique (fail-secure).

---

## 4. GPIO → relais (toujours sans 12V ni solénoïde)

1. Câbler l'entrée du canal relais correspondant au pin de test (ex. BCM17 →
   `IN1`), + 5V et GND du relais depuis l'IO Board.
2. Relancer le `local_scan` nominal de l'étape 3.
3. Vérifier :
   - le relais **clique** (LED du canal s'allume) uniquement pendant le pulse ;
   - au repos, mesurer au multimètre le contact : **NO ouvert / NC fermé** →
     confirme que le solénoïde (branché plus tard sur NO) sera **hors tension
     au repos**.
4. Répéter pour chaque pin/canal du `calibration.json`.

**Critère de succès** : bon canal commuté, bonne durée (~0.5 s), état repos =
verrouillé. Si un canal reste collé au repos → **stop**, revoir polarité
(étape 0).

---

## 5. Relais → solénoïde (un seul canal, 12V pour la première fois)

1. **Un seul** solénoïde d'abord. Alim 12V dédiée OFF.
2. Câbler : `12V+ → COM du relais` · `NO → solénoïde+` · `solénoïde- → 12V-`.
   GND 12V relié au GND commun. Flyback en place (étape 0).
3. Alim 12V ON. **Au repos, le solénoïde doit rester froid et verrouillé.**
   Vérifier au multimètre : 0 V aux bornes du solénoïde au repos.
4. Jouer le `local_scan` nominal → le solénoïde doit **s'armer ~0.5 s**
   (déverrouille) puis relâcher.
5. Contrôler l'échauffement après quelques cycles : doit rester tiède. Chaud =
   solénoïde alimenté trop longtemps ou en continu → **stop**.

**Critère de succès** : déverrouillage franc sur le cas nominal, verrouillé au
repos, pas de surchauffe.

Puis répéter canal par canal pour les 3 autres solénoïdes.

---

## 6. Chaîne complète : caméra QR → ouverture

1. Brancher la caméra v3 (IMX708) sur le port CSI de l'IO Board ; vérifier
   qu'elle est détectée (`libcamera-hello`, `rpicam-hello` selon l'OS).
2. Compléter le `.env` MQTT vers EMQX Cloud (le firmware-sim tourne déjà sur
   Railway → observer le trafic est utile).
3. Générer un QR de test qui encode un JWT device valide (mint via
   `demo_unlock ... --print-only`, puis QR d'une string), pour le vrai casier.
4. Démarrer le service :
   ```bash
   sudo systemctl start sportlocker-firmware
   sudo journalctl -fu sportlocker-firmware
   ```
5. Présenter le QR à la caméra → suivre les logs : `unlock_success` → pulse →
   solénoïde ouvre → event `door_unlocked` signé publié sur MQTT.
6. Vérifier côté broker/backend que l'event signé est reçu et validé.

**Critère de succès** : scan physique → ouverture physique → event MQTT reçu,
bout en bout, sans intervention manuelle.

---

## Checklist de bascule vers l'armoire

- [ ] Étapes 1→6 vertes sur les 4 canaux.
- [ ] `calibration.json` = mapping réel casier→pin figé et sauvegardé.
- [ ] État repos = **tous casiers verrouillés** après coupure/redémarrage du Pi
      (test : `sudo reboot`, vérifier qu'aucun solénoïde ne s'arme au boot).
- [ ] Comportement sur coupure réseau : réservation cachée → ouverture OK ;
      pas de cache + offline → refus (`cache_miss_offline`).
- [ ] Service `sportlocker-firmware` en `enabled` (démarrage auto au boot).
- [ ] Alim 12V dimensionnée pour le pic d'appel de bobine (courant d'inrush).

> Une fois cette checklist cochée, monter l'électronique dans l'armoire 9
> compartiments et refaire un passage rapide des étapes 5→6 in situ (le câblage
> plus long peut introduire des chutes de tension sur le 12V).
