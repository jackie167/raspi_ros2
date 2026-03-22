import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

class MotorNode(Node):
    def __init__(self):
        super().__init__('motor_node')

        self.sub = self.create_subscription(
            Twist,
            'cmd_vel',
            self.callback,
            10
        )

        self.get_logger().info('Motor node started')

    def callback(self, msg):
        self.get_logger().info(
            f'Motor command -> linear: {msg.linear.x}, angular: {msg.angular.z}'
        )


def main(args=None):
    rclpy.init(args=args)
    node = MotorNode()
    rclpy.spin(node)

    node.destroy_node()
    rclpy.shutdown()