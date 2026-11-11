"""Schema versioning.

v1 = single-school demo (Nov 2026, before multi-school).
v2 = multi-school (Phase 1). v3 = Phase 2 new tables (additive). Upgrading from v1 resets the database: it only ever held demo data.
Future versions must migrate data in place (add steps below); never drop real data.
"""
import logging
import os

from sqlalchemy import MetaData, inspect, select

from .db import Base, SessionLocal, engine
from .models import Meta

SCHEMA_VERSION = 5  # v3 Phase 2, v4 fees, v5 bell schedules (all additive; create_all adds them)
log = logging.getLogger("migrate")


def _current_version() -> int:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    if not tables:
        return 0
    if "meta" not in tables:
        return 1  # legacy single-school schema
    with SessionLocal() as db:
        row = db.scalar(select(Meta).where(Meta.key == "schema_version"))
        return int(row.value) if row else 1


def migrate() -> None:
    v = _current_version()
    if v == 1:
        if os.getenv("ALLOW_SCHEMA_RESET", "1") != "1":
            raise RuntimeError("Legacy schema found and ALLOW_SCHEMA_RESET is not 1 — refusing to reset")
        log.warning("Legacy demo schema found → resetting database for multi-school (v2)")
        md = MetaData()
        md.reflect(bind=engine)
        md.drop_all(bind=engine)
        v = 0
    Base.metadata.create_all(engine)
    if v < SCHEMA_VERSION:
        with SessionLocal() as db:
            row = db.get(Meta, "schema_version")
            if row:
                row.value = str(SCHEMA_VERSION)
            else:
                db.add(Meta(key="schema_version", value=str(SCHEMA_VERSION)))
            db.commit()
