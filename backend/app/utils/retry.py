import asyncio
import httpx


async def request_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    max_retries: int = 3,
    **kwargs,
) -> httpx.Response:
    for attempt in range(max_retries):
        resp = await client.request(method, url, **kwargs)

        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 2**attempt))
            await asyncio.sleep(wait)
            continue

        if resp.status_code >= 500 and attempt < max_retries - 1:
            await asyncio.sleep(2**attempt)
            continue

        resp.raise_for_status()
        return resp

    resp.raise_for_status()
    return resp
