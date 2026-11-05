// Drives the Params table: URL -> rows, uncheck, send, add row.
// Usage: node tools/cdp-params.mjs
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

const APP_URL = process.argv[2] || 'http://127.0.0.1:4599/';
const TARGET = process.argv[3] || 'http://127.0.0.1:4598/echo?a=1&b=2';
const PORT = 9334;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = `/tmp/chrome-params-${process.pid}`;
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
    } else if (msg.method) events.push(msg.method);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression, awaitPromise = false) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 40 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);

  const result = await evaluate(`
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const url = document.getElementById('url');
      const rowsOf = () => [...document.querySelectorAll('#paramRows .kv-row')];
      const readRows = () => rowsOf().map((r) => {
        const [c, k, v] = r.querySelectorAll('input');
        return { checked: c.checked, key: k.value, value: v.value };
      });

      // 1) URL -> table
      url.value = ${JSON.stringify(TARGET)};
      url.dispatchEvent(new Event('input'));
      await sleep(50);
      document.querySelector('.tab[data-tab="params"]').click();
      const afterParse = { rows: readRows(), badge: document.getElementById('paramCount').textContent, url: url.value };

      // 2) uncheck the first row -> URL drops it
      rowsOf()[0].querySelector('input[type="checkbox"]').click();
      await sleep(50);
      const afterUncheck = { url: url.value, rows: readRows().length, badge: document.getElementById('paramCount').textContent };

      // 3) send, and see what actually reached the server
      document.getElementById('send').click();
      const pill = document.getElementById('statusPill');
      for (let i = 0; i < 100; i++) {
        if (pill.textContent && pill.textContent !== '未发送' && pill.textContent !== '…') break;
        await sleep(100);
      }
      let echoedUrl = null;
      try { echoedUrl = JSON.parse(document.getElementById('responseBody').textContent).url; } catch {}

      // 4) add a row -> URL gains it
      document.getElementById('addParam').click();
      const last = rowsOf().at(-1).querySelectorAll('input');
      last[1].value = 'c';
      last[1].dispatchEvent(new Event('input'));
      last[2].value = '3';
      last[2].dispatchEvent(new Event('input'));
      await sleep(50);

      return { afterParse, afterUncheck, echoedUrl, afterAdd: { url: url.value, badge: document.getElementById('paramCount').textContent } };
    })()
  `, true);

  console.log(JSON.stringify(result, null, 2));

  const ok =
    result.afterParse.rows.length === 2 &&
    result.afterParse.rows[0].key === 'a' &&
    result.afterParse.badge === '2' &&
    result.afterUncheck.url.endsWith('?b=2') &&
    result.echoedUrl === '/echo?b=2' &&
    result.afterAdd.url.endsWith('?b=2&c=3');
  console.log(ok ? '\nPARAMS OK' : '\nPARAMS FAILED');
  process.exitCode = ok ? 0 : 1;
} finally {
  ws?.close();
  chrome.kill('SIGKILL');
  await sleep(300);
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
}
