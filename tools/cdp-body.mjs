// Drives the Body tab: urlencoded, raw(XML), form-data.
// Usage: node tools/cdp-body.mjs
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

const APP_URL = process.argv[2] || 'http://127.0.0.1:4599/';
const ECHO = 'http://127.0.0.1:4598/echo';
const PORT = 9335;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = `/tmp/chrome-body-${process.pid}`;
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
      const $ = (s) => document.querySelector(s);
      const url = document.getElementById('url');
      const setUrl = (v) => { url.value = v; url.dispatchEvent(new Event('input')); };
      const pick = (type) => {
        const radio = document.querySelector('input[name="bodyType"][value="' + type + '"]');
        radio.click();
      };
      const visible = () => [...document.querySelectorAll('[data-body]')]
        .filter((el) => !el.classList.contains('hidden')).map((el) => el.dataset.body);
      const sendAndEcho = async () => {
        document.getElementById('send').click();
        const pill = document.getElementById('statusPill');
        for (let i = 0; i < 100; i++) {
          if (pill.textContent && pill.textContent !== '未发送' && pill.textContent !== '…') break;
          await sleep(100);
        }
        try { return JSON.parse(document.getElementById('responseBody').textContent); } catch { return null; }
      };

      document.querySelector('.tab[data-tab="body"]').click();
      setUrl(${JSON.stringify(ECHO)});
      document.getElementById('method').value = 'POST';

      // urlencoded
      pick('urlencoded');
      const urlPane = visible();
      document.getElementById('addUrlRow').click();
      document.getElementById('addUrlRow').click();
      const urlInputs = [...document.querySelectorAll('#urlRows .kv-row')].map((r) => r.querySelectorAll('input'));
      urlInputs[0][0].value = 'a'; urlInputs[0][1].value = '1';
      urlInputs[1][0].value = 'b'; urlInputs[1][1].value = '2';
      const encodedEcho = await sendAndEcho();

      // raw XML
      pick('raw');
      const rawFormat = document.getElementById('rawFormat');
      rawFormat.value = 'xml';
      rawFormat.dispatchEvent(new Event('change'));
      document.getElementById('body').value = '<a>1</a>';
      const xmlEcho = await sendAndEcho();

      // form-data (text only; file picking is not scriptable here)
      pick('formdata');
      document.getElementById('addForm').click();
      const formRow = document.querySelector('#formRows .kv-row');
      formRow.querySelector('input:not([type="file"])').value = 'name';
      formRow.querySelector('.val-slot input').value = '张三';
      const formEcho = await sendAndEcho();

      return {
        visiblePanes: urlPane,
        encoded: { ct: encodedEcho?.headers?.['content-type'], body: encodedEcho?.body },
        xml: { ct: xmlEcho?.headers?.['content-type'], body: xmlEcho?.body },
        form: { ct: formEcho?.headers?.['content-type'], hasField: (formEcho?.body || '').includes('name="name"') },
      };
    })()
  `, true);

  console.log(JSON.stringify(result, null, 2));
  const ok =
    result.visiblePanes.join(',') === 'urlencoded' &&
    result.encoded.body === 'a=1&b=2' &&
    result.encoded.ct === 'application/x-www-form-urlencoded' &&
    result.xml.ct === 'application/xml' &&
    result.xml.body === '<a>1</a>' &&
    (result.form.ct || '').startsWith('multipart/form-data; boundary=') &&
    result.form.hasField;
  console.log(ok ? '\nBODY OK' : '\nBODY FAILED');
  process.exitCode = ok ? 0 : 1;
} finally {
  ws?.close();
  chrome.kill('SIGKILL');
  await sleep(300);
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
}
