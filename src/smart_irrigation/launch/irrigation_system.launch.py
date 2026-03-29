from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    use_mqtt = LaunchConfiguration('use_mqtt')
    use_serial = LaunchConfiguration('use_serial')
    mqtt_broker_host = LaunchConfiguration('mqtt_broker_host')
    mqtt_broker_port = LaunchConfiguration('mqtt_broker_port')
    mqtt_broker_username = LaunchConfiguration('mqtt_broker_username')
    mqtt_broker_password = LaunchConfiguration('mqtt_broker_password')
    mqtt_broker_use_tls = LaunchConfiguration('mqtt_broker_use_tls')
    topic_prefix = LaunchConfiguration('topic_prefix')
    serial_port = LaunchConfiguration('serial_port')

    return LaunchDescription([
        DeclareLaunchArgument('use_mqtt', default_value='true'),
        DeclareLaunchArgument('use_serial', default_value='false'),
        DeclareLaunchArgument('mqtt_broker_host', default_value='test.mosquitto.org'),
        DeclareLaunchArgument('mqtt_broker_port', default_value='1883'),
        DeclareLaunchArgument('mqtt_broker_username', default_value=''),
        DeclareLaunchArgument('mqtt_broker_password', default_value=''),
        DeclareLaunchArgument('mqtt_broker_use_tls', default_value='false'),
        DeclareLaunchArgument('topic_prefix', default_value='smart_irrigation/dinhthi'),
        DeclareLaunchArgument('serial_port', default_value='/dev/ttyUSB0'),
        Node(package='smart_irrigation', executable='config_node', output='screen'),
        Node(package='smart_irrigation', executable='decision_node', output='screen'),
        Node(package='smart_irrigation', executable='pump_control_node', output='screen'),
        Node(
            package='smart_irrigation',
            executable='serial_bridge_node',
            output='screen',
            condition=IfCondition(use_serial),
            parameters=[{'serial_port': serial_port}],
        ),
        Node(
            package='smart_irrigation',
            executable='mqtt_bridge_node',
            output='screen',
            condition=IfCondition(use_mqtt),
            parameters=[
                {
                    'broker_host': mqtt_broker_host,
                    'broker_port': mqtt_broker_port,
                    'broker_username': mqtt_broker_username,
                    'broker_password': mqtt_broker_password,
                    'broker_use_tls': mqtt_broker_use_tls,
                    'topic_prefix': topic_prefix,
                }
            ],
        ),
    ])
