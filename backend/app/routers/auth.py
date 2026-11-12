import os
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import ratelimit
from ..auth import (LOCK_MINUTES, MAX_FAILED, WEB_ROLES, audit, check_password_rules, current_user, hash_password, make_token,
                    verify_password)
from ..db import get_db
from ..models import Role, School, User, utcnow
from ..schemas import LoginIn, LoginOut, PasswordChange, UserOut
from ..views import user_out

router = APIRouter(prefix="/auth", tags=["auth"])
ADMIN_CODE = os.getenv("ADMIN_SCHOOL_CODE", "ADMIN").upper()
FAILS_PER_IP = 30


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    # Per-address limit on FAILED sign-ins, on top of the per-account lockout below (password guessing across many
    # accounts). Successful sign-ins are not counted, so a whole staff room on one Wi-Fi is never locked out.
    ip_key = f"login-fail:{ratelimit.client_ip(request)}"
    if ratelimit.over(ip_key, FAILS_PER_IP, 300):
        raise HTTPException(429, "Too many wrong sign-in attempts from this network. Please wait a few minutes.")
    code = body.school_code.strip().upper()
    lid = body.login_id.strip()
    if code == ADMIN_CODE:
        user = db.scalar(select(User).where(User.school_id.is_(None), User.role == Role.admin,
                                            func.lower(User.login_id) == lid.lower()))
    else:
        school = db.scalar(select(School).where(func.upper(School.code) == code))
        if not school:
            ratelimit.hit(ip_key, FAILS_PER_IP, 300)
            raise HTTPException(401, "School code not found")
        if school.suspended:
            raise HTTPException(403, "This school's account is suspended. Please contact support.")
        user = db.scalar(select(User).where(User.school_id == school.id, func.lower(User.login_id) == lid.lower()))
    if not user or not user.active:
        ratelimit.hit(ip_key, FAILS_PER_IP, 300)
        raise HTTPException(401, "Wrong login ID or password")
    now = utcnow()
    if user.locked_until and user.locked_until > now:
        mins = int((user.locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(429, f"Too many wrong attempts. Try again in {mins} min or ask your principal to reset it.")
    if not verify_password(body.password, user.password_hash):
        user.failed_logins = (user.failed_logins or 0) + 1
        if user.failed_logins >= MAX_FAILED:
            user.locked_until = now + timedelta(minutes=LOCK_MINUTES)
            user.failed_logins = 0
        db.commit()
        ratelimit.hit(ip_key, FAILS_PER_IP, 300)
        raise HTTPException(401, "Wrong login ID or password")
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


@router.post("/password", response_model=UserOut)
def change_password(body: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "Current password is wrong")
    check_password_rules(body.new_password, user.login_id)
    if body.new_password == body.old_password:
        raise HTTPException(400, "Choose a password different from the temporary one")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    audit(db, user, "password.changed")
    db.commit()
    return user_out(db, user)


@router.post("/consent", response_model=UserOut)
def give_consent(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Parent accepts the privacy notice (DPDP verifiable parental consent)."""
    if not user.consent_at:
        user.consent_at = utcnow()
        audit(db, user, "privacy.consent")
        db.commit()
    return user_out(db, user)
