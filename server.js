import http from "http";
import crypto from "crypto";

const PORT = Number(process.env.PORT || 8000);

const MAX_FAILED = Number(process.env.MAX_FAILED || 2);
const WINDOW_MS = Number(process.env.WINDOW_MS || 10 * 60 * 1000);
const BAN_MS = Number(process.env.BAN_MS || 24 * 60 * 60 * 1000);

let expectedApiKey = process.env.API_KEY;

if (!expectedApiKey) {
  expectedApiKey = crypto.randomBytes(42).toString("base64url").slice(0, 56);
  console.log("No API_KEY provided. Generated random API key:");
  console.log(expectedApiKey);
}

const attempts = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
}

function isBlocked(ip, now) {
  const entry = attempts.get(ip);

  if (!entry) {
    return false;
  }

  if (entry.bannedUntil && entry.bannedUntil > now) {
    return true;
  }

  if (entry.bannedUntil && entry.bannedUntil <= now) {
    attempts.delete(ip);
  }

  return false;
}

function recordFailedAttempt(ip, now) {
  const entry = attempts.get(ip) || {
    count: 0,
    windowStart: now,
    bannedUntil: 0,
  };

  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
    entry.bannedUntil = 0;
  }

  entry.count += 1;

  if (entry.count >= MAX_FAILED) {
    entry.bannedUntil = now + BAN_MS;
  }

  attempts.set(ip, entry);

  return entry;
}

function cleanupOldEntries(now) {
  for (const [ip, entry] of attempts.entries()) {
    const windowExpired = now - entry.windowStart > WINDOW_MS;
    const banExpired = entry.bannedUntil && entry.bannedUntil <= now;

    if (windowExpired && (!entry.bannedUntil || banExpired)) {
      attempts.delete(ip);
    }
  }
}

const server = http.createServer((req, res) => {
  const sourceIp = getClientIp(req);
  const timestamp = new Date().toISOString();
  const now = Date.now();

  cleanupOldEntries(now);

  if (isBlocked(sourceIp, now)) {
    console.log(`[${timestamp}] ⛔ Blocked auth from ${sourceIp}`);

    res.writeHead(429, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        error: "too_many_failed_attempts",
        status: 429,
      })
    );
  }

  if (req.headers["x-api-key"] === expectedApiKey) {
    attempts.delete(sourceIp);

    console.log(`[${timestamp}] ✓ Successful auth from ${sourceIp}`);

    res.writeHead(200);
    return res.end();
  }

  const entry = recordFailedAttempt(sourceIp, now);

  console.log(
    `[${timestamp}] ✗ Failed auth from ${sourceIp} (${entry.count}/${MAX_FAILED})`
  );

  if (entry.bannedUntil > now) {
    console.log(`[${timestamp}] ⛔ Banned auth from ${sourceIp}`);

    res.writeHead(429, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        error: "too_many_failed_attempts",
        status: 429,
      })
    );
  }

  res.writeHead(401, { "content-type": "application/json" });
  return res.end(
    JSON.stringify({
      error: "unauthorized",
      status: 401,
    })
  );
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`API key auth service listening on port ${PORT}`);
});
