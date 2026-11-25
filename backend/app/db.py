import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./school.db")
# Render/Heroku style URLs
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

IS_SQLITE = DATABASE_URL.startswith("sqlite")
# 20 connections: main.RequestGate lets 8 requests in at a time (a request may use two: its own and a push sender's),
# and push and start-up work use their own. A connection is never waited for longer than 10 s.
if IS_SQLITE:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, pool_size=10, max_overflow=10, pool_timeout=10)
else:
    # Neon/Render Postgres: idle servers suspend and drop connections, so
    # test each pooled connection before use and recycle them regularly.
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300, pool_size=10, max_overflow=10, pool_timeout=10)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
