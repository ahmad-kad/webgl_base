import os
import signal
import psutil

def kill_process_on_port(port):
    # Check for processes running on the specified port
    for proc in psutil.process_iter(['pid', 'name', 'connections']):
        connections = proc.info.get('connections')
        if connections:
            for conn in connections:
                if conn.laddr.port == port:
                    print(f"Killing process {proc.info['name']} with PID {proc.info['pid']} on port {port}")
                    os.kill(proc.info['pid'], signal.SIGTERM)
                    return
    print(f"No process found running on port {port}")

if __name__ == "__main__":
    kill_process_on_port(8000)
