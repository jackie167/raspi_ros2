from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text

from app.config import settings
from app.db import SessionLocal, init_db
from app.models import PumpCommandEvent, PumpStateEvent, SensorReading
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


app = FastAPI(title='Smart Irrigation Backend', version='1.1.0', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)


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
        cmd = db.execute(
            select(PumpCommandEvent).order_by(PumpCommandEvent.created_at.desc()).limit(1)
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
        'command': None
        if cmd is None
        else {
            'command': cmd.command,
            'ack_state': cmd.ack_state,
            'matched': cmd.matched,
            'created_at': cmd.created_at.isoformat(),
            'ack_at': cmd.ack_at.isoformat() if cmd.ack_at else None,
        },
    }


@app.get('/api/history/hourly')
def hourly(hours: int = Query(default=24, ge=1, le=168)):
    require_db()
    since = datetime.now(timezone.utc) - timedelta(hours=int(hours))

    db = SessionLocal()
    try:
        rows = db.execute(
            select(SensorReading.created_at, SensorReading.soil_moisture)
            .where(SensorReading.created_at >= since)
            .order_by(SensorReading.created_at.asc())
        ).all()
    finally:
        db.close()

    buckets = {}
    for created_at, moisture in rows:
        if created_at is None or moisture is None:
            continue
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        hour_bucket = created_at.replace(minute=0, second=0, microsecond=0)
        item = buckets.get(hour_bucket)
        if item is None:
            buckets[hour_bucket] = {
                'sum': float(moisture),
                'count': 1,
            }
        else:
            item['sum'] += float(moisture)
            item['count'] += 1

    items = []
    for bucket in sorted(buckets.keys()):
        agg = buckets[bucket]
        items.append(
            {
                'bucket': bucket.isoformat(),
                'avg_soil_moisture': agg['sum'] / agg['count'],
                'count': agg['count'],
            }
        )

    return {
        'hours': hours,
        'items': items,
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


@app.get('/api/pump/commands')
def pump_commands(limit: int = Query(default=20, ge=1, le=200)):
    require_db()
    db = SessionLocal()
    try:
        rows = db.execute(
            select(PumpCommandEvent)
            .order_by(PumpCommandEvent.created_at.desc())
            .limit(limit)
        ).scalars().all()
    finally:
        db.close()

    return {
        'items': [
            {
                'command': row.command,
                'ack_state': row.ack_state,
                'matched': row.matched,
                'created_at': row.created_at.isoformat(),
                'ack_at': row.ack_at.isoformat() if row.ack_at else None,
                'raw_payload': row.raw_payload,
            }
            for row in rows
        ]
    }
