#!/usr/bin/env bash
set -euo pipefail

WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BROKER_HOST="${1:-127.0.0.1}"
USE_SERIAL="${USE_SERIAL:-false}"
SERIAL_PORT="${SERIAL_PORT:-/dev/ttyUSB0}"
USE_MQTT="${USE_MQTT:-true}"

source /opt/ros/humble/setup.bash
source "$WS_DIR/install/setup.bash"

exec ros2 launch smart_irrigation irrigation_system.launch.py \
  use_serial:="$USE_SERIAL" \
  serial_port:="$SERIAL_PORT" \
  use_mqtt:="$USE_MQTT" \
  mqtt_broker_host:="$BROKER_HOST"
