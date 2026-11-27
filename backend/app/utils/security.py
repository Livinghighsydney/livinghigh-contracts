"""Password hashing and random tokens — standard library only (hashlib.scrypt)."""
import base64
import hashlib
import hmac
import re
import secrets

# scrypt cost: n=2**14, r=8, p=1 (OWASP minimum guidance for scrypt), 64-byte key.
_N, _R, _P, _DKLEN = 2**14, 8, 1, 64


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    return "scrypt${}${}${}${}${}".format(
        _N, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(key).decode()
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, key_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(key_b64)
        key = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt_b64),
            n=int(n), r=int(r), p=int(p), dklen=len(expected),
        )
        return hmac.compare_digest(key, expected)
    except Exception:
        return False


# Used to keep login timing the same for unknown emails (no user enumeration).
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def new_token() -> str:
    """URL-safe random token for sessions and invite links (256 bits)."""
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    """We store only this, never the token itself."""
    return hashlib.sha256(token.encode()).hexdigest()


def password_problem(password: str) -> str | None:
    """Plain-English reason a password is too weak, or None if it's fine."""
    if len(password) < 8:
        return "Use at least 8 characters."
    if len(password) > 200:
        return "Use 200 characters or fewer."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Use at least one letter and one number."
    return None
