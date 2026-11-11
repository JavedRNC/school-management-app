import logging
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import AuditLog, Role, School, User
from .perms import RANK, level_of
from .subscription import can_write, school_modules

DEV_SECRET = "dev-only-secret-change-me-in-production-0123456789"
_ENV_SECRET = os.getenv("JWT_SECRET", "")
# Fail closed: no usable secret until ensure_secret() runs at startup (a weak/public JWT_SECRET is ignored).
SECRET: str | None = _ENV_SECRET if len(_ENV_SECRET) >= 32 and _ENV_SECRET != DEV_SECRET else None


def secret() -> str:
    if not SECRET:
        raise RuntimeError("Server secret not initialised")
    return SECRET


def derived_key(purpose: str) -> bytes:
    """Separate keys per use (JWT, backup signature, backup vault) from one server secret."""
    import hashlib
    import hmac as _h

    return _h.new(secret().encode(), purpose.encode(), hashlib.sha256).digest()


def ensure_secret(db) -> None:
    """Use JWT_SECRET (≥32 chars) when set; otherwise a random secret kept in the database — never a public default."""
    global SECRET
    if SECRET:
        return
    if _ENV_SECRET:
        logging.getLogger("auth").warning("JWT_SECRET is too short or the public default — using a generated secret instead")
    import secrets as _s

    from .models import Meta
    row = db.get(Meta, "jwt_secret")
    if not row:
        row = Meta(key="jwt_secret", value=_s.token_urlsafe(48))
        db.add(row)
        db.commit()
    SECRET = row.value


TOKEN_DAYS = 7
MAX_FAILED = 5
LOCK_MINUTES = 15
bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def check_password_rules(pw: str, login_id: str) -> None:
    if len(pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if pw.strip().lower() == (login_id or "").strip().lower():
        raise HTTPException(400, "Password can't be the same as the login ID")


def make_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)
    return jwt.encode({"sub": str(user.id), "role": user.role.value, "sid": user.school_id, "exp": exp}, secret(), algorithm="HS256")


def audit(db: Session, actor: User | None, action: str, detail: str = "", school_id: int | None = None) -> None:
    db.add(AuditLog(school_id=school_id if school_id is not None else (actor.school_id if actor else None),
                    actor_id=actor.id if actor else None, actor_name=actor.name if actor else "system",
                    actor_role=actor.role.value if actor else "", action=action, detail=detail[:2000]))


ALLOW_DURING_PW_CHANGE = {"/auth/me", "/auth/password", "/auth/consent", "/school/me"}


def current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    try:
        data = jwt.decode(creds.credentials, secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired — please sign in again")
    user = db.get(User, int(data["sub"]))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found or removed")
    if user.school_id:
        school = db.get(School, user.school_id)
        if not school or school.suspended:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This school's account is suspended. Please contact support.")
        if request.method != "GET" and request.url.path not in ALLOW_DURING_PW_CHANGE and not can_write(school):
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Subscription expired — the app is read-only until it's renewed.")
    if user.must_change_password and request.url.path not in ALLOW_DURING_PW_CHANGE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "PASSWORD_CHANGE_REQUIRED")
    return user


def require(*roles: Role):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for your role")
        return user

    return dep


def require_area(area: str, level: str = "view"):
    """Principal: always. VP/Coordinator: per their permissions."""
    def dep(user: User = Depends(current_user)) -> User:
        if RANK[level_of(user, area)] < RANK[level]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have permission for this")
        return user

    return dep


def require_module(module: str):
    def dep(user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
        if user.school_id:
            s = db.get(School, user.school_id)
            if module not in school_modules(db, s):
                raise HTTPException(status.HTTP_403_FORBIDDEN, f"MODULE_NOT_ENABLED:{module}")
        return user

    return dep


admin_only = require(Role.admin)
school_user = require(Role.principal, Role.vice_principal, Role.coordinator, Role.teacher, Role.student, Role.parent)
staff = require(Role.principal, Role.vice_principal, Role.coordinator, Role.teacher)
managers = require(Role.principal, Role.vice_principal, Role.coordinator)
student_only = require(Role.student)
