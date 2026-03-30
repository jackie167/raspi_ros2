import os


def as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv('DATABASE_URL', '')

        self.mqtt_host = os.getenv('MQTT_HOST', '')
        self.mqtt_port = int(os.getenv('MQTT_PORT', '1883'))
        self.mqtt_username = os.getenv('MQTT_USERNAME', '')
        self.mqtt_password = os.getenv('MQTT_PASSWORD', '')
        self.mqtt_use_tls = as_bool(os.getenv('MQTT_USE_TLS', 'false'))
        self.mqtt_topic_prefix = os.getenv('MQTT_TOPIC_PREFIX', 'smart_irrigation/dinhthi').strip('/')

    @property
    def mqtt_sensor_topic(self) -> str:
        return f'{self.mqtt_topic_prefix}/data/sensor'

    @property
    def mqtt_pump_state_topic(self) -> str:
        return f'{self.mqtt_topic_prefix}/data/pump_state'


settings = Settings()
