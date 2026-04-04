from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from db_models import User
from security import decode_token

security_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> User:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    if not payload or "uid" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.get(User, int(payload["uid"]))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
