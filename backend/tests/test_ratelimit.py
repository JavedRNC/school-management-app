"""Which address a request is counted under for rate limits (app.ratelimit.client_ip).

The login limiter is only as good as this: if a caller could choose the address it's counted under, it could send a
fresh one on every request and guess passwords without limit (one common password against every account). Found while
trying to break the login during a security pass.
"""
import os

import pytest

from app import ratelimit


class FakeRequest:
    def __init__(self, peer, headers=None):
        self.client = type("C", (), {"host": peer})()
        self.headers = headers or {}


@pytest.fixture(autouse=True)
def _render(monkeypatch):
    # behave as on Render: every request arrives through the edge, forwarded headers are read
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "1")
    monkeypatch.delenv("TRUST_CF_HEADER", raising=False)
    yield


@pytest.mark.tc("TC-B-163", "A caller can't pick the address its rate limit is counted under")
@pytest.mark.sanity
@pytest.mark.regression
def test_client_ip_cannot_be_spoofed():
    proxy_peer = "10.0.0.5"        # Render's edge (a private address)

    # TC-B-163.1 — X-Forwarded-For: only the LAST entry (added by our proxy) is used; anything the caller prepends is ignored
    real = FakeRequest(proxy_peer, {"x-forwarded-for": "203.0.113.9"})
    assert ratelimit.client_ip(real) == "203.0.113.9"
    spoofed = FakeRequest(proxy_peer, {"x-forwarded-for": "1.2.3.4, 203.0.113.9"})
    assert ratelimit.client_ip(spoofed) == "203.0.113.9", "a forged left-hand entry must not change the counted address"

    # TC-B-163.2 — CF-Connecting-IP is NOT believed unless the deploy opts in (Render alone doesn't set it)
    cf = FakeRequest(proxy_peer, {"cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "203.0.113.9"})
    assert ratelimit.client_ip(cf) == "203.0.113.9", "cf-connecting-ip must be ignored by default"

    # TC-B-163.3 — with Cloudflare actually in front (opt-in), its header is used
    os.environ["TRUST_CF_HEADER"] = "1"
    try:
        assert ratelimit.client_ip(cf) == "9.9.9.9"
    finally:
        del os.environ["TRUST_CF_HEADER"]


@pytest.mark.tc("TC-B-164", "Rotating a forwarded header can't walk past the per-address login limit")
@pytest.mark.regression
def test_rotating_header_stays_limited():
    ratelimit.reset()
    limit, window = 30, 300

    def attempt(forged_ip):                 # one wrong-password attempt, caller trying a new address each time
        req = FakeRequest("10.0.0.5", {"cf-connecting-ip": forged_ip})
        return ratelimit.hit(f"login-fail:{ratelimit.client_ip(req)}", limit, window)

    allowed = sum(attempt(f"198.51.{n // 256}.{n % 256}") for n in range(limit + 15))
    assert allowed == limit, f"rotating the header let {allowed} through; the limit is {limit}"
