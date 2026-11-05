// Local-only HTTP client backend, the same trick Postman uses:
// the UI is a page, but requests are sent by Node's http/https stack,
// so there is no browser CORS/origin restriction.
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from 'node:zlib';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const PORT = Number(process.env.PORT || 4599);
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 10;
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
// History lives in a file, not in browser storage: it survives a browser
// change, a cleared cache, and (later) the native WKWebView wrapper.
const HISTORY_FILE = join(homedir(), '.reqpad', 'history.json');
const LEGACY_HISTORY_FILE = join(homedir(), '.postman-lite', 'history.json');
const HISTORY_LIMIT = 50;

// The macOS shell sets this: if the app is force-killed, the child is
// reparented to launchd (ppid 1) and exits instead of lingering forever.
if (process.env.REQPAD_PARENT_WATCH === '1') {
  setInterval(() => {
    if (process.ppid === 1) process.exit(0);
  }, 1000).unref();
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  const buf = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
  res.end(buf);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ---- history: read/write a JSON file so it outlives the browser ----

async function readHistory() {
  try {
    const parsed = JSON.parse(await readFile(HISTORY_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // First run after the rename: seed from the previous location, if any.
    try {
      const legacy = JSON.parse(await readFile(LEGACY_HISTORY_FILE, 'utf8'));
      if (Array.isArray(legacy) && legacy.length) {
        await writeHistory(legacy);
        return legacy;
      }
    } catch {
      // No legacy file: start empty.
    }
    return [];
  }
}

async function writeHistory(items) {
  await mkdir(dirname(HISTORY_FILE), { recursive: true });
  const tmp = `${HISTORY_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2));
  await rename(tmp, HISTORY_FILE);
}

function cleanEntry(raw) {
  const method = String(raw?.method || '').toUpperCase().slice(0, 16);
  const url = String(raw?.url || '').slice(0, 2048);
  if (!/^[A-Z]+$/.test(method) || !url) return null;
  const headers = {};
  for (const [key, value] of Object.entries(raw?.headers || {}).slice(0, 100)) {
    if (typeof key === 'string' && key) headers[key.slice(0, 256)] = String(value).slice(0, 4096);
  }
  const bodyType = String(raw?.bodyType || 'none').slice(0, 16);
  const form = Array.isArray(raw?.form)
    ? raw.form.slice(0, 100).map((row) => ({
      key: String(row?.key || '').slice(0, 256),
      type: row?.type === 'file' ? 'file' : 'text',
      value: String(row?.value ?? '').slice(0, 10_000),
    }))
    : [];
  // File bytes are never persisted: history is a log, not a file store.
  return {
    method,
    url,
    headers,
    bodyType,
    body: String(raw?.body ?? '').slice(0, 100_000),
    form,
    at: Date.now(),
  };
}

async function pushHistory(raw) {
  const entry = cleanEntry(raw);
  if (!entry) return readHistory();
  const items = (await readHistory()).filter((it) => !(it.method === entry.method && it.url === entry.url));
  items.unshift(entry);
  const trimmed = items.slice(0, HISTORY_LIMIT);
  await writeHistory(trimmed);
  return trimmed;
}

// One hop, no redirect handling: returns the raw response so the caller
// can decide whether to follow Location.
function oneHop({ method, url, headers, body }) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const options = {
      method,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    };
    const req = (isHttps ? httpsRequest : httpRequest)(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        rawHeaders: res.rawHeaders,
        buffer: Buffer.concat(chunks),
      }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`timed out after ${REQUEST_TIMEOUT_MS} ms`)));
    req.on('error', reject);
    if (body && body.length) req.write(body);
    req.end();
  });
}

function headerValue(rawHeaders, name) {
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === name) return rawHeaders[i + 1];
  }
  return null;
}

function decodeBody(buffer, rawHeaders) {
  const encoding = (headerValue(rawHeaders, 'content-encoding') || '').toLowerCase();
  try {
    if (encoding === 'gzip' || encoding === 'x-gzip') return gunzipSync(buffer);
    if (encoding === 'deflate') {
      // Some servers send raw DEFLATE without the zlib wrapper.
      try {
        return inflateSync(buffer);
      } catch {
        return inflateRawSync(buffer);
      }
    }
    if (encoding === 'br') return brotliDecompressSync(buffer);
  } catch {
    // Leave the bytes as received; the caller still sees the raw payload.
  }
  return buffer;
}

// A payload is textual only when it round-trips through UTF-8 unchanged.
// Everything else is returned as base64 so the client never shows mojibake.
function asTextOrBase64(buffer) {
  const text = buffer.toString('utf8');
  if (Buffer.from(text, 'utf8').equals(buffer)) return { body: text, binary: false };
  return { body: buffer.toString('base64'), binary: true };
}

function setHeader(headers, name, value) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) delete headers[key];
  }
  headers[name] = value;
}

function dropHeader(headers, name) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) delete headers[key];
  }
}

function escapePartName(value) {
  return String(value).replace(/["\r\n]/g, '_');
}

function buildMultipart(fields, boundary) {
  const parts = [];
  for (const field of fields) {
    if (!field || !field.key) continue;
    const name = escapePartName(field.key);
    if (field.type === 'file') {
      const filename = escapePartName(field.filename || 'file');
      parts.push(Buffer.from(
        `--${boundary}\r\n`
        + `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n`
        + `Content-Type: ${field.contentType || 'application/octet-stream'}\r\n\r\n`
      ));
      parts.push(Buffer.from(field.base64 || '', 'base64'));
      parts.push(Buffer.from('\r\n'));
    } else {
      parts.push(Buffer.from(
        `--${boundary}\r\n`
        + `Content-Disposition: form-data; name="${name}"\r\n\r\n`
        + `${field.value ?? ''}\r\n`
      ));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

// Turns the Body tab selection into the bytes to send. form-data owns its
// Content-Type because the boundary has to match the bytes we just built.
function buildRequestBody(payload, method, headers) {
  if (method === 'GET' || method === 'HEAD') return Buffer.alloc(0);
  const bodyType = String(payload.bodyType || (payload.body ? 'raw' : 'none'));
  if (bodyType === 'raw' || bodyType === 'urlencoded') {
    return Buffer.from(payload.body == null ? '' : String(payload.body), 'utf8');
  }
  if (bodyType === 'binary') {
    return Buffer.from(String(payload.binary?.base64 || ''), 'base64');
  }
  if (bodyType === 'formdata') {
    const boundary = `----reqpad${randomBytes(8).toString('hex')}`;
    const body = buildMultipart(Array.isArray(payload.form) ? payload.form : [], boundary);
    setHeader(headers, 'content-type', `multipart/form-data; boundary=${boundary}`);
    return body;
  }
  return Buffer.alloc(0);
}

async function execute(payload) {
  const started = process.hrtime.bigint();
  const method = String(payload.method || 'GET').toUpperCase();
  let rawUrl = String(payload.url || '').trim();
  if (!rawUrl) throw new Error('url is empty');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl)) rawUrl = `http://${rawUrl}`;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`not a valid url: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported scheme: ${url.protocol} (only http/https)`);
  }

  const headers = {};
  for (const [name, value] of Object.entries(payload.headers || {})) {
    if (!name || value === '' || value == null) continue;
    headers[name] = String(value);
  }
  headers['accept-encoding'] = 'gzip, deflate, br';

  const bodyBuf = buildRequestBody(payload, method, headers);
  if (bodyBuf.length) {
    setHeader(headers, 'content-length', String(bodyBuf.length));
  } else {
    // A leftover length header would make the server wait for bytes we never send.
    dropHeader(headers, 'content-length');
  }

  const redirects = [];
  let current = { method, url, headers, body: bodyBuf };
  let response;
  for (let hop = 0; ; hop += 1) {
    response = await oneHop(current);
    const location = headerValue(response.rawHeaders, 'location');
    const isRedirect = [301, 302, 303, 307, 308].includes(response.statusCode) && location;
    if (!payload.followRedirects || !isRedirect || redirects.length >= MAX_REDIRECTS) break;
    const nextUrl = new URL(location, current.url);
    redirects.push({ status: response.statusCode, to: nextUrl.toString() });
    const dropBody = response.statusCode === 303 || (response.statusCode <= 302 && current.method === 'POST');
    const nextMethod = dropBody ? 'GET' : current.method;
    const nextHeaders = { ...current.headers };
    if (dropBody) {
      delete nextHeaders['content-length'];
      delete nextHeaders['content-type'];
    }
    current = { method: nextMethod, url: nextUrl, headers: nextHeaders, body: dropBody ? Buffer.alloc(0) : current.body };
  }

  const decoded = decodeBody(response.buffer, response.rawHeaders);
  const { body: outBody, binary } = asTextOrBase64(decoded);
  const responseHeaders = [];
  for (let i = 0; i < response.rawHeaders.length; i += 2) {
    responseHeaders.push([response.rawHeaders[i], response.rawHeaders[i + 1]]);
  }

  return {
    status: response.statusCode,
    statusText: response.statusMessage || '',
    timeMs: Number(process.hrtime.bigint() - started) / 1e6,
    sizeBytes: decoded.length,
    headers: responseHeaders,
    body: outBody,
    binary,
    contentType: headerValue(response.rawHeaders, 'content-type') || '',
    redirects,
    finalUrl: current.url.toString(),
  };
}

async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolved = join(PUBLIC_DIR, relative);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const file = await readFile(resolved);
    res.writeHead(200, { 'content-type': MIME[extname(resolved)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
}

const server = createServer(async (req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  if (req.url === '/api/send' && req.method === 'POST') {
    try {
      const payload = JSON.parse((await readRequestBody(req)).toString('utf8') || '{}');
      sendJson(res, 200, await execute(payload));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }
  if (req.url === '/api/health') {
    sendJson(res, 200, { ok: true, port: PORT });
    return;
  }
  if (req.url === '/api/history') {
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, { items: await readHistory() });
        return;
      }
      if (req.method === 'POST') {
        const payload = JSON.parse((await readRequestBody(req)).toString('utf8') || '{}');
        sendJson(res, 200, { items: await pushHistory(payload) });
        return;
      }
      if (req.method === 'DELETE') {
        await writeHistory([]);
        sendJson(res, 200, { items: [] });
        return;
      }
      sendJson(res, 405, { error: 'method not allowed' });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`reqpad  ->  http://127.0.0.1:${PORT}`);
});
