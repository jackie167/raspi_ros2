#!/usr/bin/env bash
set -eo pipefail

WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BROKER_HOST="${1:-test.mosquitto.org}"
TOPIC_PREFIX="${2:-smart_irrigation/dinhthi}"
USE_SERIAL="${USE_SERIAL:-false}"
SERIAL_PORT="${SERIAL_PORT:-/dev/ttyUSB0}"
USE_MQTT="${USE_MQTT:-true}"

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
  topic_prefix:="$TOPIC_PREFIX"
