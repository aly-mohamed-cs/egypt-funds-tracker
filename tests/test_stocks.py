from tracker.stocks import parse_scan


def test_parse_scan_keeps_egx_stocks_sorted_with_clean_names():
    data = {
        "totalCount": 3,
        "data": [
            {"s": "EGX:COMI", "d": ["COMI", "Commercial International Bank  - Egypt (CIB) S.A.E."]},
            {"s": "EGX:ABUK", "d": ["ABUK", "Abou Kir Fertilizers & Chemical Industries Co."]},
            {"s": "OTHER:XYZ", "d": ["XYZ", "Not listed on EGX"]},
        ],
    }
    assert parse_scan(data) == [
        {"symbol": "EGX:ABUK", "name": "Abou Kir Fertilizers & Chemical Industries Co."},
        {"symbol": "EGX:COMI", "name": "Commercial International Bank - Egypt (CIB) S.A.E."},
    ]
