from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from sqlalchemy import func, select, text

from app.config import settings
from app.db import SessionLocal, init_db
from app.models import PumpStateEvent, SensorReading
from app.mqtt_worker import MqttIngestWorker


worker = MqttIngestWorker()


def require_db():
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail='DB not configured')


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.database_url:
        raise RuntimeError('DATABASE_URL is required')

    init_db()
    worker.start()
    try:
        yield
    finally:
        worker.stop()


app = FastAPI(title='Smart Irrigation Backend', version='1.0.0', lifespan=lifespan)


@app.get('/health')
def health():
    require_db()
    db = SessionLocal()
    try:
        db.execute(text('SELECT 1'))
    finally:
        db.close()

    return {'ok': True}


@app.get('/api/latest')
def latest():
    require_db()
    db = SessionLocal()
    try:
        sensor = db.execute(
            select(SensorReading).order_by(SensorReading.created_at.desc()).limit(1)
        ).scalar_one_or_none()
        pump = db.execute(
            select(PumpStateEvent).order_by(PumpStateEvent.created_at.desc()).limit(1)
        ).scalar_one_or_none()
    finally:
        db.close()

    return {
        'sensor': None
        if sensor is None
        else {
            'device_id': sensor.device_id,
            'soil_moisture': sensor.soil_moisture,
            'temperature': sensor.temperature,
            'humidity': sensor.humidity,
            'created_at': sensor.created_at.isoformat(),
        },
        'pump': None
        if pump is None
        else {
            'ack_state': pump.ack_state,
            'matched': pump.matched,
            'created_at': pump.created_at.isoformat(),
        },
    }


@app.get('/api/history/hourly')
def hourly(hours: int = Query(default=24, ge=1, le=168)):
    require_db()
    since = func.now() - text(f"INTERVAL '{int(hours)} hours'")

    db = SessionLocal()
    try:
        stmt = (
            select(
                func.date_trunc('hour', SensorReading.created_at).label('bucket'),
                func.avg(SensorReading.soil_moisture).label('avg_soil_moisture'),
                func.count(SensorReading.id).label('count'),
            )
            .where(SensorReading.created_at >= since)
            .group_by(func.date_trunc('hour', SensorReading.created_at))
            .order_by(func.date_trunc('hour', SensorReading.created_at).asc())
        )
        rows = db.execute(stmt).all()
    finally:
        db.close()

    return {
        'hours': hours,
        'items': [
            {
                'bucket': row.bucket.isoformat(),
                'avg_soil_moisture': float(row.avg_soil_moisture),
                'count': int(row.count),
            }
            for row in rows
        ],
    }


@app.get('/api/pump/acks')
def pump_acks(limit: int = Query(default=20, ge=1, le=200)):
    require_db()
    db = SessionLocal()
    try:
        rows = db.execute(
            select(PumpStateEvent)
            .order_by(PumpStateEvent.created_at.desc())
            .limit(limit)
        ).scalars().all()
    finally:
        db.close()

    return {
        'items': [
            {
                'ack_state': row.ack_state,
                'matched': row.matched,
                'created_at': row.created_at.isoformat(),
                'raw_payload': row.raw_payload,
            }
            for row in rows
        ]
    }
