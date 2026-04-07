# League Shooter 🎮🧟

A 3D first-person shooter survival game built with **Three.js** and **Vite**.

## Features

- ✅ **Solo Mode**: Wave-based zombie survival with upgrades
- ✅ **Coop Mode**: 2-player online multiplayer with WebSocket sync
- 🎯 Weapon upgrades (damage, fire rate, ammo)
- 📈 Progressive difficulty waves
- 🌐 Real-time network synchronization

---

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Run frontend dev server (http://localhost:5173)
npm run dev

# In another terminal: Run backend server (ws://localhost:8080)
npm run server
```

### Production Build

```bash
npm run build
# Output: dist/ folder ready for static hosting
```

---

## Deployment

### Frontend → Vercel (Free)

- Push code to GitHub
- Deploy on Vercel auto-detects Vite config
- Ready in <1 min

### Backend → Render/Fly/Railway (Free tier)

See **[DEPLOY_QUICK.md](DEPLOY_QUICK.md)** for step-by-step guides.

**Full deployment docs**: [DEPLOYMENT.md](DEPLOYMENT.md)

---

## Project Structure

```
├── main.js              - Game engine (Three.js, input, game logic, coop)
├── server.js            - WebSocket server (room management, state sync)
├── coop-network.js      - Browser WebSocket client wrapper
├── index.html           - Entry point
├── package.json         - Dependencies & scripts
├── DEPLOYMENT.md        - Detailed cloud deployment guides
├── DEPLOY_QUICK.md      - Quick reference card
└── .env.example         - Environment variables reference
```

---

## Controls

### Gameplay

- **W/A/S/D** - Move
- **Space** - Jump
- **Mouse** - Look around
- **Left Click** - Shoot
- **R** - Reload ammo

### Menus

- **Click Buttons** - Select upgrades during pause menu
- **COOP Button** (Blue 3D button) - Host/Join multiplayer game
- **Code Display** - Shows your room code when hosting

---

## Codebases

| File            | Lines | Purpose                                |
| --------------- | ----- | -------------------------------------- |
| main.js         | ~3700 | Game engine, rendering, UI, networking |
| server.js       | ~270  | WebSocket server (Node.js)             |
| coop-network.js | ~130  | Browser client wrapper                 |

---

## Environment Variables

Create `.env.local` (git-ignored):

```env
NODE_ENV=development
VITE_COOP_SERVER_URL=ws://localhost:8080  # Local dev
```

For production on Vercel:

```env
VITE_COOP_SERVER_URL=wss://your-backend-domain.com
```

See `.env.example` for all options.

---

## Technology Stack

- **3D Engine**: Three.js 0.183.2
- **Build Tool**: Vite 8.0.5
- **Real-time Networking**: WebSocket (ws 8.20.0)
- **Deployment**: Vercel (frontend) + Render/Fly/Railway (backend)

---

## Multiplayer Architecture

**Host Authority Model**:

- Host owns all game state (zombies, waves)
- Host broadcasts snapshots every ~90ms
- Guest sends player input + shots to host
- Host validates and syncs results back
- Pause menu: 10-second synchronized timer for upgrades

---

## Known Limitations

- Single game instance per room (no spectators/rejoins)
- WebSocket URL must be configured per environment
- Multiplayer zombies use snapshots (some latency acceptable)

---

## Future Ideas

- [ ] Voice/text chat
- [ ] Spectator mode
- [ ] Persistent stats/leaderboard
- [ ] Mobile controls
- [ ] Multiple weapon types
- [ ] Dynamic difficulty scaling

---

## License

ISC

---

## Support

Issues? Check:

- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment troubleshooting
- [DEPLOY_QUICK.md](DEPLOY_QUICK.md) - Quick reference
- Backend logs on Render/Fly/Railway dashboard
- Browser DevTools → Network → WebSocket tab

---

**Ready to deploy? Follow [DEPLOY_QUICK.md](DEPLOY_QUICK.md)** 🚀
