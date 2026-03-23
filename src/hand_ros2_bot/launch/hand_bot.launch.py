from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.conditions import IfCondition, UnlessCondition
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    use_keyboard = LaunchConfiguration('use_keyboard')

    return LaunchDescription([
        DeclareLaunchArgument(
            'use_keyboard',
            default_value='true',
            description='Use keyboard node when true; use hand_input_node when false'
        ),
        Node(
            package='hand_ros2_bot',
            executable='keyboard',
            output='screen',
            condition=IfCondition(use_keyboard)
        ),
        Node(
            package='hand_ros2_bot',
            executable='hand_input_node',
            output='screen',
            condition=UnlessCondition(use_keyboard)
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
