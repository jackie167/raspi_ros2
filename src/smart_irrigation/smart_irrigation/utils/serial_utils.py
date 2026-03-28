try:
    import serial
except ImportError:
    serial = None


class SerialClient:
    def __init__(self, port, baudrate, logger):
        self.port = port
        self.baudrate = baudrate
        self.logger = logger
        self.ser = None

        if serial is None:
            self.logger.error('pyserial missing. Install: sudo apt install -y python3-serial')
            return

        try:
            self.ser = serial.Serial(port=self.port, baudrate=self.baudrate, timeout=0.05)
            self.logger.info(f'Serial connected {self.port} @ {self.baudrate}')
        except Exception as exc:
            self.logger.warning(f'Cannot open serial {self.port}: {exc}')

    def write_line(self, line):
        if self.ser is None:
            return
        try:
            self.ser.write((line + '\n').encode('utf-8'))
        except Exception as exc:
            self.logger.warning(f'Serial write failed: {exc}')

    def read_line(self):
        if self.ser is None:
            return None
        try:
            data = self.ser.readline()
            if not data:
                return None
            return data.decode('utf-8', errors='ignore').strip()
        except Exception as exc:
            self.logger.warning(f'Serial read failed: {exc}')
            return None

    def close(self):
        if self.ser is not None:
            try:
                self.ser.close()
            except Exception:
                pass
