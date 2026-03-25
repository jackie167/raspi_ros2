import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

try:
    import RPi.GPIO as GPIO
except ImportError:
    GPIO = None


class MotorNode(Node):
    def __init__(self):
        super().__init__('motor_node')

        # BCM GPIO numbering (as requested by user):
        # IN1 -> GPIO23, IN2 -> GPIO24
        self.in1_pin = 23
        self.in2_pin = 24
        self.gpio_ready = False

        self.sub = self.create_subscription(
            Twist,
            'cmd_vel',
            self.callback,
            10
        )

        self._init_gpio()
        self.get_logger().info('Motor node started')

    def _init_gpio(self):
        if GPIO is None:
            self.get_logger().warning(
                'RPi.GPIO not found. Running in log-only mode (no real motor control).'
            )
            return

        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.in1_pin, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(self.in2_pin, GPIO.OUT, initial=GPIO.LOW)
        self.gpio_ready = True
        self.get_logger().info(
            f'GPIO ready (BCM mode). IN1={self.in1_pin}, IN2={self.in2_pin}'
        )

    def _set_motor(self, in1, in2, label):
        if self.gpio_ready:
            GPIO.output(self.in1_pin, GPIO.HIGH if in1 else GPIO.LOW)
            GPIO.output(self.in2_pin, GPIO.HIGH if in2 else GPIO.LOW)

        self.get_logger().info(
            f'Motor {label} -> IN1:{1 if in1 else 0} IN2:{1 if in2 else 0}'
        )

    def callback(self, msg):
        lin = msg.linear.x
        ang = msg.angular.z

        # Priority: rotation command first, then linear, then stop
        if ang > 0.1:
            self._set_motor(True, False, 'LEFT')
        elif ang < -0.1:
            self._set_motor(False, True, 'RIGHT')
        elif lin > 0.1:
            self._set_motor(True, False, 'FORWARD')
        elif lin < -0.1:
            self._set_motor(False, True, 'BACKWARD')
        else:
            self._set_motor(False, False, 'STOP')

    def destroy_node(self):
        if self.gpio_ready:
            GPIO.output(self.in1_pin, GPIO.LOW)
            GPIO.output(self.in2_pin, GPIO.LOW)
            GPIO.cleanup([self.in1_pin, self.in2_pin])
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = MotorNode()
    rclpy.spin(node)

    node.destroy_node()
    rclpy.shutdown()
