"""
Data parity test suite: verifies that the test environment DB mirrors production.
Run after sync-prod-to-test.sh to confirm the sync was successful.

Usage:
  pytest tests/test_data_parity.py -v

Environment variables:
  PROD_BASE_URL    - Production API base URL (default: https://profile.wavelync.com)
  TEST_BASE_URL    - Test API base URL      (default: https://test.profile.wavelync.com)
  PROD_USER_NAME   - Production login username (default: TEST_USER_NAME)
  PROD_PASSWORD    - Production login password (default: TEST_PASSWORD)
  TEST_USER_NAME   - Test login username (required)
  TEST_PASSWORD    - Test login password (required)
"""

import os
import pytest
import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROD_URL = os.environ.get("PROD_BASE_URL", "https://profile.wavelync.com")
TEST_URL  = os.environ.get("TEST_BASE_URL",  "https://test.profile.wavelync.com")

PROD_USER = os.environ.get("PROD_USER_NAME") or os.environ.get("TEST_USER_NAME", "")
PROD_PASS = os.environ.get("PROD_PASSWORD")  or os.environ.get("TEST_PASSWORD",  "")
TEST_USER = os.environ.get("TEST_USER_NAME", "")
TEST_PASS = os.environ.get("TEST_PASSWORD",  "")

STATE = {}

# Tables to compare and their approximate expected minimum counts from production
PARITY_TABLES = [
    ("buildings",           6),
    ("assets",            132),
    ("asset_types",       305),
    ("operators",           3),
    ("managers",            1),
    ("address_list",      945),
    ("asset_files",        53),
    ("audit",            1824),
    ("assets_history",   1742),
    ("field_configurations", 351),
    ("system_configuration",   5),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(base_url: str, user: str, pwd: str, client: httpx.Client) -> str:
    r = client.post(f"{base_url}/api/auth/session",
                    json={"user_name": user, "password": pwd})
    assert r.status_code == 200, f"Login failed at {base_url}: {r.text[:200]}"
    return r.json()["access_token"]


def _count(base_url: str, table: str, token: str, client: httpx.Client) -> int:
    """Return row count for a table via the generic data endpoint."""
    r = client.get(
        f"{base_url}/api/data/{table}",
        params={"select": "count", "limit": "1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200:
        return -1
    data = r.json()
    # Some endpoints return [{"count": N}], others return a list of rows
    if isinstance(data, list):
        if len(data) > 0 and "count" in data[0]:
            return int(data[0]["count"])
        return len(data)
    return -1


def _count_all(base_url: str, table: str, token: str, client: httpx.Client) -> int:
    """Fetch all rows and count them (for small tables or when count param unsupported)."""
    r = client.get(
        f"{base_url}/api/data/{table}",
        params={"select": "*", "limit": "100000"},
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200:
        return -1
    data = r.json()
    return len(data) if isinstance(data, list) else -1


# ---------------------------------------------------------------------------
# Module fixture — login to both prod and test once
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def parity_setup():
    assert TEST_USER, "TEST_USER_NAME env var required"
    assert TEST_PASS, "TEST_PASSWORD env var required"

    client = httpx.Client(timeout=30.0, verify=False, follow_redirects=True)
    STATE["client"] = client

    STATE["prod_token"] = _login(PROD_URL, PROD_USER, PROD_PASS, client)
    STATE["test_token"] = _login(TEST_URL, TEST_USER, TEST_PASS, client)

    # Pre-fetch all counts once
    STATE["prod_counts"] = {}
    STATE["test_counts"] = {}
    for table, _ in PARITY_TABLES:
        prod_n = _count_all(PROD_URL, table, STATE["prod_token"], client)
        test_n = _count_all(TEST_URL, table, STATE["test_token"], client)
        STATE["prod_counts"][table] = prod_n
        STATE["test_counts"][table] = test_n

    yield
    client.close()


# ---------------------------------------------------------------------------
# P01 – P0N: one test per table
# ---------------------------------------------------------------------------

def _parity_test(table: str, min_expected: int):
    prod_n = STATE["prod_counts"].get(table, -1)
    test_n = STATE["test_counts"].get(table, -1)

    assert prod_n >= 0, f"Could not fetch production count for {table}"
    assert test_n >= 0, f"Could not fetch test count for {table}"
    assert test_n >= min_expected, (
        f"{table}: test DB has {test_n} rows but expected at least {min_expected} "
        f"(production has {prod_n})"
    )
    assert test_n == prod_n, (
        f"{table}: test DB has {test_n} rows but production has {prod_n} — sync may be incomplete"
    )
    print(f"  ✓ {table}: {test_n} rows (matches production)")


def test_P01_buildings_parity():
    _parity_test("buildings", 6)


def test_P02_assets_parity():
    _parity_test("assets", 132)


def test_P03_asset_types_parity():
    _parity_test("asset_types", 305)


def test_P04_operators_parity():
    _parity_test("operators", 3)


def test_P05_managers_parity():
    _parity_test("managers", 1)


def test_P06_address_list_parity():
    _parity_test("address_list", 945)


def test_P07_asset_files_parity():
    _parity_test("asset_files", 53)


def test_P08_audit_parity():
    _parity_test("audit", 1824)


def test_P09_assets_history_parity():
    _parity_test("assets_history", 1742)


def test_P10_field_configurations_parity():
    _parity_test("field_configurations", 351)


def test_P11_system_configuration_parity():
    _parity_test("system_configuration", 5)


# ---------------------------------------------------------------------------
# Spot-check: specific production building numbers exist in test
# ---------------------------------------------------------------------------

def test_P12_production_buildings_exist_in_test():
    """Every building from production must exist in test."""
    client = STATE["client"]
    prod_token = STATE["prod_token"]
    test_token = STATE["test_token"]

    prod_buildings = client.get(
        f"{PROD_URL}/api/data/buildings",
        params={"select": "building_number", "limit": "10000"},
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    assert isinstance(prod_buildings, list) and len(prod_buildings) > 0

    prod_nums = {r["building_number"] for r in prod_buildings}

    test_buildings = client.get(
        f"{TEST_URL}/api/data/buildings",
        params={"select": "building_number", "limit": "10000"},
        headers={"Authorization": f"Bearer {test_token}"},
    ).json()
    test_nums = {r["building_number"] for r in test_buildings if r.get("building_number")}

    missing = prod_nums - test_nums
    assert not missing, f"Buildings in production but missing from test: {sorted(missing)}"
    print(f"  ✓ All {len(prod_nums)} production buildings present in test")


def test_P13_production_assets_count_per_building():
    """Each production building has the same asset count in test."""
    client = STATE["client"]
    prod_token = STATE["prod_token"]
    test_token = STATE["test_token"]

    prod_buildings = client.get(
        f"{PROD_URL}/api/data/buildings",
        params={"select": "building_number", "limit": "10000"},
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()

    mismatches = []
    for row in prod_buildings:
        bn = row.get("building_number")
        if not bn:
            continue
        prod_assets = client.get(
            f"{PROD_URL}/api/data/assets",
            params={"building_number": bn, "select": "asset_id", "limit": "100000"},
            headers={"Authorization": f"Bearer {prod_token}"},
        ).json()
        test_assets = client.get(
            f"{TEST_URL}/api/data/assets",
            params={"building_number": bn, "select": "asset_id", "limit": "100000"},
            headers={"Authorization": f"Bearer {test_token}"},
        ).json()
        p = len(prod_assets) if isinstance(prod_assets, list) else 0
        t = len(test_assets) if isinstance(test_assets, list) else 0
        if p != t:
            mismatches.append(f"building {bn}: prod={p} test={t}")

    assert not mismatches, "Asset count mismatch per building:\n" + "\n".join(mismatches)
    print(f"  ✓ Asset counts match for all {len(prod_buildings)} buildings")


def test_P14_tester_user_can_login_after_sync():
    """The test 'tester' user must still be able to login after sync."""
    client = STATE["client"]
    r = client.post(
        f"{TEST_URL}/api/auth/session",
        json={"user_name": TEST_USER, "password": TEST_PASS},
    )
    assert r.status_code == 200, f"tester login failed after sync: {r.text}"
    print(f"  ✓ tester user can still login to test env")
