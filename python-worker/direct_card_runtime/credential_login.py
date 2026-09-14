"""Credential-based ChatGPT login that yields access tokens for direct-card flows.

Runs the sunny_core password + TOTP protocol login so a stored account line
(email | password | 2FA secret) can replace a pasted access token. sunny_core
is imported lazily to keep the vendored runtime loadable without it.
"""
from __future__ import annotations

from typing import Any


def login_access_token(payload: dict[str, Any]) -> dict[str, Any]:
    """Log in with email/password/TOTP and return a fresh ChatGPT access token."""
    email = str(payload.get("email") or "").strip()
    password = str(payload.get("password") or "").strip()
    totp_secret = str(payload.get("totp_secret") or "").strip()
    proxy_url = str(payload.get("proxy") or "").strip()
    if "@" not in email:
        raise ValueError("email is required")
    if not password:
        raise ValueError("password is required")

    from sunny_core.mailbox import MailAccount
    from sunny_core.protocol_auth import login_or_register_protocol

    challenge_strategy = str(payload.get("challenge_strategy") or "sentinel_protocol").strip().lower()
    if challenge_strategy not in {"native_headless", "sentinel_protocol"}:
        challenge_strategy = "sentinel_protocol"
    account = MailAccount(
        email=email,
        password="",
        client_id="",
        refresh_token="",
        raw="",
        chatgpt_password=password,
        totp_secret=totp_secret,
    )
    result = login_or_register_protocol(
        account,
        proxy_url,
        existing_account=True,
        challenge_strategy=challenge_strategy,
    )
    access_token = str(result.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("protocol login finished without an access token")
    return {
        "ok": True,
        "email": email,
        "access_token": access_token,
        "account_id": str(result.get("account_id") or ""),
    }
