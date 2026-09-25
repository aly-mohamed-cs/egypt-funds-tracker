import time

import requests

USER_AGENT = "egypt-funds-tracker/1.0 (+https://github.com/aly-mohamed-cs/egypt-funds-tracker)"


class UnexpectedResponseError(RuntimeError):
    pass


class PoliteSession:
    def __init__(self, min_interval: float = 5.0, retries: int = 3, timeout: float = 30.0):
        self.min_interval = min_interval
        self.retries = retries
        self.timeout = timeout
        self.request_count = 0
        self._last_request = float("-inf")
        self._session = requests.Session()
        self._session.headers["User-Agent"] = USER_AGENT

    def get_json(self, url: str, params: dict | None = None):
        return self._json(self._request("GET", url, params=params))

    def post_json(self, url: str, payload: dict):
        return self._json(self._request("POST", url, json=payload))

    def get_text(self, url: str) -> str | None:
        resp = self._request("GET", url)
        if resp.status_code == 404:
            return None
        if resp.status_code in (403, 429):
            raise UnexpectedResponseError(f"GET {url} returned HTTP {resp.status_code}")
        resp.raise_for_status()
        text = resp.content.decode("utf-8", errors="replace")
        if text.lstrip().startswith("<"):
            raise UnexpectedResponseError(f"GET {url} returned an HTML page instead of CSV")
        return text

    @staticmethod
    def _json(resp: requests.Response):
        content_type = resp.headers.get("Content-Type", "")
        if resp.status_code in (403, 429) or "json" not in content_type:
            raise UnexpectedResponseError(
                f"{resp.request.method} {resp.url} returned HTTP {resp.status_code} "
                f"({content_type or 'no content type'}); the site may be blocking automated requests or may have changed."
            )
        resp.raise_for_status()
        return resp.json()

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        for attempt in range(1, self.retries + 1):
            wait = self._last_request + self.min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_request = time.monotonic()
            self.request_count += 1
            try:
                resp = self._session.request(method, url, timeout=self.timeout, **kwargs)
            except (requests.ConnectionError, requests.Timeout):
                if attempt == self.retries:
                    raise
            else:
                if resp.status_code < 500 or attempt == self.retries:
                    return resp
            time.sleep(self.min_interval * attempt)
