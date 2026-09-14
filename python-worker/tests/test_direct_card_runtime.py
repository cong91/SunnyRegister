from __future__ import annotations

import base64
import json
import sys
import types
from unittest.mock import patch

import pytest


def _token(account_id: str = "account_fixture") -> str:
    payload = {
        "https://api.openai.com/auth": {"chatgpt_account_id": account_id},
        "https://api.openai.com/profile": {"email": f"{account_id}@example.test"},
    }
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"header.{encoded}.signature"


def test_direct_card_runtime_reports_isolated_protocol_info():
    from direct_card_runtime import manager

    info = manager.info()

    assert info["service"] == "direct-card-protocol"
    assert info["fingerprint_sticky_per_account"] is True
    assert info["aligned_batch_limit"] == 50


def test_direct_card_batch_preserves_aligned_start_contract():
    from direct_card_runtime import manager

    payload = {
        "tasks": [
            {
                "client_id": f"client-{index}",
                "payload": {
                    "access_token": _token(f"account-{index}"),
                    "flow_mode": "link_only",
                    "promo_proxy_pool": ["http://127.0.0.1:8080"],
                },
            }
            for index in range(3)
        ],
        "start_delay_ms": 250,
    }

    with patch.object(manager.threading, "Thread") as thread:
        result = manager.start_batch(payload)

    assert result["ok"] is True
    assert len(result["items"]) == 3
    assert len({item["task_id"] for item in result["items"]}) == 3
    assert thread.call_count == 3
    assert all(call.kwargs["daemon"] is True for call in thread.call_args_list)

    with manager.protocol_server.TASKS_LOCK:
        for item in result["items"]:
            task = manager.protocol_server.TASKS.pop(item["task_id"])
            assert task["status"] == "queued"
            assert task["start_group"] == result["start_group"]


def test_direct_card_payload_uses_vietnam_market_and_shared_proxy_pool():
    from direct_card_runtime.standalone_flow import validate_payload

    result = validate_payload(
        {
            "access_token": _token(),
            "flow_mode": "link_pay",
            "market_country": "VN",
            "market_currency": "VND",
            "promo_proxy_pool": ["http://127.0.0.1:8080"],
            "payment_method_id": "pm_test123",
            "billing": {
                "name": "Test User",
                "line1": "1 Nguyen Hue",
                "city": "Ho Chi Minh City",
                "postal_code": "700000",
                "country": "VN",
            },
        }
    )

    assert result["market_country"] == "VN"
    assert result["market_currency"] == "VND"
    assert result["bind_pool"] == result["promo_pool"]
    assert result["billing"]["country"] == "VN"


def test_direct_card_payload_accepts_bind_pool_as_shared_proxy_pool():
    from direct_card_runtime.standalone_flow import validate_payload

    result = validate_payload(
        {
            "access_token": _token(),
            "flow_mode": "link_only",
            "market_country": "VN",
            "market_currency": "VND",
            "bind_proxy_pool": ["http://127.0.0.1:8080"],
        },
        require_payment_method=False,
    )

    assert result["bind_pool"] == result["promo_pool"]


def test_direct_card_payload_accepts_pool_card_without_payment_method():
    from direct_card_runtime.standalone_flow import validate_payload

    result = validate_payload(
        {
            "access_token": _token(),
            "flow_mode": "full",
            "market_country": "VN",
            "market_currency": "VND",
            "promo_proxy_pool": ["http://127.0.0.1:8080"],
            "bind_proxy_pool": ["http://127.0.0.1:8080"],
            "billing": {
                "name": "Test User",
                "line1": "1 Nguyen Hue",
                "city": "Ho Chi Minh City",
                "postal_code": "700000",
                "country": "VN",
            },
            "card": {"number": "4242424242424242", "exp_month": "12", "exp_year": "2027", "cvc": "123"},
        },
        require_payment_method=True,
    )

    assert result["payment_method_id"] == ""
    assert result["card"]["number"].endswith("4242")
    assert result["card"]["exp_year"] == "2027"


def test_direct_card_payload_requires_card_or_payment_method():
    from direct_card_runtime.standalone_flow import validate_payload

    payload = {
        "access_token": _token(),
        "flow_mode": "full",
        "market_country": "VN",
        "market_currency": "VND",
        "promo_proxy_pool": ["http://127.0.0.1:8080"],
        "billing": {
            "name": "Test User",
            "line1": "1 Nguyen Hue",
            "city": "Ho Chi Minh City",
            "postal_code": "700000",
            "country": "VN",
        },
    }

    with pytest.raises(ValueError, match="missing PaymentMethod or pool card"):
        validate_payload(payload, require_payment_method=True)


def test_direct_card_payload_rejects_market_currency_mismatch():
    from direct_card_runtime.standalone_flow import validate_payload

    payload = {
        "access_token": _token(),
        "flow_mode": "link_only",
        "market_country": "VN",
        "market_currency": "USD",
        "promo_proxy_pool": ["http://127.0.0.1:8080"],
    }

    try:
        validate_payload(payload, require_payment_method=False)
    except ValueError as exc:
        assert "currency" in str(exc).lower()
    else:
        raise AssertionError("mismatched market currency must be rejected")


def test_direct_card_payload_rejects_billing_country_mismatch():
    from direct_card_runtime.standalone_flow import validate_payload

    payload = {
        "access_token": _token(),
        "flow_mode": "link_pay",
        "market_country": "VN",
        "market_currency": "VND",
        "promo_proxy_pool": ["http://127.0.0.1:8080"],
        "payment_method_id": "pm_test123",
        "billing": {
            "name": "Test User",
            "line1": "1 Main Street",
            "city": "Wilmington",
            "state": "DE",
            "postal_code": "19801",
            "country": "US",
        },
    }

    try:
        validate_payload(payload)
    except ValueError as exc:
        assert "billing country" in str(exc).lower()
    else:
        raise AssertionError("mismatched billing country must be rejected")


def test_direct_card_preflight_cache_key_includes_market():
    from direct_card_runtime.standalone_flow import _preflight_key

    base = {
        "account_id": "account-1",
        "promo_pool": ["http://127.0.0.1:8080"],
        "market_country": "VN",
        "market_currency": "VND",
    }
    other = {**base, "market_country": "US", "market_currency": "USD"}

    assert _preflight_key(base) != _preflight_key(other)


def test_direct_card_address_request_uses_selected_market(monkeypatch):
    from direct_card_runtime import standalone_flow

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps(
                {
                    "data": {
                        "firstname": "Test",
                        "lastname": "User",
                        "address": {
                            "street": "1 Nguyen Hue",
                            "city": "Ho Chi Minh City",
                            "zipcode": "700000",
                            "country_code": "VN",
                            "area_code": "SG",
                        },
                    }
                }
            ).encode()

    requested: list[str] = []

    def fake_urlopen(request, timeout):
        requested.append(request.full_url)
        assert timeout == 15
        return Response()

    monkeypatch.setattr(standalone_flow, "urlopen", fake_urlopen)
    result = standalone_flow.fetch_billing_address(
        {"market_country": "VN", "market_currency": "VND"}
    )

    assert "country_code=vn" in requested[0]
    assert "area_code" not in requested[0]
    assert result["billing"]["country"] == "VN"


def test_direct_card_address_rejects_wrong_market_response(monkeypatch):
    from direct_card_runtime import standalone_flow

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps(
                {
                    "data": {
                        "firstname": "Test",
                        "lastname": "User",
                        "address": {
                            "street": "1 Main Street",
                            "city": "Wilmington",
                            "zipcode": "19801",
                            "country_code": "US",
                            "area_code": "DE",
                        },
                    }
                }
            ).encode()

    monkeypatch.setattr(standalone_flow, "urlopen", lambda *_args, **_kwargs: Response())
    try:
        standalone_flow.fetch_billing_address(
            {"market_country": "VN", "market_currency": "VND"}
        )
    except RuntimeError as exc:
        assert "returned US for market VN" in str(exc)
    else:
        raise AssertionError("wrong-market address response must be rejected")


def test_direct_card_credential_login_requires_email_and_password():
    from direct_card_runtime.credential_login import login_access_token

    with pytest.raises(ValueError):
        login_access_token({"email": "", "password": "pw"})
    with pytest.raises(ValueError):
        login_access_token({"email": "user@example.test", "password": ""})


def test_direct_card_credential_login_runs_protocol_flow(monkeypatch):
    from direct_card_runtime.credential_login import login_access_token

    captured: dict[str, object] = {}

    class FakeMailAccount:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    def fake_login(account, proxy_url, log=None, *, existing_account=False, challenge_strategy="native_headless", **_kwargs):
        captured["account"] = account
        captured["proxy_url"] = proxy_url
        captured["existing_account"] = existing_account
        captured["challenge_strategy"] = challenge_strategy
        return {"access_token": _token("account_fixture"), "account_id": "account_fixture"}

    mailbox_module = types.ModuleType("sunny_core.mailbox")
    mailbox_module.MailAccount = FakeMailAccount
    protocol_module = types.ModuleType("sunny_core.protocol_auth")
    protocol_module.login_or_register_protocol = fake_login
    monkeypatch.setitem(sys.modules, "sunny_core.mailbox", mailbox_module)
    monkeypatch.setitem(sys.modules, "sunny_core.protocol_auth", protocol_module)

    result = login_access_token(
        {
            "email": "user@example.test",
            "password": "pw",
            "totp_secret": "JBSW",
            "proxy": "14.224.199.205:41230:aqPdHe:JWWNEX",
        }
    )

    assert result["ok"] is True
    assert result["email"] == "user@example.test"
    assert result["account_id"] == "account_fixture"
    assert result["access_token"].startswith("header.")
    account = captured["account"]
    assert account.chatgpt_password == "pw"
    assert account.totp_secret == "JBSW"
    assert captured["proxy_url"] == "14.224.199.205:41230:aqPdHe:JWWNEX"
    assert captured["existing_account"] is True
    assert captured["challenge_strategy"] == "sentinel_protocol"
