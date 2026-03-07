# Movie Night Streaming Setup

## Architecture Overview

**Stream Flow:**
```
OBS (Shanghai) → HK Relay (FFmpeg :1935) → US Server (MovieNight :1935) → Viewers
```

**Viewer Flow (HK friends):**
```
HK Viewer → HK Relay (nginx :8089) → US Server (MovieNight :8089)
```

**Servers:**
- **HK Relay**: Hong Kong VM - RTMP relay using FFmpeg (`<HK_RELAY_IP>`)
- **US Server**: Azure West US 2 - MovieNight streaming server (`<US_SERVER_IP>`)

---

## HK Relay Setup (Hong Kong VM)

### 1. Install FFmpeg

```bash
sudo apt update
sudo apt install -y ffmpeg
```

### 2. Create systemd service

```bash
sudo nano /etc/systemd/system/rtmp-relay.service
```

Add this content:

```ini
[Unit]
Description=RTMP Relay to US Server
After=network.target

[Service]
Type=simple
User=yuche
WorkingDirectory=/home/yuche
ExecStart=/usr/bin/ffmpeg -listen 1 -i rtmp://0.0.0.0:1935/live -c copy -f flv rtmp://<US_SERVER_IP>:1935/live/ALongStreamKey
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

**Note:** Replace `ALongStreamKey` with your actual stream key from US MovieNight's `settings.json`

### 3. Enable and start service

```bash
sudo systemctl daemon-reload
sudo systemctl enable rtmp-relay
sudo systemctl start rtmp-relay
```

### 4. Verify service is running

```bash
sudo systemctl status rtmp-relay
```

### 5. Open firewall port

```bash
sudo ufw allow 1935/tcp
sudo ufw enable
```

### Troubleshooting

View logs:
```bash
sudo journalctl -u rtmp-relay -f
```

Restart service:
```bash
sudo systemctl restart rtmp-relay
```

---

## US Server Setup (Azure West US 2)

### 1. MovieNight configuration

Edit `~/MovieNight/settings.json`:

```json
{
  "RtmpListenAddress": ":1935",
  "StreamKey": "ALongStreamKey",
  "ListenAddress": ":8089",
  "PageTitle": "Movie Night"
}
```

### 2. Create systemd service

```bash
sudo nano /etc/systemd/system/movienight.service
```

Add this content:

```ini
[Unit]
Description=MovieNight Streaming Server
After=network.target

[Service]
Type=simple
User=yuche
WorkingDirectory=/home/yuche/MovieNight
ExecStart=/home/yuche/MovieNight/MovieNight
Restart=always
RestartSec=5

StandardOutput=append:/var/log/movienight.log
StandardError=append:/var/log/movienight-error.log

[Install]
WantedBy=multi-user.target
```

### 3. Create log files

```bash
sudo touch /var/log/movienight.log /var/log/movienight-error.log
sudo chown yuche:yuche /var/log/movienight.log /var/log/movienight-error.log
```

### 4. Enable and start service

```bash
sudo systemctl daemon-reload
sudo systemctl enable movienight
sudo systemctl start movienight
```

### 5. Verify service is running

```bash
sudo systemctl status movienight
```

### 6. Open firewall ports

```bash
# RTMP port
sudo ufw allow 1935/tcp

# HTTP port for website
sudo ufw allow 8089/tcp

sudo ufw enable
```

### Troubleshooting

View logs:
```bash
# Via journalctl
sudo journalctl -u movienight -f

# Via log files
tail -f /var/log/movienight.log
```

Restart service:
```bash
sudo systemctl restart movienight
```

Check admin password:
```bash
cat ~/MovieNight/settings.json | grep AdminPassword
```

---

## OBS Configuration

### Stream Settings

1. **Settings → Stream**
2. **Service:** Custom
3. **Server:** `rtmp://<HK_RELAY_IP>:1935/live`
4. **Stream Key:** `anything` (any value works, relay doesn't authenticate)

### Recommended Encoding Settings

- **Output Mode:** Advanced
- **Encoder:** x264 or Hardware (NVENC/QuickSync)
- **Rate Control:** CBR
- **Bitrate:** 3000-6000 Kbps
- **Keyframe Interval:** 2 seconds
- **Preset:** veryfast or faster
- **Profile:** main
- **Resolution:** 1920x1080
- **FPS:** 30

---

## Accessing the Stream

### For Viewers

Open browser and go to:
```
http://<US_SERVER_IP>:8089
```

### For Admin

Use the admin password from:
```bash
cat ~/MovieNight/settings.json | grep AdminPassword
```

---

## Testing the Setup

### 1. Check HK relay is running

```bash
ssh HK_SERVER
sudo systemctl status rtmp-relay
```

### 2. Check US server is running

```bash
ssh US_SERVER
sudo systemctl status movienight
curl http://localhost:8089
```

### 3. Start streaming from OBS

Push to: `rtmp://<HK_RELAY_IP>:1935/live`

### 4. Monitor logs

**On HK relay:**
```bash
sudo journalctl -u rtmp-relay -f
```

**On US server:**
```bash
tail -f /var/log/movienight.log
```

### 5. View the website

Open `http://<US_SERVER_IP>:8089` in browser

---

## Maintenance Commands

### Restart services

**HK Relay:**
```bash
sudo systemctl restart rtmp-relay
```

**US Server:**
```bash
sudo systemctl restart movienight
```

### View active streams

**On US server:**
```bash
# Check if stream is active
sudo lsof -i :1935
```

### Update MovieNight

```bash
cd ~/MovieNight
git pull
go build
sudo systemctl restart movienight
```

---

## Ports Reference

| Server | Port | Protocol | Purpose |
|--------|------|----------|---------|
| HK Relay | 1935 | TCP | RTMP input from OBS |
| HK Relay | 8089 | TCP | Nginx reverse proxy for HK viewers |
| US Server | 1935 | TCP | RTMP input from HK relay |
| US Server | 8089 | TCP | HTTP website for viewers |

---

## HK Viewer Relay (Nginx Reverse Proxy)

For friends in Hong Kong who have network issues connecting directly to the US server,
set up an nginx reverse proxy on the HK VM. Traffic between Azure VMs uses Azure's
backbone network, which is much more reliable than public internet.

**Viewer Flow:**
```
HK Viewer → HK VM (nginx :8089) → US Server (MovieNight :8089)
US Viewer → US Server (MovieNight :8089)
```

### 1. Install nginx

```bash
sudo apt update
sudo apt install -y nginx
```

### 2. Configure nginx

```bash
sudo nano /etc/nginx/sites-available/movienight
```

Add this content:

```nginx
server {
    listen 8089;

    location / {
        proxy_pass http://<US_SERVER_IP>:8089;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket for chat
    location /ws {
        proxy_pass http://<US_SERVER_IP>:8089;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # FLV video stream - disable buffering for real-time delivery
    location /live {
        proxy_pass http://<US_SERVER_IP>:8089;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        chunked_transfer_encoding on;
    }
}
```

**Note:** Replace `<US_SERVER_IP>` with the actual US server IP address.

### 3. Enable site and start nginx

```bash
sudo ln -s /etc/nginx/sites-available/movienight /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

### 4. Open firewall port

```bash
sudo ufw allow 8089/tcp
```

Also open port 8089/TCP in the Azure portal's Network Security Group for the HK VM.

### 5. Access

HK viewers go to: `http://<HK_RELAY_IP>:8089`

### Troubleshooting

View nginx logs:
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

Restart nginx:
```bash
sudo systemctl restart nginx
```

---

## Security Notes

1. **Stream Key:** Keep `ALongStreamKey` secret - it authenticates RTMP pushes to US server
2. **Admin Password:** Automatically generated in `settings.json` - needed for admin commands
3. **Firewall:** Only open necessary ports (1935, 8089)
4. **HK Relay:** Currently no authentication - consider adding nginx with auth if needed

---

## Why This Setup?

### Problem
Streaming directly from China to US servers has poor connectivity due to:
- High latency (150-200ms+)
- Packet loss
- Potential blocking/throttling

### Solution
Use Hong Kong as a relay point:
- **Shanghai → Hong Kong**: Low latency (~30-50ms), good connectivity
- **Hong Kong → US**: Server-to-server relay, more reliable than client streaming
- **US viewers**: Optimal experience pulling from US server

### Why FFmpeg Instead of nginx-rtmp?
The nginx-rtmp module has a hard-coded chunk size limit (65KB) that conflicts with MovieNight's RTMP library (joy4), which requests 128MB chunks. FFmpeg handles large chunk sizes without issues.
