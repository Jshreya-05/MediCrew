import hashlib
import os
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

SECRET_KEY = os.environ.get("MEDICREW_SECRET_KEY", "dev-only-change-in-production-use-openssl-rand")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 14


def hash_password(password: str) -> str:
    """SHA-256 then bcrypt — avoids bcrypt's 72-byte limit and passlib/bcrypt4 breakage."""
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return bcrypt.hashpw(digest, bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    try:
        return bcrypt.checkpw(digest, hashed.encode("ascii"))
    except ValueError:
        return False


def create_access_token(sub: str, user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": sub, "uid": user_id, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
