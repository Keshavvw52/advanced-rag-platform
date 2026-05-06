import base64
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.database import User, get_db

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"pbkdf2_sha256${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _, salt_b64, digest_b64 = password_hash.split("$", 2)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
    except ValueError:
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return hmac.compare_digest(actual, expected)


def create_access_token(user: User) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": user.id,
        "email": user.email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)).timestamp()),
    }
    return _encode_jwt(payload)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def new_user_id() -> str:
    return str(uuid.uuid4())


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    payload = _decode_jwt(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


def _encode_jwt(payload: dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url_json(header)
    payload_b64 = _b64url_json(payload)
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(settings.JWT_SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url(signature)}"


def _decode_jwt(token: str) -> dict[str, Any]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected = hmac.new(settings.JWT_SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual = _b64url_decode(signature_b64)
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    if not hmac.compare_digest(actual, expected):
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    if int(datetime.utcnow().timestamp()) >= int(payload.get("exp", 0)):
        raise HTTPException(status_code=401, detail="Authentication token expired")

    return payload


def _b64url_json(value: dict[str, Any]) -> str:
    return _b64url(json.dumps(value, separators=(",", ":")).encode("utf-8"))


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
