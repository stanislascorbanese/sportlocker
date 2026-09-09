#!/usr/bin/env python3
"""
Fiche technique SportLocker — le PDF qu'on laisse après une visite et qu'on
tend sur un salon.

Les faits viennent de `apps/web/src/data/produit.json`, le même fichier que lit
le site. Le PDF et la page /la-borne ne peuvent donc pas se contredire : c'est
la dérive qui avait produit trois modèles économiques contradictoires en mai
2026, et un document commercial faux est pire qu'un document absent.

    python3 fiche-technique.py                       # → fiche-technique-sportlocker.pdf
    python3 fiche-technique.py --sortie ~/Documents

Dépendances : reportlab
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

VERT = colors.HexColor("#157A5B")
VERT_PALE = colors.HexColor("#E2F2EC")
ENCRE = colors.HexColor("#0F1A16")
GRIS = colors.HexColor("#5B6B64")
TRAIT = colors.HexColor("#DDE4E1")
AMBRE_PALE = colors.HexColor("#FDF3E0")
AMBRE = colors.HexColor("#925A08")

MARGE = 18 * mm
LARGEUR_UTILE = A4[0] - 2 * MARGE

S = {
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=20, leading=24,
                         textColor=ENCRE, spaceAfter=2 * mm),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16,
                         textColor=ENCRE, spaceBefore=7 * mm, spaceAfter=2.5 * mm),
    "kicker": ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=7.5, leading=10,
                             textColor=VERT, spaceAfter=1.5 * mm),
    "p": ParagraphStyle("p", fontName="Helvetica", fontSize=9.5, leading=14,
                        textColor=ENCRE, alignment=TA_LEFT, spaceAfter=2 * mm),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=11.5,
                            textColor=GRIS, spaceAfter=1.5 * mm),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9, leading=12.5,
                           textColor=ENCRE),
    "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=9, leading=12.5,
                            textColor=ENCRE),
    "note": ParagraphStyle("note", fontName="Helvetica", fontSize=7.8, leading=10.5,
                           textColor=GRIS),
    "prix": ParagraphStyle("prix", fontName="Helvetica-Bold", fontSize=13, leading=16,
                           textColor=VERT),
}


def puces(items: list[str]) -> Table:
    """Liste à puces en tableau : le seul moyen d'aligner proprement une puce
    et un texte qui passe à la ligne."""
    rows = [[Paragraph("•", S["cell"]), Paragraph(t, S["cell"])] for t in items]
    t = Table(rows, colWidths=[4 * mm, LARGEUR_UTILE - 4 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def encadre(texte: str, fond, bordure, style_texte) -> Table:
    t = Table([[Paragraph(texte, style_texte)]], colWidths=[LARGEUR_UTILE])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fond),
        ("BOX", (0, 0), (-1, -1), 0.7, bordure),
        ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ]))
    return t


def decoration(canvas, doc) -> None:
    """Bandeau de marque en tête et pied de page, sur chaque page."""
    canvas.saveState()
    canvas.setFillColor(VERT)
    canvas.rect(0, A4[1] - 14 * mm, A4[0], 14 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawString(MARGE, A4[1] - 9.5 * mm, "SportLocker")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(A4[0] - MARGE, A4[1] - 9.5 * mm, "Fiche technique")

    canvas.setStrokeColor(TRAIT)
    canvas.setLineWidth(0.6)
    canvas.line(MARGE, 13 * mm, A4[0] - MARGE, 13 * mm)
    canvas.setFillColor(GRIS)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(MARGE, 8.5 * mm, "sportlocker.fr · stanislas.corbanese@gmail.com")
    canvas.drawRightString(A4[0] - MARGE, 8.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def construire(produit: dict, sortie: Path) -> Path:
    chemin = sortie / "fiche-technique-sportlocker.pdf"
    doc = BaseDocTemplate(
        str(chemin), pagesize=A4,
        leftMargin=MARGE, rightMargin=MARGE, topMargin=22 * mm, bottomMargin=18 * mm,
        title="SportLocker — fiche technique", author="SportLocker",
        subject="Borne de prêt de matériel sportif pour campings",
    )
    doc.addPageTemplates([
        PageTemplate(
            id="std",
            frames=[Frame(MARGE, 18 * mm, LARGEUR_UTILE, A4[1] - 40 * mm, id="f")],
            onPage=decoration,
        )
    ])

    f = []

    # ── Page 1 ───────────────────────────────────────────────────────────
    f.append(Paragraph("BORNE DE PRÊT DE MATÉRIEL SPORTIF", S["kicker"]))
    f.append(Paragraph("Le matériel de sport de votre camping,<br/>en libre-service", S["h1"]))
    f.append(Spacer(1, 2 * mm))
    f.append(Paragraph(
        "Vos clients empruntent un ballon ou une raquette avec leur numéro de séjour, "
        "à toute heure, sans passer par l’accueil. Vous savez ce qui sort et ce qui ne "
        "revient pas. Aucun compte à créer, aucune carte bancaire, rien à changer dans "
        "votre logiciel.", S["p"]))

    f.append(Paragraph("Spécifications", S["h2"]))
    rows = []
    for spec in produit["specs"]:
        valeur = spec["valeur"]
        if spec.get("note"):
            valeur += f'<br/><font size="7.8" color="#5B6B64">{spec["note"]}</font>'
        rows.append([Paragraph(spec["poste"], S["cellb"]), Paragraph(valeur, S["cell"])])
    t = Table(rows, colWidths=[52 * mm, LARGEUR_UTILE - 52 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, TRAIT),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    f.append(t)

    f.append(Spacer(1, 5 * mm))
    f.append(encadre(
        "<b>Où en est le produit.</b> Le prototype est en cours d’assemblage pour des essais "
        "en octobre 2026, en vue d’installations au printemps 2027. Les cotes ci-dessus seront "
        "figées à l’issue de ces essais. Nous préférons vous l’écrire ici plutôt que vous le "
        "faire découvrir le jour de la pose.",
        AMBRE_PALE, colors.HexColor("#F0D9A8"),
        ParagraphStyle("amb", parent=S["small"], textColor=AMBRE, fontSize=8.5, leading=12)))

    f.append(Paragraph("Ce qu’il y a dedans", S["h2"]))
    f.append(puces([f'<b>{d["titre"]}</b> — {d["detail"]}' for d in produit["dotation"]]))
    f.append(Spacer(1, 1.5 * mm))
    f.append(Paragraph(produit["horsCatalogue"], S["small"]))

    f.append(PageBreak())

    # ── Page 2 ───────────────────────────────────────────────────────────
    n = produit["emplacementsParBorne"]
    f.append(Paragraph("COMBIEN DE BORNES", S["kicker"]))
    f.append(Paragraph(
        f"Environ une borne pour {n} emplacements. Le nombre exact se décide sur place : ce qui "
        "compte n’est pas la taille du camping mais la distance entre la borne et vos terrains. "
        "Au-delà de deux ou trois minutes de marche, les gens n’y vont plus.", S["p"]))

    f.append(Paragraph("Trois façons de s’équiper", S["h2"]))
    f.append(Spacer(1, 1 * mm))

    cols = []
    for offre in produit["offres"]:
        bloc = [Paragraph(offre["label"], S["cellb"]), Spacer(1, 1 * mm),
                Paragraph(offre["prix"], S["prix"]),
                Paragraph(offre["prixDetail"], S["note"])]
        if offre.get("recurrent"):
            bloc += [Spacer(1, 1.5 * mm),
                     Paragraph(offre["recurrent"], S["cellb"]),
                     Paragraph(offre["recurrentDetail"], S["note"])]
        bloc += [Spacer(1, 2 * mm), Paragraph(offre["pourQui"], S["note"])]
        cols.append(bloc)

    largeur_col = (LARGEUR_UTILE - 8 * mm) / 3
    t = Table([cols], colWidths=[largeur_col] * 3)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, 0), VERT_PALE),
        ("BOX", (0, 0), (0, 0), 0.7, VERT),
        ("BOX", (1, 0), (1, 0), 0.5, TRAIT),
        ("BOX", (2, 0), (2, 0), 0.5, TRAIT),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ]))
    f.append(t)
    f.append(Spacer(1, 2 * mm))
    f.append(Paragraph(
        "Prix hors taxes. Une saison va d’avril à septembre. Matériel sportif, maintenance et "
        "remplacement des pièces d’usure compris dans les trois formules.", S["small"]))

    f.append(Paragraph("Nos engagements", S["h2"]))
    f.append(puces([f'<b>{e["titre"]}</b> — {e["detail"]}' for e in produit["engagements"]]))

    f.append(Paragraph("Ce qui reste à votre charge", S["h2"]))
    f.append(puces(produit["aVotreCharge"]))

    pms = produit["pms"]
    f.append(Spacer(1, 6 * mm))
    f.append(KeepTogether(encadre(
        f'<b>{pms["titre"]}.</b> {pms["corps"]} {pms["cite"]}',
        VERT_PALE, VERT, ParagraphStyle("v", parent=S["small"], textColor=ENCRE,
                                        fontSize=8.5, leading=12))))

    f.append(Spacer(1, 6 * mm))
    f.append(Paragraph(
        f'Document établi le {date.today().strftime("%d/%m/%Y")}. '
        "Les spécifications provisoires sont signalées comme telles. "
        "Pour un devis : sportlocker.fr/contact — réponse sous 48 h ouvrées.", S["small"]))

    doc.build(f)
    return chemin


def main() -> None:
    p = argparse.ArgumentParser(description="Génère la fiche technique PDF.")
    p.add_argument("--produit", default="apps/web/src/data/produit.json",
                   help="Chemin du JSON produit (source partagée avec le site)")
    p.add_argument("--sortie", default=".", help="Répertoire de sortie")
    args = p.parse_args()

    produit = json.loads(Path(args.produit).read_text(encoding="utf-8"))
    sortie = Path(args.sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    print(construire(produit, sortie))


if __name__ == "__main__":
    main()
