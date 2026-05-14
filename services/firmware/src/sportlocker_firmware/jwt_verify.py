"""Vérification JWT HS256 offline pour les QR d'ouverture casier.

Le JWT est signé côté app mobile avec ``JWT_DEVICE_SECRET`` (partagé avec
l'API et le firmware). Il porte les claims nécessaires à l'ouverture sans
aller-retour réseau :

    {
      "iss": "sportlocker.app",
      "aud": "sportlocker.device",
      "sub": "<userId>",
      "jti": "<nonce 16 bytes>",
      "exp": <timestamp + 900>,
      "nbf": <timestamp>,
      "iat": <timestamp>,
      "distributorId": "<uuid>",
      "lockerId":      "<uuid>",
      "reservationId": "<uuid>",
      "userId":        "<uuid>"
    }

Ce module ne s'occupe QUE de la signature, des claims temporels et de la
forme. L'anti-replay (jti déjà vu) est géré par ``nonce_store``.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from jose import ExpiredSignatureError, JWTError, jwt

JWT_ISSUER = "sportlocker.app"
JWT_AUDIENCE = "sportlocker.device"
JWT_ALGORITHM = "HS256"

REQUIRED_CLAIMS = ("jti", "reservationId", "lockerId", "distributorId")


class TokenErrorReason(StrEnum):
    EXPIRED = "expired"
    BAD_SIGNATURE = "bad_signature"
    MISSING_CLAIMS = "missing_claims"
    DEVICE_MISMATCH = "device_mismatch"
    MALFORMED = "malformed"


class InvalidTokenError(Exception):
    """Toute erreur de vérification JWT. ``reason`` permet de logger précisément."""

    def __init__(self, reason: TokenErrorReason, detail: str = "") -> None:
        super().__init__(f"{reason.value}: {detail}" if detail else reason.value)
        self.reason = reason
        self.detail = detail


@dataclass(frozen=True)
class DeviceClaims:
    """Claims utilisables après vérification — typés pour éviter les ``str | None``."""

    jti: str
    reservation_id: str
    locker_id: str
    distributor_id: str
    user_id: str | None
    exp: int | None
    iat: int | None


def verify(token: str, *, device_secret: str, expected_device_id: str) -> DeviceClaims:
    """Décode, vérifie et retourne les claims. Lève ``InvalidTokenError`` sinon.

    - Vérifie signature HS256, iss, aud, exp (déjà fait par python-jose).
    - Vérifie que tous les claims requis sont présents.
    - Vérifie que ``distributorId`` cible bien ce device — un QR pour un autre
      site n'a aucune raison d'ouvrir une serrure ici.
    """
    if not token:
        raise InvalidTokenError(TokenErrorReason.MALFORMED, "empty_token")

    try:
        claims = jwt.decode(
            token,
            device_secret,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
    except ExpiredSignatureError as err:
        raise InvalidTokenError(TokenErrorReason.EXPIRED, str(err)) from err
    except JWTError as err:
        raise InvalidTokenError(TokenErrorReason.BAD_SIGNATURE, str(err)) from err

    missing = [c for c in REQUIRED_CLAIMS if not claims.get(c)]
    if missing:
        raise InvalidTokenError(
            TokenErrorReason.MISSING_CLAIMS, ",".join(missing),
        )

    if claims["distributorId"] != expected_device_id:
        raise InvalidTokenError(
            TokenErrorReason.DEVICE_MISMATCH,
            f"token_for={claims['distributorId']} this={expected_device_id}",
        )

    return DeviceClaims(
        jti=claims["jti"],
        reservation_id=claims["reservationId"],
        locker_id=claims["lockerId"],
        distributor_id=claims["distributorId"],
        user_id=claims.get("userId") or claims.get("sub"),
        exp=int(claims["exp"]) if claims.get("exp") is not None else None,
        iat=int(claims["iat"]) if claims.get("iat") is not None else None,
    )
