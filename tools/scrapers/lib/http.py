"""http.py — Cliente HTTP con rate limit, retry, y User-Agent.

Stdlib only: urllib.request, urllib.error, time, threading, json.
"""

from __future__ import annotations

import json
import random
import threading
import time
import urllib.error
import urllib.request
from typing import Any

# Rate limits por dominio (req/seg). Configurables desde los scripts.
RATE_LIMITS: dict[str, int] = {
    "apps5.mineco.gob.pe": 2,
    "ofi5.mef.gob.pe": 4,
    "apps.contraloria.gob.pe": 2,
    "siep.inpe.gob.pe": 4,
    "portal-inpe.opendata.arcgis.com": 10,
    "app.midis.gob.pe": 2,
    "mimp.gob.pe": 2,
    "openruc.com": 5,
    "www.datosabiertos.gob.pe": 15,
    "default": 4,
}

DEFAULT_UA = "rastro-scraper/1.0 (+https://rastro.fyi)"
DEFAULT_TIMEOUT_GET = 30
DEFAULT_TIMEOUT_HEAD = 8
DEFAULT_RETRIES = 3


def _domain(url: str) -> str:
    from urllib.parse import urlparse

    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def _rate_for(url: str) -> float:
    """Devuelve segundos mínimos entre requests para este dominio."""
    host = _domain(url)
    per_sec = RATE_LIMITS.get(host, RATE_LIMITS["default"])
    return 1.0 / per_sec


class RateLimitedClient:
    """Cliente HTTP con rate limit por dominio, retry, jitter."""

    def __init__(self, user_agent: str = DEFAULT_UA, default_timeout: int = DEFAULT_TIMEOUT_GET) -> None:
        self.user_agent = user_agent
        self.default_timeout = default_timeout
        self._locks: dict[str, threading.Lock] = {}
        self._last: dict[str, float] = {}

    def _lock_for(self, host: str) -> threading.Lock:
        if host not in self._locks:
            self._locks[host] = threading.Lock()
        return self._locks[host]

    def _wait(self, url: str) -> None:
        host = _domain(url)
        lock = self._lock_for(host)
        interval = _rate_for(url)
        with lock:
            last = self._last.get(host, 0.0)
            now = time.monotonic()
            wait = interval - (now - last)
            if wait > 0:
                time.sleep(wait)
            self._last[host] = time.monotonic()

    def get(
        self,
        url: str,
        *,
        timeout: int | None = None,
        retries: int = DEFAULT_RETRIES,
        as_json: bool = False,
        headers: dict[str, str] | None = None,
    ) -> bytes | dict[str, Any]:
        """GET con rate limit, retry, jitter. Devuelve bytes o dict si as_json=True."""
        timeout = timeout or self.default_timeout
        last_err: Exception | None = None
        for attempt in range(retries):
            try:
                self._wait(url)
                req = urllib.request.Request(url, method="GET")
                req.add_header("User-Agent", self.user_agent)
                req.add_header("Accept", "application/json, text/html, */*")
                if headers:
                    for k, v in headers.items():
                        req.add_header(k, v)
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    body = resp.read()
                if as_json:
                    return json.loads(body.decode("utf-8"))
                return body
            except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError) as e:
                last_err = e
                # backoff exponencial con jitter
                backoff = 0.5 * (2**attempt) + random.uniform(0, 0.3)
                time.sleep(backoff)
        raise RuntimeError(f"GET {url} failed after {retries} attempts: {last_err}")

    def get_text(self, url: str, **kw) -> str:
        body = self.get(url, as_json=False, **kw)
        return body.decode("utf-8", errors="replace") if isinstance(body, bytes) else str(body)

    def head(self, url: str, *, timeout: int = DEFAULT_TIMEOUT_HEAD) -> dict[str, Any]:
        """HEAD request liviano. Devuelve dict con status, content_type, content_length, error."""
        try:
            self._wait(url)
            req = urllib.request.Request(url, method="HEAD")
            req.add_header("User-Agent", self.user_agent)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return {
                    "status": resp.status,
                    "content_type": resp.headers.get("Content-Type", ""),
                    "content_length": int(resp.headers.get("Content-Length") or 0),
                    "final_url": resp.geturl(),
                    "error": None,
                }
        except urllib.error.HTTPError as e:
            return {"status": e.code, "content_type": "", "content_length": 0, "final_url": url, "error": str(e)}
        except Exception as e:  # timeout, ssl, dns
            return {"status": 0, "content_type": "", "content_length": 0, "final_url": url, "error": str(e)[:160]}
