#!/usr/bin/env bash
set -eo pipefail

WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BROKER_HOST="${1:-test.mosquitto.org}"
TOPIC_PREFIX="${2:-smart_irrigation/dinhthi}"
USE_SERIAL="${USE_SERIAL:-false}"
SERIAL_PORT="${SERIAL_PORT:-/dev/ttyUSB0}"
USE_MQTT="${USE_MQTT:-true}"
MQTT_PORT="${MQTT_PORT:-1883}"
MQTT_USERNAME="${MQTT_USERNAME:-}"
MQTT_PASSWORD="${MQTT_PASSWORD:-}"
MQTT_USE_TLS="${MQTT_USE_TLS:-false}"

# ROS setup scripts may reference variables that are not always pre-defined.
set +u
source /opt/ros/humble/setup.bash
source "$WS_DIR/install/setup.bash"
set -u

exec ros2 launch smart_irrigation irrigation_system.launch.py \
  use_serial:="$USE_SERIAL" \
  serial_port:="$SERIAL_PORT" \
  use_mqtt:="$USE_MQTT" \
  mqtt_broker_host:="$BROKER_HOST" \
  mqtt_broker_port:="$MQTT_PORT" \
  mqtt_broker_username:="$MQTT_USERNAME" \
  mqtt_broker_password:="$MQTT_PASSWORD" \
  mqtt_broker_use_tls:="$MQTT_USE_TLS" \
  topic_prefix:="$TOPIC_PREFIX"
