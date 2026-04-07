# Quick Deploy Reference

## ✅ Setup Complete

Your backend is now production-ready. Here's what was configured:

### Files Added/Modified

```
✓ server.js              - Cloud-ready WebSocket server
✓ coop-network.js        - Browser WebSocket client wrapper
✓ main.js                - Uses VITE_COOP_SERVER_URL env var
✓ package.json           - Added 'server:prod' script
✓ DEPLOYMENT.md          - Detailed deployment guides
✓ .env.example           - Environment variable reference
✓ Procfile               - Platform.sh compatible deployment
```

---

## 🚀 Deploy in 3 Steps

### Step 1: Pick Your Backend Platform

| Platform    | Best For    | Difficulty  | Cost      |
| ----------- | ----------- | ----------- | --------- |
| **Render**  | Simplicity  | ⭐ Easy     | Free tier |
| **Fly.io**  | Performance | ⭐⭐ Medium | Free tier |
| **Railway** | Speed       | ⭐ Easy     | Free tier |

**Recommendation**: Start with **Render** (easiest, auto-deployment from GitHub)

---

### Step 2: Deploy Backend

#### Render (Recommended)

```bash
1. Go to https://render.com
2. Sign in with GitHub
3. Click "New Web Service"
4. Connect your repo: gedenoss/league_shooter
5. Fill form:
   - Name: league-shooter-coop
   - Build: npm install
   - Start: npm run server:prod
   - Instance: Free
6. Click Deploy
7. Wait 2-5 min for URL (e.g., https://league-shooter-coop.render.com)
```

#### Fly.io

```bash
flyctl auth login
flyctl launch  # Follow prompts
flyctl deploy
# Your URL: https://league-shooter-coop.fly.dev
```

#### Railway

```bash
1. Go to https://railway.app
2. Create new project → GitHub
3. Select your repo
4. Set start command: npm run server:prod
5. Deploy
```

---

### Step 3: Update Frontend (Vercel)

1. **Copy your backend URL** from deployment (e.g., `https://league-shooter-coop.render.com`)

2. **On Vercel**, add environment variable:

   ```
   VITE_COOP_SERVER_URL=wss://league-shooter-coop.render.com
   ```

   _(Replace domain with your actual backend URL)_

3. **Redeploy frontend** or push new commit to trigger rebuild

4. **Test**: Open your Vercel URL → Click "COOP" button → Host a game

---

## 🧪 Test Locally First

Before deploying to cloud:

```bash
# Terminal 1: Backend server
npm run server

# Terminal 2: Frontend (Vite dev)
npm run dev

# Then open http://localhost:5173 in 2 browser tabs
```

---

## 📋 Environment Variables

### Backend (Render/Fly/Railway)

```env
NODE_ENV=production
PORT=8080  # Auto-set by platform, don't override
HOST=0.0.0.0
```

### Frontend (Vercel)

```env
VITE_COOP_SERVER_URL=wss://your-backend-domain.com
```

---

## ❌ Troubleshooting

| Problem              | Solution                                   |
| -------------------- | ------------------------------------------ |
| "Connection refused" | Check backend URL on Vercel env vars       |
| "WebSocket failed"   | Use `wss://` (secure) if frontend is HTTPS |
| 502 Bad Gateway      | Backend crashed; check Render/Fly logs     |
| "Can't create room"  | Backend isn't running; redeploy            |

---

## 📊 Architecture (Post-Deploy)

```
┌─────────────────────────────────┐
│  league-shooter.vercel.app      │  (Frontend: Static HTML/JS)
│                                 │
│  - Three.js game engine         │
│  - Connects to backend via WSS  │
└────────────┬────────────────────┘
             │ wss://
             │ (WebSocket Secure)
    ┌────────▼──────────────┐
    │  league-shooter-coop  │      (Backend: Node.js)
    │  .render.com          │
    │                       │      - Room management
    │  WebSocket Server     │      - Game state sync
    │  (port 8080)          │      - Pause menu timeout
    └───────────────────────┘
```

---

## 🎯 After Deployment

✅ Backend deployed to Render/Fly/Railway  
✅ Frontend deployed to Vercel  
✅ Environment variables configured  
✅ Ready for 2-player coop!

Next steps:

1. Share your Vercel URL with a friend
2. Both open the game
3. One player clicks **HÉBERGER** (host)
4. Other player clicks **REJOINDRE** (join) + enters the 6-digit code
5. 🧟 Kill zombies together!

---

## 📚 More Info

- See `DEPLOYMENT.md` for detailed platform guides
- Backend source: `server.js`
- Client source: `coop-network.js` + `main.js`
- Build: `npm run build` (creates `dist/`)

---

**Ready? Pick a platform above and deploy! 🚀**
