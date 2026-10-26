const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(process.argv[2] || 'dist/web');
const port = Number(process.argv[3] || 4173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.pdf':'application/pdf'};
const server = http.createServer((req,res) => {
  try {
    let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    // Exercise GitHub Pages' repository subdirectory, not only a root deployment.
    if (name.startsWith('/broker-study/')) name = name.slice('/broker-study'.length);
    if (name.endsWith('/')) name += 'index.html';
    const file = path.resolve(root,'.' + name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400);res.end('Bad request'); }
});
server.listen(port,'127.0.0.1',() => console.log(`http://127.0.0.1:${port}/broker-study/`));
