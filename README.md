# Eight-Team NBA Manager

A browser-based NBA manager simulation for an 8-team league. Choose one team, manage rotations and contracts, trade with AI managers, draft new players, and chase championships across a 10-year run.

中文使用手册: [README.zh-CN.md](./README.zh-CN.md)

## Features

- Separate team-selection window before Season 1 starts
- One-player mode or room-key multiplayer mode
- 8 current NBA teams, split into East and West
- Regular season windows, playoffs, draft, free-agent market, mailbox, and news
- AI-managed teams with rotations, trades, free-agent bids, and trade proposals
- Salary cap, investment limit, hard-cap checks, contract extensions, waivers, and draft-pick trading
- Hidden player form, age curves, injuries, hot-player icons, and stat-based scouting

## Run Locally

Open `index.html` directly in a browser.

No build step or server is required for one-player mode.

## Multiplayer

Multiplayer needs the included Node server so laptops can share the same room state.

```bash
npm start
```

Then open `http://localhost:3000` on the host laptop. Other laptops on the same network should open the host laptop's LAN IP with port `3000`, choose multiplayer mode, and type the same room key.

## Files

- `index.html` - app shell and views
- `styles.css` - UI styling
- `app.js` - game simulation and interaction logic
- `data/playerPool.js` - team rosters, player ages, and draft player pool
- `server.js` - local room-key multiplayer server
- `package.json` - start script for the multiplayer server
