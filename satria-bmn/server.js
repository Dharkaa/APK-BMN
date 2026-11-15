/* Server lokal tanpa dependensi untuk menguji prototipe SATRIA BMN. */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname);
const port = Number(process.env.PORT || 8787);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(response, status, body, type) {
  response.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method)) {
    send(response, 405, "Metode tidak diizinkan.");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`).pathname);
  } catch (error) {
    send(response, 400, "Permintaan tidak valid.");
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    send(response, 403, "Akses ditolak.");
    return;
  }
  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) {
      send(response, 404, "Berkas tidak ditemukan.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(file).on("error", () => send(response, 500, "Berkas tidak dapat dibaca.")).pipe(response);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`SATRIA BMN tersedia di http://127.0.0.1:${port}`);
  console.log("Server hanya menerima koneksi dari perangkat ini.");
});
