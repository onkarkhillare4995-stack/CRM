"""Atomicity helper. Uses real MongoDB multi-document transactions when the
deployment is a replica set; otherwise degrades to a validated sequential path
(all validation is performed BEFORE any write, so partial writes are avoided)."""
from contextlib import asynccontextmanager
from core.database import client

_supports = None


async def supports_transactions() -> bool:
    global _supports
    if _supports is None:
        try:
            hello = await client.admin.command("hello")
            _supports = bool(hello.get("setName"))
        except Exception:
            _supports = False
    return _supports


@asynccontextmanager
async def atomic():
    """Yield a session (real transaction) or None (sequential fallback)."""
    if await supports_transactions():
        async with await client.start_session() as s:
            async with s.start_transaction():
                yield s
    else:
        yield None
