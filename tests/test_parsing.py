from datetime import date

from tracker.mubasher import clean, detect_currency, parse_history_csv, parse_list_date, parse_percent


def test_parse_list_date():
    assert parse_list_date("20 September 2026") == date(2026, 9, 20)
    assert parse_list_date(" 05  september 2026 ") == date(2026, 9, 5)


def test_parse_list_date_rejects_unusable_values():
    assert parse_list_date("") is None
    assert parse_list_date(None) is None
    assert parse_list_date("20 سبتمبر 2026") is None
    assert parse_list_date("31 February 2026") is None


def test_parse_percent():
    assert parse_percent("14.60%") == 0.146
    assert parse_percent("-3.5%") == -0.035
    assert parse_percent("0.00%") is None
    assert parse_percent(None) is None
    assert parse_percent("n/a") is None


def test_parse_history_csv_skips_bad_rows():
    text = (
        "2022/12/18/00:00:00,10.01437\r\n"
        "2022/12/19/00:00:00,10.02\n"
        "\n"
        "garbage\n"
        "2022/12/20/00:00:00,0\n"
        "2022/12/21/00:00:00,\n"
    )
    assert parse_history_csv(text) == {"2022-12-18": 10.01437, "2022-12-19": 10.02}


def test_detect_currency():
    assert detect_currency("Beltone Fixed Income Fund Issuance 1 USD") == "USD"
    assert detect_currency("Horus Money Market Fund Horus") == "EGP"
    assert detect_currency(None, "صندوق بنك مصر النقدي بالدولار") == "USD"


def test_clean_collapses_whitespace():
    assert clean("  Azimut Fixed Income Fund  Halan  AZ ") == "Azimut Fixed Income Fund Halan AZ"
    assert clean(None) == ""
