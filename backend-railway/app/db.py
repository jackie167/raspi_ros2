from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


Base = declarative_base()


def normalize_database_url(url: str) -> str:
    raw = (url or '').strip()
    if raw.startswith('postgresql://'):
        return raw.replace('postgresql://', 'postgresql+psycopg://', 1)
    return raw


DATABASE_URL = normalize_database_url(settings.database_url)

if DATABASE_URL:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
else:
    engine = None
    SessionLocal = None


def init_db() -> None:
    if engine is None:
        return
    Base.metadata.create_all(bind=engine)
