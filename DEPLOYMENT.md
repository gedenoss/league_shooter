# League Shooter - Deployment Guide

## Architecture

- **Frontend**: Static site (deployed to Vercel, Netlify, or any CDN)
- **Backend**: WebSocket server (deployed to Render, Fly.io, Railway, or similar)

## Frontend Deployment (Vercel)

### Quick Setup

1. Build the frontend:

   ```bash
   npm install
   npm run build
   ```

2. Push to GitHub:

   ```bash
   git push origin main
   ```

3. Deploy on Vercel:
   - Go to https://vercel.com
   - Import your GitHub repo
   - Vercel auto-detects Vite config
   - Click Deploy
   - Your site is live at `https://your-project.vercel.app`

### Environment Variables (in Vercel UI)

If using a custom backend URL:

```
VITE_COOP_SERVER_URL=wss://your-backend.render.com
```

---

## Backend Deployment

### Option 1: Render.com (Recommended)

1. **Create `.gitignore` entries** (if not already done):

   ```
   node_modules/
   .env
   dist/
   .DS_Store
   ```

2. **Push to GitHub** (with `server.js` included):

   ```bash
   git add server.js package.json package-lock.json
   git commit -m "Add production-ready backend"
   git push origin main
   ```

3. **Deploy on Render**:
   - Go to https://render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Fill in:
     - **Name**: `league-shooter-coop`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm run server:prod`
     - **Instance Type**: `Free` (or paid if needed)
   - Add environment variable:
     - **Key**: `NODE_ENV`
     - **Value**: `production`
   - Click "Create Web Service"
   - Wait 2-5 minutes for deployment
   - Copy your backend URL (e.g., `https://league-shooter-coop.render.com`)

4. **Update Frontend**:
   - On Vercel, add environment variable:
     ```
     VITE_COOP_SERVER_URL=wss://league-shooter-coop.render.com
     ```
   - Redeploy frontend (or push a new commit to trigger rebuild)

---

### Option 2: Fly.io

1. **Install Fly CLI**:

   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Deploy**:

   ```bash
   flyctl launch
   ```

   - App name: `league-shooter-coop`
   - Environment: `Node`
   - Agree to create `fly.toml`

3. **Deploy to Fly**:

   ```bash
   flyctl deploy
   ```

   - Your backend is live at `https://league-shooter-coop.fly.dev`

4. **Update Frontend** with `VITE_COOP_SERVER_URL=wss://league-shooter-coop.fly.dev`

---

### Option 3: Railway.app

1. **Connect GitHub** on https://railway.app
2. **Create new project** → Select your GitHub repo
3. **Auto-detect** Node.js environment
4. **Set build & start commands**:
   - Build: `npm install`
   - Start: `npm run server:prod`
5. **Add environment variable**:
   ```
   NODE_ENV=production
   ```
6. **Deploy** (automatic on push)
7. View your backend URL in Railway dashboard

---

## Local Testing

### Run Both Locally

```bash
# Terminal 1: Backend
npm run server

# Terminal 2: Frontend
npm run dev
```

Access at `http://localhost:5173` → open 2 browser tabs → test coop mode

---

## Monitoring & Logs

### Render

- Logs: https://render.com → Your Service → Logs tab

### Fly.io

```bash
flyctl logs
```

### Railway

- Logs: Railway dashboard → Deployments tab

---

## Troubleshooting

### "Connection refused" when joining game

- **Frontend**: Verify `VITE_COOP_SERVER_URL` is set correctly on Vercel
- **Backend**: Check that service is running and PORT is exposed

### WebSocket connection fails

- Ensure backend uses `wss://` (secure WebSocket) for HTTPS frontends
- Check CORS is not blocking (WebSocket doesn't use CORS, but check firewall rules)

### "Unable to parse deployment platform"

- Ensure `server.js` exists in git repo and is staged/committed

---

## Environment Variables Summary

| Variable               | Where                        | Usage                                                   |
| ---------------------- | ---------------------------- | ------------------------------------------------------- |
| `VITE_COOP_SERVER_URL` | Vercel (Frontend)            | Override WebSocket URL (e.g., `wss://your-backend.com`) |
| `NODE_ENV`             | Render/Fly/Railway (Backend) | Set to `production` for optimized server                |
| `PORT`                 | Render/Fly/Railway (Backend) | Auto-set to 10000+ by platform; don't override          |
| `HOST`                 | Backend start (optional)     | Usually omitted; defaults to `0.0.0.0`                  |

---

## Additional Tips

1. **Test production builds locally**:

   ```bash
   npm run build
   npm run preview   # Serves dist/ on localhost:4173
   ```

2. **Check WebSocket in DevTools**:
   - Open DevTools → Network tab
   - Filter by "ws" or "websocket"
   - Click connection to see frames

3. **Minimize WebSocket disconnects**:
   - Backend timeout (MAX_ROOM_AGE_MS) is 10 seconds; adjust in `server.js` if needed
   - Frontend reconnects automatically on close

---

## Next Steps

1. Deploy backend to your chosen platform
2. Copy backend URL (e.g., `wss://your-backend.render.com`)
3. Set `VITE_COOP_SERVER_URL` on Vercel
4. Test coop mode with live backend ✓
