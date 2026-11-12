"""Small in-memory rate limiter (one server process). Counts events per key in a sliding window.

Good enough for the public onboarding form and login on a single small instance; a shared store (Redis) is the
upgrade path if the API ever runs on several instances."""
import ipaddress
import os
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

_hits: dict[str, deque] = {}
_lock = threading.Lock()
MAX_KEYS = 20_000


def _private(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local


def client_ip(request: Request) -> str:
    """Caller's address. Forwarded headers are believed ONLY when the direct peer is our own proxy (a private address,
    as on Render); a caller reaching the app directly can't invent an address to dodge a limit.
    Behind the proxy, CF-Connecting-IP is set by the edge for every request and replaces anything the caller sent."""
    peer = request.client.host if request.client else ""
    # On Render (it sets RENDER=true) every request arrives through its edge, never directly.
    behind_proxy = bool(os.getenv("RENDER")) or _private(peer)
    if behind_proxy and os.getenv("TRUST_PROXY_HEADERS", "1") == "1":
        h = request.headers
        ip = (h.get("cf-connecting-ip") or "").strip()
        if not ip:
            xff = [p.strip() for p in (h.get("x-forwarded-for") or "").split(",") if p.strip()]
            ip = xff[-1] if xff else ""
        try:
            return str(ipaddress.ip_address(ip))
        except ValueError:
            pass
    return peer[:64] or "unknown"


def hit(key: str, limit: int, per_seconds: int) -> bool:
    """Record one event; False when the key is over its limit."""
    now = time.monotonic()
    with _lock:
        if len(_hits) > MAX_KEYS:                       # never grow without bound
            for k in [k for k, q in _hits.items() if not q or now - q[-1] > 3600][:MAX_KEYS // 2]:
                del _hits[k]
            if len(_hits) > MAX_KEYS:
                _hits.clear()
        q = _hits.setdefault(key, deque())
        while q and now - q[0] > per_seconds:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


def over(key: str, limit: int, per_seconds: int) -> bool:
    """True when the key has already used up its limit (does not record anything)."""
    now = time.monotonic()
    with _lock:
        q = _hits.get(key)
        if not q:
            return False
        while q and now - q[0] > per_seconds:
            q.popleft()
        return len(q) >= limit


def check(request: Request, name: str, limit: int, per_seconds: int, message: str = "Too many requests. Please try again later.") -> None:
    if not hit(f"{name}:{client_ip(request)}", limit, per_seconds):
        raise HTTPException(429, message)


def forget_user(user_id: int) -> None:
    """A password reset is the way out of a lock: drop the wrong-attempt counters kept for this account."""
    tail = f":{user_id}"
    with _lock:
        for k in [k for k in _hits if k.startswith("login-fail:") and k.endswith(tail)]:
            del _hits[k]


def reset() -> None:
    """For tests."""
    with _lock:
        _hits.clear()
