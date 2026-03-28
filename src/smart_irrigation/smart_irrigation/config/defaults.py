DEFAULT_CONFIG = {
    'min_moisture': 40.0,
    'max_moisture': 65.0,
    'mqtt': {
        'cmd_pump_topic': 'smart_irrigation/cmd/pump',
        'sensor_topic': 'smart_irrigation/data/sensor',
        'pump_state_topic': 'smart_irrigation/data/pump_state',
    },
    'serial': {
        'port': '/dev/ttyUSB0',
        'baudrate': 115200,
    },
}
