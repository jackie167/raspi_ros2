# Smart Irrigation ROS2 Workspace

## Structure
- `src/smart_irrigation`: ROS2 Python package for irrigation control.
- `build`, `install`, `log`: colcon generated directories.

## Main Features
- Soil sensor ingestion (simulated and ESP32 serial bridge)
- Decision logic for pump ON/OFF
- Pump control state publishing
- MQTT bridge for local/remote integration

## Build
```bash
cd /ros2_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select smart_irrigation
source install/setup.bash
```

## Run Full System
```bash
ros2 launch smart_irrigation irrigation_system.launch.py
```

## Run Test Bridge (Local)
```bash
ros2 launch smart_irrigation test_bridge.launch.py
```
