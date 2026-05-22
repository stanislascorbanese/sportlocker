"""Outils CLI auxiliaires du firmware — pas inclus dans le runtime agent.

Contenu :
- ``demo_unlock`` : mint un JWT device + publie sur ``cmd/open`` pour
  simuler un scan QR sans Pi physique. Utile en démo + dev local.

Ces modules ne sont jamais chargés par ``agent.run`` — ils n'ont aucun
impact sur l'image prod Balena/ARM.
"""
