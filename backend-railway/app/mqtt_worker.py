import json
import logging

import paho.mqtt.client as mqtt

from app.config import settings
from app.db import SessionLocal
from app.models import PumpStateEvent, SensorReading


LOGGER = logging.getLogger('mqtt_worker')


class MqttIngestWorker:
    def __init__(self) -> None:
        self.client = None

    def start(self) -> None:
        if SessionLocal is None:
            LOGGER.warning('DATABASE_URL missing, skip MQTT ingest worker')
            return

        if not settings.mqtt_host:
            LOGGER.warning('MQTT_HOST missing, skip MQTT ingest worker')
            return

        try:
            self.client = mqtt.Client()
            self.client.on_connect = self.on_connect
            self.client.on_message = self.on_message

            if settings.mqtt_username:
                self.client.username_pw_set(settings.mqtt_username, settings.mqtt_password)

            if settings.mqtt_use_tls:
                self.client.tls_set()

            self.client.connect(settings.mqtt_host, settings.mqtt_port, keepalive=60)
            self.client.loop_start()
            LOGGER.info('MQTT ingest worker started')
        except Exception as exc:
            LOGGER.exception('MQTT worker start failed: %s', exc)
            self.client = None

    def stop(self) -> None:
        if self.client is None:
            return
        self.client.loop_stop()
        self.client.disconnect()
        self.client = None

    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        LOGGER.info('MQTT connected rc=%s', reason_code)
        client.subscribe(settings.mqtt_sensor_topic)
        client.subscribe(settings.mqtt_pump_state_topic)

    def on_message(self, client, userdata, msg):
        payload_str = msg.payload.decode('utf-8', errors='ignore').strip()
        if not payload_str:
            return

        if msg.topic == settings.mqtt_sensor_topic:
            self.handle_sensor(payload_str)
            return

        if msg.topic == settings.mqtt_pump_state_topic:
            self.handle_pump_state(payload_str)
            return

    def handle_sensor(self, payload_str: str) -> None:
        try:
            data = json.loads(payload_str)
        except json.JSONDecodeError:
            LOGGER.warning('Invalid sensor JSON: %s', payload_str)
            return

        try:
            moisture = float(data.get('soil_moisture'))
        except (TypeError, ValueError):
            LOGGER.warning('Sensor missing soil_moisture: %s', payload_str)
            return

        def to_float(value):
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        session = SessionLocal()
        try:
            row = SensorReading(
                device_id=str(data.get('device_id', 'unknown')),
                soil_moisture=moisture,
                temperature=to_float(data.get('temperature')),
                humidity=to_float(data.get('humidity')),
                source_type=str(data.get('type', 'sensor_data')),
                raw_payload=data,
            )
            session.add(row)
            session.commit()
        finally:
            session.close()

    def handle_pump_state(self, payload_str: str) -> None:
        state = payload_str.upper()
        data = {'raw': payload_str}

        if state not in {'ON', 'OFF'}:
            try:
                parsed = json.loads(payload_str)
                state = str(parsed.get('state', parsed.get('value', payload_str))).upper()
                data = parsed if isinstance(parsed, dict) else {'raw': payload_str}
            except json.JSONDecodeError:
                state = payload_str.upper()

        matched = None
        if state in {'ON', 'OFF'}:
            matched = True

        session = SessionLocal()
        try:
            row = PumpStateEvent(
                ack_state=state,
                matched=matched,
                raw_payload=data,
            )
            session.add(row)
            session.commit()
        finally:
            session.close()
