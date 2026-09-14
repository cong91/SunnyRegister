"""Card pool store for the direct-card runtime.

One card binds to exactly one account. Cards live in a JSON store under the
durable data volume (DIRECT_CARD_CARD_POOL_PATH). A card that binds
successfully is marked used and never handed out again; system failures
release the card, card-specific declines block it.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STORE_PATH = Path(
    os.getenv("DIRECT_CARD_CARD_POOL_PATH")
    or (Path(__file__).resolve().parent / "card_pool.json")
)
_LOCK = threading.RLock()

CARD_ERROR_MARKERS = (
    "card_declined", "incorrect_cvc", "expired_card",
    "lost_card", "stolen_card", "fraudulent", "insufficient_funds",
)


class CardPoolError(RuntimeError):
    """Card pool operation failed."""


class CardPoolExhausted(CardPoolError):
    """No available card left in the pool."""


def is_card_error(value: Any) -> bool:
    text = str(value or "").lower()
    return any(marker in text for marker in CARD_ERROR_MARKERS)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _luhn_valid(number: str) -> bool:
    digits = [int(char) for char in number]
    checksum = 0
    for index, digit in enumerate(reversed(digits)):
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0


def parse_card_line(line: str) -> dict[str, str]:
    """Parse one `number | MM/YY | CVC` line into normalized card fields."""
    parts = [part.strip() for part in str(line or "").replace("｜", "|").split("|")]
    parts = [part for part in parts if part]
    if len(parts) != 3:
        raise CardPoolError("định dạng thẻ phải là số thẻ | MM/YY | CVC")
    number = re.sub(r"\D", "", parts[0])
    if not 12 <= len(number) <= 19:
        raise CardPoolError("số thẻ phải có 12-19 chữ số")
    if not _luhn_valid(number):
        raise CardPoolError("số thẻ không hợp lệ (Luhn)")
    exp_match = re.fullmatch(r"(\d{1,2})\s*[/\-]\s*(\d{2,4})", parts[1])
    if not exp_match:
        raise CardPoolError("hạn thẻ phải là MM/YY hoặc MM/YYYY")
    month = int(exp_match.group(1))
    year = int(exp_match.group(2))
    if year < 100:
        year += 2000
    if not 1 <= month <= 12:
        raise CardPoolError("tháng hết hạn không hợp lệ")
    if year < 2024 or year > 2100:
        raise CardPoolError("năm hết hạn không hợp lệ")
    cvc = re.sub(r"\D", "", parts[2])
    if len(cvc) not in {3, 4}:
        raise CardPoolError("CVC phải có 3-4 chữ số")
    return {
        "number": number,
        "exp_month": f"{month:02d}",
        "exp_year": str(year),
        "cvc": cvc,
        "last4": number[-4:],
    }


def _card_id(number: str) -> str:
    return hashlib.sha256(number.encode("utf-8")).hexdigest()[:16]


def _read_store() -> dict[str, Any]:
    try:
        payload = json.loads(STORE_PATH.read_text(encoding="utf-8-sig") or "{}")
    except (OSError, ValueError):
        return {"version": 1, "cards": {}}
    if not isinstance(payload, dict) or not isinstance(payload.get("cards"), dict):
        return {"version": 1, "cards": {}}
    return payload


def _write_store(payload: dict[str, Any]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload["version"] = 1
    temporary = STORE_PATH.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )
    temporary.replace(STORE_PATH)


def _masked(card: dict[str, Any]) -> dict[str, Any]:
    return {
        key: card.get(key)
        for key in ("card_id", "last4", "exp_month", "exp_year", "status", "account", "task_id", "error", "created_at", "updated_at")
    }


def add_cards(lines: list[str] | str) -> dict[str, Any]:
    source = [lines] if isinstance(lines, str) else list(lines or [])
    added: list[dict[str, Any]] = []
    duplicates: list[str] = []
    invalid: list[dict[str, str]] = []
    with _LOCK:
        store = _read_store()
        cards = store["cards"]
        for line in source:
            text = str(line or "").strip()
            if not text:
                continue
            try:
                fields = parse_card_line(text)
            except CardPoolError as exc:
                invalid.append({"line": text[:60], "error": str(exc)})
                continue
            card_id = _card_id(fields["number"])
            if card_id in cards:
                duplicates.append(fields["last4"])
                continue
            now = _now()
            cards[card_id] = {
                **fields,
                "card_id": card_id,
                "status": "available",
                "account": "",
                "task_id": "",
                "error": "",
                "created_at": now,
                "updated_at": now,
            }
            added.append(_masked(cards[card_id]))
        if added:
            _write_store(store)
    return {"ok": True, "added": added, "duplicates": duplicates, "invalid": invalid}


def list_cards() -> dict[str, Any]:
    with _LOCK:
        cards = [
            _masked(card)
            for card in sorted(_read_store()["cards"].values(), key=lambda item: str(item.get("created_at") or ""))
        ]
    return {"ok": True, "cards": cards}


def remove_cards(card_ids: list[str]) -> dict[str, Any]:
    wanted = {str(card_id or "").strip() for card_id in card_ids or []}
    with _LOCK:
        store = _read_store()
        removable = [
            card_id
            for card_id, card in store["cards"].items()
            if card_id in wanted and card.get("status") != "reserved"
        ]
        for card_id in removable:
            store["cards"].pop(card_id, None)
        if removable:
            _write_store(store)
    return {"ok": True, "removed": len(removable)}


def reserve(task_id: str, account: str = "") -> dict[str, str]:
    """Reserve one available card for this task; raise CardPoolExhausted if none."""
    owner = str(task_id or "").strip()
    if not owner:
        raise CardPoolError("reservation requires a task id")
    with _LOCK:
        _reconcile_locked()
        store = _read_store()
        for card in store["cards"].values():
            if card.get("status") != "available":
                continue
            card["status"] = "reserved"
            card["task_id"] = owner
            card["account"] = str(account or "")
            card["error"] = ""
            card["updated_at"] = _now()
            _write_store(store)
            return {
                "card_id": card["card_id"],
                "number": card["number"],
                "exp_month": card["exp_month"],
                "exp_year": card["exp_year"],
                "cvc": card["cvc"],
                "last4": card["last4"],
            }
    raise CardPoolExhausted("卡池没有可用卡片")


def settle(task_id: str, *, ok: bool, error: str = "") -> str:
    """Resolve a reservation: used on bind success, failed on card errors, else released."""
    owner = str(task_id or "").strip()
    with _LOCK:
        store = _read_store()
        for card in store["cards"].values():
            if card.get("task_id") != owner or card.get("status") != "reserved":
                continue
            if ok:
                card["status"] = "used"
                card["error"] = ""
            elif is_card_error(error):
                card["status"] = "failed"
                card["error"] = str(error or "")[:200]
            else:
                card["status"] = "available"
                card["account"] = ""
                card["error"] = ""
            card["task_id"] = ""
            card["updated_at"] = _now()
            _write_store(store)
            return card["status"]
    return ""


def _reconcile_locked() -> None:
    """Release reservations whose task is no longer running."""
    active = _active_task_ids()
    if active is None:
        return
    store = _read_store()
    released = 0
    for card in store["cards"].values():
        if card.get("status") != "reserved":
            continue
        if card.get("task_id") not in active:
            card["status"] = "available"
            card["account"] = ""
            card["task_id"] = ""
            card["updated_at"] = _now()
            released += 1
    if released:
        _write_store(store)


_active_task_ids: Any = lambda: None  # Overridden by the runtime to report live tasks.


def set_active_task_provider(provider: Any) -> None:
    """Register the callable returning the set of live task ids for reconcile."""
    global _active_task_ids
    _active_task_ids = provider


def counts() -> dict[str, int]:
    with _LOCK:
        store = _read_store()
    result = {"available": 0, "reserved": 0, "used": 0, "failed": 0}
    for card in store["cards"].values():
        status = str(card.get("status") or "")
        if status in result:
            result[status] += 1
    return result
