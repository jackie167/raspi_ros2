from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='hand_ros2_bot',
            executable='hand_input_node',
            output='screen'
        ),
        Node(
            package='hand_ros2_bot',
            executable='decision_node',
            output='screen'
        ),
        Node(
            package='hand_ros2_bot',
            executable='motor_node',
            output='screen'
        ),
    ])