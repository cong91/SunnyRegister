from __future__ import annotations

import pytest


@pytest.fixture()
def pool(tmp_path, monkeypatch):
    import card_pool

    monkeypatch.setattr(card_pool, "STORE_PATH", tmp_path / "cards.json")
    yield card_pool
    card_pool.set_active_task_provider(lambda: None)


def test_parse_card_line_normalizes_and_validates(pool):
    card = pool.parse_card_line("4242 4242 4242 4242 | 12/27 | 123")
    assert card["number"] == "4242424242424242"
    assert card["exp_month"] == "12"
    assert card["exp_year"] == "2027"
    assert card["last4"] == "4242"

    for bad_line in (
        "4242424242424241 | 12/27 | 123",
        "4242424242424242 | 13/27 | 123",
        "4242424242424242 | 12/27 | 12",
        "only-one-segment",
        "4242424242424242 | 27/12 | 123",
    ):
        with pytest.raises(pool.CardPoolError):
            pool.parse_card_line(bad_line)


def test_add_cards_reports_duplicates_and_invalid(pool):
    result = pool.add_cards(
        [
            "4242424242424242 | 12/27 | 123",
            "4242424242424242 | 12/27 | 123",
            "bad line",
        ]
    )
    assert len(result["added"]) == 1
    assert result["duplicates"] == ["4242"]
    assert len(result["invalid"]) == 1

    again = pool.add_cards("4242424242424242 | 12/27 | 123")
    assert again["added"] == []
    assert again["duplicates"] == ["4242"]

    listing = pool.list_cards()["cards"]
    assert listing[0]["last4"] == "4242"
    assert "number" not in listing[0]
    assert "cvc" not in listing[0]


def test_reserve_settle_lifecycle(pool):
    pool.add_cards(
        [
            "4242424242424242 | 12/27 | 123",
            "4111111111111111 | 06/28 | 4567",
        ]
    )
    first = pool.reserve("task-1", account="a@example.test")
    assert first["number"] == "4242424242424242"
    second = pool.reserve("task-2")
    assert second["number"] == "4111111111111111"
    with pytest.raises(pool.CardPoolExhausted):
        pool.reserve("task-3")

    assert pool.settle("task-1", ok=True) == "used"
    assert pool.settle("task-2", ok=False, error="payment failed: card_declined by issuer") == "failed"

    statuses = {card["last4"]: card["status"] for card in pool.list_cards()["cards"]}
    assert statuses == {"4242": "used", "1111": "failed"}
    with pytest.raises(pool.CardPoolExhausted):
        pool.reserve("task-4")


def test_settle_releases_on_system_error(pool):
    pool.add_cards(["4242424242424242 | 12/27 | 123"])
    pool.reserve("task-1")
    assert pool.settle("task-1", ok=False, error="proxy curl: (28) timed out") == "available"
    assert pool.reserve("task-2")["number"] == "4242424242424242"


def test_reconcile_releases_dead_reservations(pool):
    pool.add_cards(["4242424242424242 | 12/27 | 123"])
    pool.reserve("dead-task")
    pool.set_active_task_provider(lambda: {"live-task"})
    assert pool.reserve("live-task")["number"] == "4242424242424242"
    assert pool.counts()["reserved"] == 1


def test_remove_cards_keeps_reserved(pool):
    pool.add_cards(["4242424242424242 | 12/27 | 123"])
    card_id = pool.list_cards()["cards"][0]["card_id"]
    pool.reserve("task-1")
    assert pool.remove_cards([card_id])["removed"] == 0
    pool.settle("task-1", ok=True)
    assert pool.remove_cards([card_id])["removed"] == 1
