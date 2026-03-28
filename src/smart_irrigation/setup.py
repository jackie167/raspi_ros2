from setuptools import setup
import os
from glob import glob

package_name = 'smart_irrigation'

setup(
    name=package_name,
    version='0.1.0',
    packages=[
        package_name,
        f'{package_name}.utils',
        f'{package_name}.config',
    ],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='root',
    maintainer_email='root@todo.todo',
    description='Smart irrigation management package with ESP32 serial and MQTT bridge.',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'config_node = smart_irrigation.config_node:main',
            'mqtt_bridge_node = smart_irrigation.mqtt_bridge_node:main',
            'sensor_node = smart_irrigation.sensor_node:main',
            'pump_control_node = smart_irrigation.pump_control_node:main',
            'decision_node = smart_irrigation.decision_node:main',
            'serial_bridge_node = smart_irrigation.serial_bridge_node:main',
        ],
    },
)
