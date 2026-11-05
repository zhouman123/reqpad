// Screenshot the real page after running a snippet, e.g.
//   node tools/cdp-shot.mjs http://127.0.0.1:4599/ /tmp/x.png "document.querySelector('.tab[data-tab=\"body\"]').click(); document.querySelector('input[value=\"urlencoded\"]').click();"
import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';

const [, , appUrl = 'http://127.0.0.1:4599/', out = '/tmp/reqpad.png', snippet = ''] = process.argv;
const PORT = 9336;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = `/tmp/chrome-shot-${process.pid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=1180,820',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let version;
  for (let i = 0; i < 40; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      break;
    } catch { await sleep(250); }
  }
  if (!version) throw new Error('chrome did not expose CDP');

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) events.push(msg.method);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: appUrl });
  for (let i = 0; i < 40 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);

  if (snippet) {
    const result = await call('Runtime.evaluate', { expression: snippet, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    if (result.result?.value !== undefined) console.log(JSON.stringify(result.result.value, null, 2));
  }
  await sleep(250);

  const shot = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(out, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${out}`);
} finally {
  ws?.close();
  chrome.kill('SIGKILL');
  await sleep(300);
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
}
