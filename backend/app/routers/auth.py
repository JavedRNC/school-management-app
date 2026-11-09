import os
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import (LOCK_MINUTES, MAX_FAILED, audit, check_password_rules, current_user, hash_password, make_token,
                    verify_password)
from ..db import get_db
from ..models import Role, School, User, utcnow
from ..schemas import LoginIn, LoginOut, PasswordChange, UserOut
from ..views import user_out

router = APIRouter(prefix="/auth", tags=["auth"])
ADMIN_CODE = os.getenv("ADMIN_SCHOOL_CODE", "ADMIN").upper()


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    code = body.school_code.strip().upper()
    lid = body.login_id.strip()
    if code == ADMIN_CODE:
        user = db.scalar(select(User).where(User.school_id.is_(None), User.role == Role.admin,
                                            func.lower(User.login_id) == lid.lower()))
    else:
        school = db.scalar(select(School).where(func.upper(School.code) == code))
        if not school:
            raise HTTPException(401, "School code not found")
        if school.suspended:
            raise HTTPException(403, "This school's account is suspended. Please contact support.")
        user = db.scalar(select(User).where(User.school_id == school.id, func.lower(User.login_id) == lid.lower()))
    if not user or not user.active:
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
        raise HTTPException(401, "Wrong login ID or password")
    user.failed_logins = 0
    user.locked_until = None
    db.commit()
    return LoginOut(token=make_token(user), user=user_out(db, user))


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
