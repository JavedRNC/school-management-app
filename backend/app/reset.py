"""A one-time fresh start for the DEV and TEST (QA) databases.

When the code carries a new DATA_RESET id and the server runs as DEV or TEST, the next start removes every school and
everything in them (people, attendance, marks, fees, payroll, notices, registrations, audit log …), once. The demo
schools are then seeded again from scratch. What stays: the platform admin account(s) and their password, the plans
and the app-version settings. PRODUCTION never resets: APP_ENV must be exactly "dev" or "test".

To reset DEV and TEST again later, change DATA_RESET and deploy.
"""
import logging
import os

from sqlalchemy import delete, update
from sqlalchemy.schema import sort_tables

from .db import Base, SessionLocal

DATA_RESET = "2026-11-25"           # change this to wipe DEV and TEST once more on their next start
KEEP = {"plans", "meta", "app_version"}
log = logging.getLogger("reset")


def reset_if_asked() -> bool:
    env = os.getenv("APP_ENV", "prod")
    if env not in ("dev", "test"):
        return False
    from .models import Meta, Role, SchoolClass, User

    with SessionLocal() as db:
        row = db.get(Meta, "data_reset")
        if row and row.value == DATA_RESET:
            return False
        log.warning("Fresh start %s on %s: removing every school and its data (admin and plans stay)", DATA_RESET, env)
        db.execute(update(SchoolClass).values(class_teacher_id=None))      # classes ↔ users point at each other
        db.execute(update(User).values(class_id=None))
        # dependants first; the one link from users back to classes is cleared above, so it is left out of the order
        order = sort_tables(Base.metadata.tables.values(), skip_fn=lambda fk: fk.parent.table.name == "users" and fk.column.table.name == "classes")
        for table in reversed(order):
            if table.name in KEEP:
                continue
            if table.name == "users":
                db.execute(delete(User).where(User.role != Role.admin))
            else:
                db.execute(table.delete())
        if row:
            row.value = DATA_RESET
        else:
            db.add(Meta(key="data_reset", value=DATA_RESET))
        db.commit()
    return True
