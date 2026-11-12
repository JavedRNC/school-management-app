"""Test settings shared by every test module (set before the app is imported)."""
import os

os.environ.setdefault("ALLOW_DEFAULT_ADMIN_PASSWORD", "1")     # tests sign in as admin/admin123; real servers never get that default
os.environ.setdefault("ALLOW_DEMO_IMPORT", "1")                # the import tests use the demo school

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    from app import ratelimit
    ratelimit.reset()
    yield
