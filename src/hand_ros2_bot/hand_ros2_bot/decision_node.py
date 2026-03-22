import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from geometry_msgs.msg import Twist

class DecisionNode(Node):
    def __init__(self):
        super().__init__('decision_node')

        self.sub = self.create_subscription(
            String,
            'cmd_input',
            self.callback,
            10
        )

        self.pub = self.create_publisher(Twist, 'cmd_vel', 10)

        self.get_logger().info('Decision node started')

    def callback(self, msg):
        cmd = msg.data

        twist = Twist()

        if cmd == 'forward':
            twist.linear.x = 1.0
        elif cmd == 'backward':
            twist.linear.x = -1.0
        elif cmd == 'left':
            twist.angular.z = 1.0
        elif cmd == 'right':
            twist.angular.z = -1.0
        elif cmd == 'stop':
            twist.linear.x = 0.0
            twist.angular.z = 0.0

        self.pub.publish(twist)
        self.get_logger().info(f'Publish cmd_vel: {cmd}')


def main(args=None):
    rclpy.init(args=args)
    node = DecisionNode()
    rclpy.spin(node)

    node.destroy_node()
    rclpy.shutdown()