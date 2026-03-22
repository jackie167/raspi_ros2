from setuptools import setup
import os
from glob import glob

package_name = 'hand_ros2_bot'

setup(
    name=package_name,
    version='0.0.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='root',
    maintainer_email='root@todo.todo',
    description='Simple ROS2 hand command demo',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
    'console_scripts': [
        'hand_input_node = hand_ros2_bot.hand_input_node:main',
        'decision_node = hand_ros2_bot.decision_node:main',
        'motor_node = hand_ros2_bot.motor_node:main',
        'keyboard = hand_ros2_bot.keyboard_node:main',
    ],
},
)
