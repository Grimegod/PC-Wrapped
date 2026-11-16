// Serves audit/store/listing-<version> (and the Store package from release/) on http://127.0.0.1:8738 so the Partner Center page in the
// Claude desktop browser can fetch the Store screenshots with JavaScript and attach them to the
// upload fields. Read-only, PNG and JSON only, bound to this computer (127.0.0.1), and it stops by
// itself after two hours. Close the window to stop it sooner.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..", "audit", "store", "listing-1.3.0");
const releaseDir = path.resolve(__dirname, "..", "..", "release");
const types = { ".png": "image/png", ".json": "application/json; charset=utf-8", ".msixupload": "application/octet-stream" };
const ALLOWED_ORIGIN = "https://partner.microsoft.com";

const server = http.createServer((request, response) => {
  const origin = request.headers.origin;
  if (origin === ALLOWED_ORIGIN) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", "GET");
    response.writeHead(204).end();
    return;
  }
  const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "");
  // /package/<name>.msixupload serves the Store package from release/; everything else comes from the listing folder.
  const base = relative.startsWith("package/") ? releaseDir : root;
  const file = path.resolve(base, relative.replace(/^package\//, ""));
  const type = types[path.extname(file).toLowerCase()];
  if (request.method !== "GET" || !type || !file.startsWith(base + path.sep) || !fs.existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "Content-Length": fs.statSync(file).size });
  fs.createReadStream(file).pipe(response);
  console.log("served", relative);
});

server.on("error", (error) => {
  console.log(error.code === "EADDRINUSE" ? "Serverul ruleaza deja intr-o alta fereastra. Poti inchide fereastra asta." : String(error));
});
server.listen(8738, "127.0.0.1", () => {
  console.log("PC Wrapped Store assets on http://127.0.0.1:8738 (folder: " + root + ")");
  console.log("Lasa fereastra deschisa cat timp Claude incarca capturile. Se opreste singura dupa 2 ore.");
});
setTimeout(() => process.exit(0), 2 * 60 * 60 * 1000).unref();
