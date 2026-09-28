# Across Stitch — Raspberry Pi Server

Lightweight, high-performance Bun + SQLite backend server for **Across Stitch**.

## Quick Start on Raspberry Pi

### 1. Install Bun on Raspberry Pi
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### 2. Copy or Clone Server Files
Copy the `server/` directory and `public/` directory to your Raspberry Pi:
```bash
scp -r server pi@raspberrypi.local:~/across_stitch/
scp -r public pi@raspberrypi.local:~/across_stitch/
```

### 3. Run the Server
```bash
cd ~/across_stitch/server
bun run server.ts
```

The server will automatically bind to `0.0.0.0:3000` on your local network. You can access it from your PC app, phone, or browser using:
`http://raspberrypi.local:3000` or `http://<PI_IP_ADDRESS>:3000`

---

## Run Automatically on Boot (systemd)

To make Across Stitch run as a background service on your Raspberry Pi:

1. Copy the systemd service file:
```bash
sudo cp across-stitch.service /etc/systemd/system/
```
*(Make sure the paths and username in the service file match your Pi setup).*

2. Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now across-stitch
```

3. Check status:
```bash
sudo systemctl status across-stitch
```

4. View logs:
```bash
journalctl -u across-stitch -f
```
