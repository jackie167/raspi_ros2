#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="hand_test"
WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROS_SETUP="/opt/ros/${ROS_DISTRO:-humble}/setup.bash"
LOCAL_SETUP="$WS_DIR/install/setup.bash"

if ! command -v tmux >/dev/null 2>&1; then
  echo "[ERROR] tmux is not installed. Install with: sudo apt install -y tmux"
  exit 1
fi

if [ ! -f "$ROS_SETUP" ]; then
  echo "[ERROR] ROS setup file not found: $ROS_SETUP"
  exit 1
fi

if [ ! -f "$LOCAL_SETUP" ]; then
  echo "[ERROR] Local setup not found: $LOCAL_SETUP"
  echo "Build first: colcon build --packages-select hand_ros2_bot"
  exit 1
fi

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  tmux kill-session -t "$SESSION_NAME"
fi

CMD_PREFIX="cd '$WS_DIR' && source '$ROS_SETUP' && source '$LOCAL_SETUP'"

# Pane 0: decision_node
tmux new-session -d -s "$SESSION_NAME" "bash -lc \"$CMD_PREFIX && ros2 run hand_ros2_bot decision_node\""

# Pane 1: motor_node
tmux split-window -h -t "$SESSION_NAME":0 "bash -lc \"$CMD_PREFIX && ros2 run hand_ros2_bot motor_node\""

# Pane 2: keyboard (interactive)
tmux split-window -v -t "$SESSION_NAME":0.1 "bash -lc \"$CMD_PREFIX && ros2 run hand_ros2_bot keyboard\""

tmux select-layout -t "$SESSION_NAME":0 tiled
tmux select-pane -t "$SESSION_NAME":0.2

echo "[INFO] Attached to tmux session: $SESSION_NAME"
echo "[INFO] Use Ctrl+b then d to detach."
echo "[INFO] To stop all: tmux kill-session -t $SESSION_NAME"

tmux attach -t "$SESSION_NAME"
