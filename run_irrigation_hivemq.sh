#!/usr/bin/env bash
set -eo pipefail

if [ -z "${MQTT_USERNAME:-}" ] || [ -z "${MQTT_PASSWORD:-}" ]; then
  echo "[ERROR] Please set MQTT_USERNAME and MQTT_PASSWORD for HiveMQ Cloud."
  echo "Example: MQTT_USERNAME=xxx MQTT_PASSWORD=yyy ./run_irrigation_hivemq.sh"
  exit 1
fi

BROKER_HOST="${1:-YOUR_HIVEMQ_CLUSTER.s1.eu.hivemq.cloud}"
TOPIC_PREFIX="${2:-smart_irrigation/dinhthi}"

MQTT_PORT=8883 MQTT_USE_TLS=true USE_SERIAL=false USE_MQTT=true \
MQTT_USERNAME="$MQTT_USERNAME" MQTT_PASSWORD="$MQTT_PASSWORD" \
  "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run_irrigation.sh" "$BROKER_HOST" "$TOPIC_PREFIX"
