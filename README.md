# Smart Irrigation ROS2 Workspace

## Build
```bash
cd /ros2_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select smart_irrigation
source install/setup.bash
```

## Run ROS2 (Generic MQTT)
```bash
./run_irrigation.sh <broker_host> <topic_prefix>
```

## Run ROS2 (HiveMQ Cloud)
Use MQTT over TLS (`8883`) with account credentials:
```bash
cd /ros2_ws
MQTT_USERNAME=<hivemq_user> MQTT_PASSWORD=<hivemq_pass> ./run_irrigation_hivemq.sh <hivemq_cluster_host> smart_irrigation/dinhthi
```

Example host format:
- `xxxxxxxxxxxx.s1.eu.hivemq.cloud`

## ESP32 MQTT Topics
Prefix example: `smart_irrigation/dinhthi`
- publish sensor: `<prefix>/data/sensor`
- publish config test: `<prefix>/data/config_test`
- subscribe pump command: `<prefix>/cmd/pump`
- optional publish pump state: `<prefix>/data/pump_state`

## Vercel Web Dashboard
Folder for deployment: `vercel-dashboard/`

### Deploy steps
1. Push repo to GitHub.
2. In Vercel, import this repo.
3. Set **Root Directory** to `vercel-dashboard`.
4. Deploy.

### Web dashboard usage
Open deployed URL and fill:
- WSS URL: `wss://<hivemq_cluster_host>:8884/mqtt`
- Username/Password: HiveMQ credentials
- Topic Prefix: e.g. `smart_irrigation/dinhthi`

Then click **Connect** and you can monitor sensor + send `ON/OFF` pump command.

## Optional Local Node-RED Dashboard
```bash
docker-compose -f docker-compose.nodered.yml up -d --build
```
- Editor: `http://<machine-ip>:1880`
- Dashboard: `http://<machine-ip>:1880/ui`
