import asyncio
import httpx

# Never keep a staff member (or a webhook) waiting long: if the server asks us to wait
# longer than this, give up and let the caller show a "try again shortly" message.
MAX_WAIT_SECONDS = 10


async def request_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    max_retries: int = 3,
    **kwargs,
) -> httpx.Response:
    resp: httpx.Response | None = None
    for attempt in range(max_retries):
        resp = await client.request(method, url, **kwargs)

        if resp.status_code == 429 and attempt < max_retries - 1:
            try:
                wait = float(resp.headers.get("Retry-After", 2**attempt))
            except ValueError:
                wait = 2**attempt
            if wait > MAX_WAIT_SECONDS:
                break  # long cool-down: fail fast instead of hanging
            await asyncio.sleep(wait)
            continue

        if resp.status_code >= 500 and attempt < max_retries - 1:
            await asyncio.sleep(2**attempt)
            continue

        break

    assert resp is not None
    resp.raise_for_status()
    return resp
