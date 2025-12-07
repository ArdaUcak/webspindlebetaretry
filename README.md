# Web Spindle Tracker (JavaScript)

A LAN-accessible Node.js rewrite of the spindle tracking app that keeps the CSV-based data model but serves the UI in any browser on the local network.

## Features
- Login screen (username: `BAKIM`, password: `MAXIME`).
- Spindle list with search, add, edit, delete.
- Yedek list with search, add, edit, delete.
- CSV export that mirrors the desktop app’s layout.
- Runs on `0.0.0.0:5000` so other devices on the network can connect.
- No external npm dependencies required.

## Getting Started
1. Ensure Node.js 18+ is installed.
2. Start the server:
   ```bash
   npm start
   ```
3. From another device on the same LAN, open:
   ```
   http://<server-lan-ip>:5000/login
   ```
   (Use one of the LAN IPs printed at startup.)
4. Place your existing `spindle_data.csv` and `yedek_data.csv` files in the project root (they’ll be created automatically if missing).

## Notes
- Data is stored directly in the CSV files; edits are immediately persisted.
- Sessions are in-memory with a 12-hour lifetime and secure cookies (HttpOnly + SameSite=Lax); restart the server to reset activ
e logins.
- If you can reach the app locally but not from other devices:
  - Allow inbound traffic on port 5000 (or your custom `PORT`) in Windows Defender Firewall for Private networks.
  - Confirm both machines share the same subnet (e.g., `192.168.1.x`).
  - Reuse the exact LAN address shown in the startup log.
