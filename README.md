# Smart Irrigation ROS2 Workspace

## Structure
- `src/smart_irrigation`: ROS2 Python package for irrigation control.
- `build`, `install`, `log`: colcon generated directories.
- `nodered`: Node-RED web dashboard files.

## Main Features
- Soil sensor ingestion (simulated and ESP32 serial bridge)
- Decision logic for pump ON/OFF
- Pump control state publishing
- MQTT bridge for local/remote integration
- Optional Node-RED web dashboard for remote monitoring/control

## Build
```bash
cd /ros2_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select smart_irrigation
source install/setup.bash
```

## Run Irrigation System
Default uses public broker and namespaced topics:
- Broker: `test.mosquitto.org:1883`
- Prefix: `smart_irrigation/dinhthi`

```bash
cd /ros2_ws
./run_irrigation.sh
```

Custom broker/prefix:
```bash
./run_irrigation.sh <broker_host> <topic_prefix>
```

## Run Node-RED Web Dashboard
```bash
cd /ros2_ws
docker compose -f docker-compose.nodered.yml up -d --build
```

Open dashboard:
- Editor: `http://<machine-ip>:1880`
- Dashboard UI: `http://<machine-ip>:1880/ui`

Default flow topics:
- Sensor in: `smart_irrigation/dinhthi/data/sensor`
- Config test in: `smart_irrigation/dinhthi/data/config_test`
- Pump state in: `smart_irrigation/dinhthi/data/pump_state`
- Pump command out: `smart_irrigation/dinhthi/cmd/pump`

Stop dashboard:
```bash
docker compose -f docker-compose.nodered.yml down
```
