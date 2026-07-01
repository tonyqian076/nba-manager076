const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const rooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 15_000_000) {
        reject(new Error("Request is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function roomPayload(room) {
  return {
    state: room.state,
    version: room.version,
    claims: room.claims
  };
}

function roomFor(key) {
  if (!rooms.has(key)) rooms.set(key, { state: null, version: 0, claims: {}, updatedAt: Date.now() });
  return rooms.get(key);
}

function apiRoute(req, res, url) {
  const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9-]{1,18})(?:\/(claim|state))?$/);
  if (!match) return false;
  const [, key, action] = match;
  const room = roomFor(key);

  if (req.method === "GET" && !action) {
    sendJson(res, 200, roomPayload(room));
    return true;
  }

  readBody(req)
    .then((body) => {
      if (req.method === "POST" && action === "claim") {
        const { teamId, clientId } = body;
        if (!teamId || !clientId) return sendJson(res, 400, { error: "Missing team or client id." });
        const current = room.claims[teamId];
        if (current && current !== clientId) return sendJson(res, 409, { error: "That team is already claimed." });
        room.claims[teamId] = clientId;
        if (room.state) {
          room.state.multiplayer = room.state.multiplayer || { enabled: true, roomKey: key, claims: {} };
          room.state.multiplayer.enabled = true;
          room.state.multiplayer.roomKey = key;
          room.state.multiplayer.claims = room.claims;
        }
        room.version += 1;
        room.updatedAt = Date.now();
        return sendJson(res, 200, roomPayload(room));
      }

      if (req.method === "POST" && action === "state") {
        if (!body.state || !body.clientId) return sendJson(res, 400, { error: "Missing state or client id." });
        const incomingClaims = body.state.multiplayer?.claims || {};
        room.claims = { ...room.claims, ...incomingClaims };
        body.state.multiplayer = body.state.multiplayer || { enabled: true, roomKey: key, claims: {} };
        body.state.multiplayer.enabled = true;
        body.state.multiplayer.roomKey = key;
        body.state.multiplayer.claims = room.claims;
        room.state = body.state;
        room.version += 1;
        room.updatedAt = Date.now();
        return sendJson(res, 200, roomPayload(room));
      }

      sendJson(res, 404, { error: "Unknown room endpoint." });
    })
    .catch((error) => sendJson(res, 400, { error: error.message }));
  return true;
}

function serveFile(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (apiRoute(req, res, url)) return;
  serveFile(req, res, url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NBA Manager server running at http://localhost:${PORT}`);
  console.log("For other laptops, open this Mac's LAN IP with the same port.");
});
