#!/usr/bin/env python3
"""
Autocollant de borne SportLocker — un fichier PDF par borne, prêt à imprimer.

C'est le seul mode d'emploi que le vacancier lira jamais : il est debout devant
la machine, au soleil, et il ne lit pas plus de trois lignes. Le QR code occupe
donc la moitié de la surface, et le reste tient en trois étapes numérotées.

Format A6 (105 × 148 mm), à imprimer sur adhésif polymère et à coller sur la
porte du compartiment technique, à hauteur d'yeux.

    python3 make_sticker.py --serial SL-001
    python3 make_sticker.py --serial SL-002 --site "Camping des Dunes" --sortie /tmp

Dépendances : reportlab, qrcode[pil]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import qrcode
from qrcode.image.pil import PilImage
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

# Palette de la marque — identique à packages/config/tailwind/tokens.css
VERT = HexColor("#157A5B")
VERT_CLAIR = HexColor("#E2F2EC")
ENCRE = HexColor("#0F1A16")
GRIS = HexColor("#5B6B64")

LARGEUR, HAUTEUR = 105 * mm, 148 * mm
BASE_URL = "https://app.sportlocker.fr/b"


def qr_image(url: str) -> ImageReader:
    """QR à correction d'erreur haute : l'autocollant va prendre le soleil, la
    pluie et les doigts gras. Un QR abîmé qui reste lisible évite un
    déplacement."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=20,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img: PilImage = qr.make_image(fill_color="#0F1A16", back_color="white")
    return ImageReader(img.get_image())


def draw(c: canvas.Canvas, serial: str, site: str | None, gratuit: bool) -> None:
    url = f"{BASE_URL}/{serial}"

    # Positions posées en absolu depuis le bas de la page : c'est le seul moyen
    # sûr que rien ne déborde d'un A6, où il n'y a aucune marge d'erreur.
    # ── Bandeau de marque ────────────────────────────────────────────────
    c.setFillColor(VERT)
    c.rect(0, HAUTEUR - 17 * mm, LARGEUR, 17 * mm, stroke=0, fill=1)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(9 * mm, HAUTEUR - 11 * mm, "SportLocker")
    c.setFont("Helvetica", 8)
    c.drawRightString(LARGEUR - 9 * mm, HAUTEUR - 11 * mm, serial)

    # ── Accroche ─────────────────────────────────────────────────────────
    c.setFillColor(ENCRE)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(LARGEUR / 2, 124 * mm, "Ballons et raquettes")

    c.setFont("Helvetica", 11)
    c.setFillColor(GRIS)
    # « Gratuitement » n'est vrai que si le camping ne facture pas : c'est lui
    # qui décide, donc c'est une option et non le texte par défaut.
    c.drawCentredString(
        LARGEUR / 2, 117 * mm, "à emprunter gratuitement" if gratuit else "à emprunter sur place"
    )

    # ── QR ───────────────────────────────────────────────────────────────
    taille = 47 * mm
    x = (LARGEUR - taille) / 2
    y = 62 * mm

    c.setFillColor(VERT_CLAIR)
    c.roundRect(x - 4 * mm, y - 4 * mm, taille + 8 * mm, taille + 8 * mm, 3 * mm, stroke=0, fill=1)
    c.drawImage(qr_image(url), x, y, taille, taille)

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(VERT)
    c.drawCentredString(LARGEUR / 2, 52 * mm, "Scannez avec votre téléphone")

    # ── Les trois étapes ─────────────────────────────────────────────────
    etapes = [
        "Scannez ce code",
        "Votre n° d'emplacement et votre nom",
        "Le casier s'ouvre",
    ]
    for i, texte in enumerate(etapes):
        cy = 42 * mm - i * 7.5 * mm
        c.setFillColor(VERT)
        c.circle(12 * mm, cy + 1.1 * mm, 2.6 * mm, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(12 * mm, cy - 0.6 * mm, str(i + 1))
        c.setFillColor(ENCRE)
        c.setFont("Helvetica", 9.5)
        c.drawString(17.5 * mm, cy - 0.8 * mm, texte)

    # ── Pied ─────────────────────────────────────────────────────────────
    c.setStrokeColor(Color(0, 0, 0, alpha=0.12))
    c.setLineWidth(0.6)
    c.line(9 * mm, 15 * mm, LARGEUR - 9 * mm, 15 * mm)

    c.setFillColor(GRIS)
    c.setFont("Helvetica", 8)
    c.drawCentredString(
        LARGEUR / 2, 10 * mm, "Un article à la fois. Rapportez-le quand vous avez fini."
    )
    c.setFont("Helvetica-Oblique", 7.5)
    c.drawCentredString(
        LARGEUR / 2,
        5.5 * mm,
        f"Un problème ? L'accueil de {site}." if site else "Un problème ? Passez à l'accueil.",
    )


def main() -> None:
    p = argparse.ArgumentParser(description="Génère l'autocollant A6 d'une borne.")
    p.add_argument("--serial", required=True, help="Numéro de série de la borne, ex. SL-001")
    p.add_argument("--site", default=None, help="Nom du camping, affiché en pied")
    p.add_argument("--sortie", default=".", help="Répertoire de sortie")
    p.add_argument(
        "--gratuit",
        action="store_true",
        help="Le camping ne facture pas le prêt : l'affiche en clair sur l'autocollant",
    )
    args = p.parse_args()

    chemin = Path(args.sortie) / f"autocollant-{args.serial}.pdf"
    chemin.parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(chemin), pagesize=(LARGEUR, HAUTEUR))
    c.setTitle(f"SportLocker — autocollant {args.serial}")
    draw(c, args.serial, args.site, args.gratuit)
    c.showPage()
    c.save()
    print(chemin)


if __name__ == "__main__":
    main()
