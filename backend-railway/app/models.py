from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SensorReading(Base):
    __tablename__ = 'sensor_readings'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[str] = mapped_column(String(64), default='unknown')
    soil_moisture: Mapped[float] = mapped_column(Float)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_type: Mapped[str] = mapped_column(String(32), default='sensor_data')
    raw_payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class PumpStateEvent(Base):
    __tablename__ = 'pump_state_events'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ack_state: Mapped[str] = mapped_column(String(16), index=True)
    matched: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
