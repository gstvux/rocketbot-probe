// ─── Servidor estático portátil (zero-dependência) ───────────────────────────
// Serve ./dist em http://localhost:<PORT> (default 8000). Cross-platform: funciona
// em Linux, macOS e Windows sem proxy/powershell. Rode `npm run build` antes (ou use
// `npm run dev`, que compila e serve). Ctrl+C encerra.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8000', 10);
const ROOT = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(ROOT)) {
  console.error('❌ dist/ não existe. Rode `npm run build` primeiro.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    // Impede path traversal
    const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }

    fs.stat(filePath, (err, stat) => {
      let target = filePath;
      if (err || !stat.isFile()) {
        // fallback: tenta .html (rotas sem extensão)
        if (fs.existsSync(filePath + '.html')) target = filePath + '.html';
        else { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
               res.end('<h1>404</h1>'); return; }
      }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(target).pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end('500');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Rocketbot probe docs em  http://localhost:${PORT}/`);
  console.log('   (Ctrl+C para encerrar)');
});
