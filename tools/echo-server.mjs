// Tiny local target server for trying out reqpad without depending on
// any external site: echoes what it received, plus a redirect and a gzip case.
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';

const PORT = Number(process.env.PORT || 4598);

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');

    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/echo' }).end();
      return;
    }

    if (req.url === '/gzip') {
      const payload = gzipSync(Buffer.from(JSON.stringify({ compressed: true, ok: 1 })));
      res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' }).end(payload);
      return;
    }

    if (req.url === '/slow') {
      setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end('{"slow":true}'), 1500);
      return;
    }

    const payload = JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }, null, 2);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(payload);
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`echo target -> http://127.0.0.1:${PORT}/echo`));
