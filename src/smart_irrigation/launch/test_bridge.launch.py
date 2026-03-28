from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    use_mqtt = LaunchConfiguration('use_mqtt')
    mqtt_broker_host = LaunchConfiguration('mqtt_broker_host')

    return LaunchDescription([
        DeclareLaunchArgument('use_mqtt', default_value='true'),
        DeclareLaunchArgument('mqtt_broker_host', default_value='127.0.0.1'),
        Node(package='smart_irrigation', executable='sensor_node', output='screen'),
        Node(package='smart_irrigation', executable='decision_node', output='screen'),
        Node(package='smart_irrigation', executable='pump_control_node', output='screen'),
        Node(
            package='smart_irrigation',
            executable='mqtt_bridge_node',
            output='screen',
            condition=IfCondition(use_mqtt),
            parameters=[{'broker_host': mqtt_broker_host}],
        ),
    ])
