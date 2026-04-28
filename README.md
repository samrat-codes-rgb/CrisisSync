# 🚨 CrisisSync — Real-Time Emergency Response Platform

> Real-time emergency coordination system built for the hospitality industry.  
> Built for GDG Hackathon 2026.

---

## 🎯 What is CrisisSync?

CrisisSync enables instant detection, reporting, and coordination of emergencies between hotel guests, staff, and responders. Alerts sync in real-time across all connected devices with zero refresh needed.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🆘 SOS Emergency Button** | One-tap alert with emergency type selection (Fire, Medical, Security) |
| **📊 Admin Dashboard** | Real-time alert monitoring with stats, color-coded cards |
| **⚡ Real-Time Sync** | Firebase Realtime Database with live listeners — instant updates |
| **🔊 Audio Alerts** | Programmatic alarm sound via Web Audio API on new alerts |
| **🗺️ Interactive Map** | Leaflet + OpenStreetMap showing hotel location & alert markers |
| **🤖 AI Detection** | Simulated automated fire/smoke detection with auto-alert |
| **🔐 Role-Based Login** | Guest and Admin login flows |
| **📴 Offline Fallback** | Detects offline status, queues alerts, shows SMS fallback message |
| **📱 Responsive Design** | Works beautifully on mobile, tablet, and desktop |

---

## 🚀 Quick Start

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"** → name it (e.g., `crisissync`)
3. Go to **Build → Realtime Database** → Click **"Create Database"**
4. Choose your region → Start in **Test Mode** (for demo purposes)
5. Go to **Project Settings ⚙️ → General → Your apps** → Click the **Web (</>) icon**
6. Register your app → Copy the **Firebase config object**

### Step 2: Add Your Firebase Config

Open `js/firebase-config.js` and replace the placeholder config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

### Step 3: Set Database Rules (for demo)

In Firebase Console → Realtime Database → **Rules** tab, set:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> ⚠️ These rules are for demo only. Use proper authentication rules in production.

### Step 4: Run the App

You can open the files directly or use any static server:

**Option A — Direct:**
- Simply open `index.html` in your browser.

**Option B — Live Server (recommended):**
```bash
# Install live-server globally
npm install -g live-server

# Run from project directory
cd "d:\Emergency response"
live-server
```

**Option C — VS Code:**
- Install the "Live Server" extension → Right-click `index.html` → "Open with Live Server"

---

## 📂 Project Structure

```
Emergency response/
├── index.html              # Login / Landing page
├── guest.html              # Guest SOS interface
├── admin.html              # Admin Dashboard
├── css/
│   └── styles.css          # Complete design system
├── js/
│   ├── firebase-config.js  # Firebase init + shared utilities
│   ├── guest.js            # Guest page logic
│   └── admin.js            # Admin dashboard logic
└── README.md               # This file
```

---

## 🎮 How to Use

### As a Guest:
1. Open the app → Select **"Guest"** role
2. Enter your room number (default: 302)
3. Click **"Continue as Guest"**
4. Select emergency type (Fire / Medical / Security)
5. Press the **SOS** button → Alert is sent instantly!
6. Try the **AI Detection** simulation at the bottom

### As an Admin:
1. Open the app → Select **"Admin"** role
2. Enter code: `admin123`
3. View real-time alerts on the dashboard
4. Click **"Resolve"** to mark alerts as resolved
5. Use **"AI Trigger"** to simulate automated detection
6. Use **"Clear All"** to reset the board

### Multi-Device Demo:
1. Open `guest.html` on your phone
2. Open `admin.html` on your laptop
3. Send an SOS from your phone → Watch it appear instantly on the dashboard! 🎉

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Firebase Realtime Database
- **Maps:** Leaflet.js + OpenStreetMap (CartoDB dark tiles)
- **Audio:** Web Audio API (no external files needed)
- **Design:** Custom CSS with glassmorphism, dark theme, animations

---

## 📝 License

MIT — Built with ❤️ for GDG Hackathon 2026
