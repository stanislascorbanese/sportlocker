"""Tests de jwt_verify — décode HS256 + validation claims + cible distributeur."""
from __future__ import annotations

import time
from typing import Any

import pytest
from jose import jwt

from sportlocker_firmware.jwt_verify import (
    JWT_ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
    InvalidTokenError,
    TokenErrorReason,
    verify,
)


def _make_token(
    secret: str,
    *,
    distributor_id: str = "dist-abc-123",
    locker_id: str = "locker-uuid-1",
    reservation_id: str = "reservation-uuid-1",
    user_id: str = "user-uuid-1",
    jti: str = "nonce-deadbeef",
    exp_offset: int = 900,
    nbf_offset: int = 0,
    issuer: str = JWT_ISSUER,
    audience: str = JWT_AUDIENCE,
    extra: dict[str, Any] | None = None,
    omit: tuple[str, ...] = (),
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "iss": issuer,
        "aud": audience,
        "sub": user_id,
        "userId": user_id,
        "jti": jti,
        "iat": now,
        "nbf": now + nbf_offset,
        "exp": now + exp_offset,
        "distributorId": distributor_id,
        "lockerId": locker_id,
        "reservationId": reservation_id,
    }
    if extra:
        claims.update(extra)
    for k in omit:
        claims.pop(k, None)
    return jwt.encode(claims, secret, algorithm=JWT_ALGORITHM)


def test_verify_returns_claims_on_valid_token(device_secret: str, device_id: str) -> None:
    token = _make_token(device_secret, distributor_id=device_id)
    claims = verify(token, device_secret=device_secret, expected_device_id=device_id)
    assert claims.distributor_id == device_id
    assert claims.locker_id == "locker-uuid-1"
    assert claims.reservation_id == "reservation-uuid-1"
    assert claims.jti == "nonce-deadbeef"
    assert claims.user_id == "user-uuid-1"


def test_expired_token_raises_expired(device_secret: str, device_id: str) -> None:
    token = _make_token(device_secret, distributor_id=device_id, exp_offset=-10)
    with pytest.raises(InvalidTokenError) as exc:
        verify(token, device_secret=device_secret, expected_device_id=device_id)
    assert exc.value.reason is TokenErrorReason.EXPIRED


def test_bad_signature_raises_bad_signature(device_secret: str, device_id: str) -> None:
    token = _make_token("wrong-secret", distributor_id=device_id)
    with pytest.raises(InvalidTokenError) as exc:
        verify(token, device_secret=device_secret, expected_device_id=device_id)
    assert exc.value.reason is TokenErrorReason.BAD_SIGNATURE


def test_wrong_issuer_raises_bad_signature(device_secret: str, device_id: str) -> None:
    token = _make_token(device_secret, distributor_id=device_id, issuer="evil.app")
    with pytest.raises(InvalidTokenError) as exc:
        verify(token, device_secret=device_secret, expected_device_id=device_id)
    assert exc.value.reason is TokenErrorReason.BAD_SIGNATURE


def test_wrong_audience_raises_bad_signature(device_secret: str, device_id: str) -> None:
    token = _make_token(device_secret, distributor_id=device_id, audience="other.aud")
    with pytest.raises(InvalidTokenError) as exc:
        verify(token, device_secret=device_secret, expected_device_id=device_id)
    assert exc.value.reason is TokenErrorReason.BAD_SIGNATURE


def test_missing_claims_raises(device_secret: str, device_id: str) -> None:
    token = _make_token(device_secret, distributor_id=device_id, omit=("lockerId",))
    with pytest.raises(InvalidTokenError) as exc:
        verify(token, device_secret=device_secret, expected_device_id=device_id)
    assert exc.value.reason is TokenErrorReason.MISSING_CLAIMS
    assert "lockerId" in exc.value.detail


def test_device_mismatch_raises(device_secret: str, device_id: str) -> None:
    token = _make_token(device_secret, distributor_id="OTHER-DEVICE")
    with pytest.raises(InvalidTokenError) as exc:
        verify(token, device_secret=device_secret, expected_device_id=device_id)
    assert exc.value.reason is TokenErrorReason.DEVICE_MISMATCH


def test_empty_token_raises_malformed(device_secret: str, device_id: str) -> None:
    with pytest.raises(InvalidTokenError) as exc:
        verify("", device_secret=device_secret, expected_device_id=device_id)
    assert exc.value.reason is TokenErrorReason.MALFORMED


def test_garbage_token_raises_bad_signature(device_secret: str, device_id: str) -> None:
    with pytest.raises(InvalidTokenError) as exc:
        verify("not-a-jwt", device_secret=device_secret, expected_device_id=device_id)
    assert exc.value.reason is TokenErrorReason.BAD_SIGNATURE
