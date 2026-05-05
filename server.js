import http from "http";
import crypto from "crypto";

const PORT = Number(process.env.PORT || 8000);

let expectedApiKey = process.env.API_KEY;

if (!expectedApiKey) {
  expectedApiKey = crypto.randomBytes(42).toString("base64url").slice(0, 56);
  console.log("No API_KEY provided. Generated random API key:");
  console.log(expectedApiKey);
}

const server = http.createServer((req, res) => {
  if (req.headers["x-api-key"] === expectedApiKey) {
    res.writeHead(200);
    return res.end();
  }

  res.writeHead(401, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "unauthorized", status: 401 }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`API key auth service listening on port ${PORT}`);
});
