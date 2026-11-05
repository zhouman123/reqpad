// End-to-end smoke test: drive the real page in headless Chrome over CDP,
// click Send, and read what the UI actually rendered.
// Usage: node tools/cdp-smoke.mjs <appUrl> <targetUrl>
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

const APP_URL = process.argv[2] || 'http://127.0.0.1:4599/';
const TARGET_URL = process.argv[3] || 'http://127.0.0.1:4598/echo?from=ui';
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = `/tmp/chrome-smoke-${process.pid}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let version;
  for (let i = 0; i < 40; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      break;
    } catch {
      await sleep(250);
    }
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
    } else if (msg.method) {
      events.push(msg.method);
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression, awaitPromise = false) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + (result.exceptionDetails.exception?.description ?? ''));
    return result.result.value;
  };

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 40 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);

  const rendered = await evaluate(`
    (async () => {
      document.getElementById('url').value = ${JSON.stringify(TARGET_URL)};
      document.getElementById('method').value = 'GET';
      document.querySelector('.tab[data-tab="headers"]').click();
      document.getElementById('send').click();
      const pill = document.getElementById('statusPill');
      for (let i = 0; i < 100; i++) {
        if (pill.textContent && pill.textContent !== '未发送' && pill.textContent !== '…') break;
        await new Promise(r => setTimeout(r, 100));
      }
      const body = document.getElementById('responseBody').textContent;
      return {
        status: pill.textContent,
        pillClass: pill.className,
        meta: document.getElementById('meta').textContent,
        respHeaderCount: document.getElementById('respHeaderCount').textContent,
        bodyHead: body.slice(0, 160),
        echoedMethod: (() => { try { return JSON.parse(body).method; } catch { return null; } })(),
      };
    })()
  `, true);

  console.log(JSON.stringify(rendered, null, 2));
  const ok = rendered.status.startsWith('200') &&
    rendered.echoedMethod === 'GET' &&
    Number(rendered.respHeaderCount) > 0;
  console.log(ok ? '\nSMOKE OK' : '\nSMOKE FAILED');
  process.exitCode = ok ? 0 : 1;
} finally {
  ws?.close();
  chrome.kill('SIGKILL');
  await sleep(300);
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
}
