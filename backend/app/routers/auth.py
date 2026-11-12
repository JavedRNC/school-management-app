import os
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .. import ratelimit
from ..auth import (ACCOUNT_MAX_FAILED, LOCK_MINUTES, MAX_FAILED, STAFF_MIN_PASSWORD, WEB_ROLES, audit, check_password_rules, current_user, hash_password, make_token,
                    verify_password)
from ..db import get_db
from ..models import PushToken, Role, School, User, utcnow
from ..schemas import LoginIn, LoginOut, PasswordChange, UserOut
from ..views import user_out

router = APIRouter(prefix="/auth", tags=["auth"])
ADMIN_CODE = os.getenv("ADMIN_SCHOOL_CODE", "ADMIN").upper()
FAILS_PER_IP = 30


_DUMMY_HASH = hash_password("not-a-real-password")
WRONG = "Wrong school code, login ID or password"


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    """One generic failure message and similar timing whether the school, the account or the password is wrong.

    Guessing is limited three ways: per network address (all accounts), per address for one account, and — at a much higher
    count — for the account from anywhere. A stranger's wrong guesses therefore can't easily lock the real owner out."""
    ip = ratelimit.client_ip(request)
    ip_key = f"login-fail:{ip}"
    if ratelimit.over(ip_key, FAILS_PER_IP, 300):
        raise HTTPException(429, "Too many wrong sign-in attempts from this network. Please wait a few minutes.")
    code = body.school_code.strip().upper()
    lid = body.login_id.strip()
    school = None
    if code == ADMIN_CODE:
        user = db.scalar(select(User).where(User.school_id.is_(None), User.role == Role.admin,
                                            func.lower(User.login_id) == lid.lower()))
    else:
        school = db.scalar(select(School).where(func.upper(School.code) == code))
        user = db.scalar(select(User).where(User.school_id == school.id, func.lower(User.login_id) == lid.lower())) if school else None
    if user and not user.active:
        user = None
    who = f"login-user:{user.id}:" if user else f"login-name:{code}/{lid.lower()}"[:120] + ":"
    pair_key, acct_key = who + ip, who + "*"
    window = LOCK_MINUTES * 60
    if ratelimit.over(pair_key, MAX_FAILED, window) or ratelimit.over(acct_key, ACCOUNT_MAX_FAILED, window):
        raise HTTPException(429, f"Too many wrong attempts. Try again in {LOCK_MINUTES} minutes or ask for a password reset.")
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH) and user is not None
    if not ok:
        for key, limit, per in ((ip_key, FAILS_PER_IP, 300), (pair_key, MAX_FAILED, window), (acct_key, ACCOUNT_MAX_FAILED, window)):
            ratelimit.hit(key, limit, per)
        raise HTTPException(401, WRONG)
    if school and school.suspended:
        raise HTTPException(403, "This school's account is suspended. Please contact support.")
    web = body.client == "web"
    if web and user.role.value not in WEB_ROLES:
        raise HTTPException(403, "The web portal is for Admin and Principal accounts. Please use the Prangan app.")
    user.failed_logins = 0
    user.locked_until = None
    db.commit()
    return LoginOut(token=make_token(user, web=web), user=user_out(db, user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(db, user)


@router.post("/password")
def change_password(body: PasswordChange, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Changing the password ends every other session of this user. The reply carries a fresh token for THIS session."""
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "Current password is wrong")
    minimum = STAFF_MIN_PASSWORD if user.role not in (Role.student, Role.parent) else 6
    check_password_rules(body.new_password, user.login_id, minimum)
    if body.new_password == body.old_password:
        raise HTTPException(400, "Choose a password different from the temporary one")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.execute(delete(PushToken).where(PushToken.user_id == user.id))     # phones re-register when they next open the app
    ratelimit.forget_user(user.id)
    audit(db, user, "password.changed")
    db.commit()
    out = user_out(db, user).model_dump(mode="json")
    out["token"] = make_token(user, web=bool(getattr(request.state, "web", False)))
    return out


@router.post("/consent", response_model=UserOut)
def give_consent(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Parent accepts the privacy notice (DPDP verifiable parental consent)."""
    if not user.consent_at:
        user.consent_at = utcnow()
        audit(db, user, "privacy.consent")
        db.commit()
    return user_out(db, user)
