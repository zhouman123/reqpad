const els = {
  method: document.getElementById('method'),
  url: document.getElementById('url'),
  send: document.getElementById('send'),
  headerRows: document.getElementById('headerRows'),
  headerCount: document.getElementById('headerCount'),
  addHeader: document.getElementById('addHeader'),
  paramRows: document.getElementById('paramRows'),
  paramCount: document.getElementById('paramCount'),
  addParam: document.getElementById('addParam'),
  formRows: document.getElementById('formRows'),
  addForm: document.getElementById('addForm'),
  urlRows: document.getElementById('urlRows'),
  addUrlRow: document.getElementById('addUrlRow'),
  rawFormat: document.getElementById('rawFormat'),
  rawHint: document.getElementById('rawHint'),
  binFile: document.getElementById('binFile'),
  binHint: document.getElementById('binHint'),
  body: document.getElementById('body'),
  statusPill: document.getElementById('statusPill'),
  meta: document.getElementById('meta'),
  responseBody: document.getElementById('responseBody'),
  responseHeaders: document.getElementById('responseHeaders'),
  respHeaderCount: document.getElementById('respHeaderCount'),
  pretty: document.getElementById('pretty'),
  copy: document.getElementById('copy'),
  historyList: document.getElementById('historyList'),
  clearHistory: document.getElementById('clearHistory'),
};

const HISTORY_KEY = 'reqpad.history';
let lastResponseText = '';
let prettyOn = true;

/* ---------- header rows ---------- */

function addHeaderRow(name = '', value = '') {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Content-Type';
  nameInput.spellcheck = false;
  nameInput.value = name;

  const valueInput = document.createElement('input');
  valueInput.placeholder = 'application/json';
  valueInput.spellcheck = false;
  valueInput.value = value;

  const del = document.createElement('button');
  del.className = 'del';
  del.type = 'button';
  del.textContent = '×';
  del.title = '删除这一行';
  del.addEventListener('click', () => {
    row.remove();
    if (!els.headerRows.children.length) addHeaderRow();
    syncHeaderCount();
  });

  row.append(nameInput, valueInput, del);
  els.headerRows.append(row);
  nameInput.addEventListener('input', syncHeaderCount);
  return row;
}

function readHeaders() {
  const out = {};
  for (const row of els.headerRows.children) {
    const [name, value] = row.querySelectorAll('input');
    if (name.value.trim()) out[name.value.trim()] = value.value;
  }
  return out;
}

function syncHeaderCount() {
  els.headerCount.textContent = String(Object.keys(readHeaders()).length);
}

/* ---------- params: URL query string <-> editable rows ---------- */

// The URL field stays the single source of truth; the table is a view of its
// query string. Disabled rows are kept in the table but dropped from the URL,
// so they are never sent.
let paramSyncLock = false;

function splitUrl(raw) {
  const hashAt = raw.indexOf('#');
  const head = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
  const queryAt = head.indexOf('?');
  return {
    base: queryAt >= 0 ? head.slice(0, queryAt) : head,
    query: queryAt >= 0 ? head.slice(queryAt + 1) : '',
    hash,
  };
}

function addParamRow(key = '', value = '', enabled = true) {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'kv-check';
  check.checked = enabled;
  check.title = '取消勾选就不拼进 URL';

  const keyInput = document.createElement('input');
  keyInput.placeholder = 'page';
  keyInput.spellcheck = false;
  keyInput.value = key;

  const valueInput = document.createElement('input');
  valueInput.placeholder = '1';
  valueInput.spellcheck = false;
  valueInput.value = value;

  const del = document.createElement('button');
  del.className = 'del';
  del.type = 'button';
  del.textContent = '×';
  del.title = '删除这一行';
  del.addEventListener('click', () => {
    row.remove();
    syncUrlFromParams();
  });

  row.append(check, keyInput, valueInput, del);
  els.paramRows.append(row);

  const onChange = () => syncUrlFromParams();
  check.addEventListener('change', onChange);
  keyInput.addEventListener('input', onChange);
  valueInput.addEventListener('input', onChange);
  return row;
}

function readParams() {
  return [...els.paramRows.children].map((row) => {
    const [check, key, value] = row.querySelectorAll('input');
    return { key: key.value, value: value.value, enabled: check.checked };
  });
}

function renderParams(rows) {
  els.paramRows.replaceChildren();
  for (const row of rows) addParamRow(row.key, row.value, row.enabled);
  syncParamCount();
}

function syncParamCount() {
  els.paramCount.textContent = String(els.paramRows.children.length);
}

function syncParamsFromUrl() {
  if (paramSyncLock) return;
  const { query } = splitUrl(els.url.value);
  const rows = [];
  for (const [key, value] of new URLSearchParams(query)) rows.push({ key, value, enabled: true });
  renderParams(rows);
}

function syncUrlFromParams() {
  if (paramSyncLock) return;
  const { base, hash } = splitUrl(els.url.value);
  const query = new URLSearchParams();
  for (const row of readParams()) {
    if (!row.enabled || !row.key.trim()) continue;
    query.append(row.key, row.value);
  }
  const next = query.toString();
  paramSyncLock = true;
  els.url.value = next ? `${base}?${next}${hash}` : `${base}${hash}`;
  paramSyncLock = false;
  syncParamCount();
}

/* ---------- tabs ---------- */

for (const tab of document.querySelectorAll('.tab[data-tab]')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab[data-tab]')) t.classList.toggle('active', t === tab);
    for (const pane of document.querySelectorAll('[data-pane]')) {
      pane.classList.toggle('hidden', pane.dataset.pane !== tab.dataset.tab);
    }
  });
}

for (const tab of document.querySelectorAll('.tab[data-rtab]')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab[data-rtab]')) t.classList.toggle('active', t === tab);
    for (const pane of document.querySelectorAll('[data-rpane]')) {
      pane.classList.toggle('hidden', pane.dataset.rpane !== tab.dataset.rtab);
    }
  });
}

/* ---------- body types ---------- */

const RAW_CONTENT_TYPES = {
  json: 'application/json',
  text: 'text/plain',
  xml: 'application/xml',
  html: 'text/html',
};
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function currentBodyType() {
  return document.querySelector('input[name="bodyType"]:checked')?.value || 'none';
}

function setBodyType(type) {
  for (const radio of document.querySelectorAll('input[name="bodyType"]')) {
    radio.checked = radio.value === type;
  }
  for (const editor of document.querySelectorAll('[data-body]')) {
    editor.classList.toggle('hidden', editor.dataset.body !== type);
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

// Key/value rows shared by form-data and x-www-form-urlencoded.
function addTextRow(container, key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const keyInput = document.createElement('input');
  keyInput.placeholder = 'key';
  keyInput.spellcheck = false;
  keyInput.value = key;

  const valueInput = document.createElement('input');
  valueInput.placeholder = 'value';
  valueInput.spellcheck = false;
  valueInput.value = value;

  const del = document.createElement('button');
  del.className = 'del';
  del.type = 'button';
  del.textContent = '×';
  del.title = '删除这一行';
  del.addEventListener('click', () => row.remove());

  row.append(keyInput, valueInput, del);
  container.append(row);
  return row;
}

// form-data row: key + (text value | file picker) + type selector.
function addFormRow(key = '', value = '', type = 'text') {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const keyInput = document.createElement('input');
  keyInput.placeholder = 'key';
  keyInput.spellcheck = false;
  keyInput.value = key;

  const slot = document.createElement('div');
  slot.className = 'val-slot';

  const valueInput = document.createElement('input');
  valueInput.placeholder = 'value';
  valueInput.spellcheck = false;
  valueInput.value = value;

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'pick-file hidden';
  pickBtn.textContent = '选择文件';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.hidden = true;

  slot.append(valueInput, pickBtn, fileInput);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'type';
  for (const option of ['text', 'file']) {
    const item = document.createElement('option');
    item.value = option;
    item.textContent = option;
    typeSelect.append(item);
  }
  typeSelect.value = type;

  const del = document.createElement('button');
  del.className = 'del';
  del.type = 'button';
  del.textContent = '×';
  del.title = '删除这一行';
  del.addEventListener('click', () => row.remove());

  function applyType() {
    const isFile = typeSelect.value === 'file';
    valueInput.classList.toggle('hidden', isFile);
    pickBtn.classList.toggle('hidden', !isFile);
  }

  pickBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    pickBtn.textContent = file ? file.name : '选择文件';
    pickBtn.classList.toggle('has-file', Boolean(file));
  });
  typeSelect.addEventListener('change', applyType);

  row.append(keyInput, slot, typeSelect, del);
  els.formRows.append(row);
  applyType();
  return row;
}

function readFormRows() {
  return [...els.formRows.children]
    .map((row) => {
      const key = row.querySelector('input:not([type="file"])').value.trim();
      const type = row.querySelector('select.type').value;
      const file = row.querySelector('input[type="file"]').files?.[0];
      const value = row.querySelector('.val-slot input').value;
      return { key, type, value, file };
    })
    .filter((row) => row.key);
}

function readUrlRows() {
  return [...els.urlRows.children]
    .map((row) => {
      const [key, value] = row.querySelectorAll('input');
      return { key: key.value.trim(), value: value.value };
    })
    .filter((row) => row.key);
}

function setRawHint() {
  const format = els.rawFormat.value;
  els.rawHint.textContent = `未手写 Content-Type 时用 ${RAW_CONTENT_TYPES[format]}`;
}
setRawHint();

// Turns the Body tab into the fields the server needs.
async function collectBody() {
  const type = currentBodyType();
  if (type === 'none') return { bodyType: 'none' };
  if (type === 'raw') return { bodyType: 'raw', body: els.body.value };
  if (type === 'urlencoded') {
    const query = new URLSearchParams();
    for (const row of readUrlRows()) query.append(row.key, row.value);
    return { bodyType: 'urlencoded', body: query.toString() };
  }
  if (type === 'binary') {
    const file = els.binFile.files?.[0];
    if (!file) return { bodyType: 'none' };
    if (file.size > MAX_FILE_BYTES) throw new Error(`文件超过 ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    return {
      bodyType: 'binary',
      binary: { filename: file.name, contentType: file.type || 'application/octet-stream', base64: await readFileAsBase64(file) },
    };
  }
  const form = [];
  for (const row of readFormRows()) {
    if (row.type === 'file') {
      if (!row.file) continue;
      if (row.file.size > MAX_FILE_BYTES) throw new Error(`文件超过 ${MAX_FILE_BYTES / 1024 / 1024} MB：${row.file.name}`);
      form.push({
        key: row.key,
        type: 'file',
        filename: row.file.name,
        contentType: row.file.type || 'application/octet-stream',
        base64: await readFileAsBase64(row.file),
      });
    } else {
      form.push({ key: row.key, type: 'text', value: row.value });
    }
  }
  return { bodyType: 'formdata', form };
}

function applyAutoContentType(headers, payload) {
  if (Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) return;
  if (payload.bodyType === 'raw') headers['content-type'] = RAW_CONTENT_TYPES[els.rawFormat.value] || 'text/plain';
  else if (payload.bodyType === 'urlencoded') headers['content-type'] = 'application/x-www-form-urlencoded';
  else if (payload.bodyType === 'binary') headers['content-type'] = payload.binary.contentType;
  // formdata gets its boundary-bearing type from the server.
  syncHeaderCount();
}

/* ---------- send ---------- */

function statusClass(status) {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client';
  if (status >= 500) return 'server';
  return 'idle';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function prettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function showBody(text) {
  lastResponseText = text;
  els.responseBody.textContent = prettyOn ? prettyJson(text) : text;
  els.pretty.disabled = els.copy.disabled = false;
  els.pretty.textContent = prettyOn ? '原始响应' : '格式化 JSON';
}

async function send() {
  const method = els.method.value;
  const url = els.url.value.trim();
  if (!url) {
    els.statusPill.className = 'pill error';
    els.statusPill.textContent = '错误';
    els.meta.textContent = '';
    els.responseBody.textContent = '请先填 URL。';
    return;
  }

  // Lock the button before any await: reading files is async, and a second
  // click during that window would send the request twice.
  els.send.disabled = true;
  els.send.textContent = '发送中…';
  els.statusPill.className = 'pill idle';
  els.statusPill.textContent = '…';
  els.meta.textContent = '';

  const headers = readHeaders();
  const started = performance.now();
  try {
    const bodyPayload = await collectBody();
    applyAutoContentType(headers, bodyPayload);

    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, url, headers, ...bodyPayload, followRedirects: true }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    els.statusPill.className = `pill ${statusClass(data.status)}`;
    els.statusPill.textContent = `${data.status} ${data.statusText}`.trim();
    const redirectNote = data.redirects && data.redirects.length ? ` · 跟随 ${data.redirects.length} 次跳转` : '';
    els.meta.textContent = `${data.timeMs.toFixed(0)} ms · ${formatBytes(data.sizeBytes)}${redirectNote}`;

    els.respHeaderCount.textContent = String(data.headers.length);
    els.responseHeaders.textContent = data.headers.map(([k, v]) => `${k}: ${v}`).join('\n');

    if (data.binary) {
      showBody(`[二进制响应 ${formatBytes(data.sizeBytes)}，以下为 base64]\n\n${data.body}`);
    } else if (!data.body) {
      showBody(`[空响应体] ${formatBytes(data.sizeBytes)}`);
    } else {
      showBody(data.body);
    }

    pushHistory({
      method,
      url,
      headers: readHeaders(),
      bodyType: bodyPayload.bodyType,
      body: els.body.value,
      form: bodyPayload.bodyType === 'formdata'
        ? (bodyPayload.form || []).map((row) => ({ key: row.key, type: row.type, value: row.value ?? '' }))
        : [],
      at: Date.now(),
    });
  } catch (error) {
    els.statusPill.className = 'pill error';
    els.statusPill.textContent = '失败';
    els.meta.textContent = `${(performance.now() - started).toFixed(0)} ms`;
    showBody(`请求失败：${error.message}`);
  } finally {
    els.send.disabled = false;
    els.send.textContent = 'Send';
  }
}

/* ---------- history ---------- */
// Source of truth is the server's JSON file; localStorage is only a fallback
// for when the page is opened without the backend (e.g. a file:// wrapper).
let history = [];

function mirrorHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // Storage can be unavailable (private mode); the file is still authoritative.
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items)) return data.items;
    }
  } catch {
    // fall through to the local mirror
  }
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

async function refreshHistory() {
  history = await loadHistory();
  renderHistory();
}

async function pushHistory(entry) {
  try {
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = await res.json();
      history = Array.isArray(data.items) ? data.items : history;
      mirrorHistory(history);
      renderHistory();
      return;
    }
  } catch {
    // fall through to the local mirror
  }
  history = [entry, ...history.filter((it) => !(it.method === entry.method && it.url === entry.url))].slice(0, 50);
  mirrorHistory(history);
  renderHistory();
}

function renderHistory() {
  const items = history;
  els.historyList.replaceChildren();
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '还没有请求记录';
    els.historyList.append(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    const method = document.createElement('span');
    method.className = 'm';
    method.textContent = item.method;
    const url = document.createElement('span');
    url.className = 'u';
    url.textContent = item.url;
    url.title = item.url;
    li.append(method, url);
    li.addEventListener('click', () => {
      els.method.value = item.method;
      els.url.value = item.url;
      els.body.value = item.body || '';
      els.headerRows.replaceChildren();
      const headers = Object.entries(item.headers || {});
      if (headers.length) for (const [k, v] of headers) addHeaderRow(k, v);
      else addHeaderRow();
      syncHeaderCount();
      syncParamsFromUrl();

      // File bytes are never persisted, so a file row comes back empty on purpose.
      const bodyType = item.bodyType || (item.body ? 'raw' : 'none');
      setBodyType(bodyType);
      els.formRows.replaceChildren();
      for (const row of item.form || []) addFormRow(row.key, row.value || '', row.type || 'text');
      els.urlRows.replaceChildren();
      if (bodyType === 'urlencoded') {
        for (const [k, v] of new URLSearchParams(item.body || '')) addTextRow(els.urlRows, k, v);
      }
      els.binFile.value = '';
      els.binHint.textContent = '按文件原始字节发送，Content-Type 取文件类型。';
    });
    els.historyList.append(li);
  }
}

/* ---------- wiring ---------- */

els.addHeader.addEventListener('click', () => addHeaderRow());
els.addParam.addEventListener('click', () => {
  const row = addParamRow();
  syncParamCount();
  row.querySelectorAll('input')[1].focus();
});
els.url.addEventListener('input', syncParamsFromUrl);
for (const radio of document.querySelectorAll('input[name="bodyType"]')) {
  radio.addEventListener('change', () => setBodyType(currentBodyType()));
}
els.addForm.addEventListener('click', () => addFormRow());
els.addUrlRow.addEventListener('click', () => addTextRow(els.urlRows));
els.rawFormat.addEventListener('change', setRawHint);
els.binFile.addEventListener('change', () => {
  const file = els.binFile.files?.[0];
  els.binHint.textContent = file
    ? `${file.name} · ${formatBytes(file.size)} · ${file.type || 'application/octet-stream'}`
    : '按文件原始字节发送，Content-Type 取文件类型。';
});
els.send.addEventListener('click', send);
els.clearHistory.addEventListener('click', async () => {
  try {
    await fetch('/api/history', { method: 'DELETE' });
  } catch {
    // server-less fallback below still clears the local mirror
  }
  history = [];
  mirrorHistory(history);
  renderHistory();
});
els.pretty.addEventListener('click', () => {
  prettyOn = !prettyOn;
  showBody(lastResponseText);
});
els.copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(lastResponseText);
  els.copy.textContent = '已复制';
  setTimeout(() => { els.copy.textContent = '复制响应'; }, 1200);
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    send();
  }
});

addHeaderRow();
syncHeaderCount();
syncParamsFromUrl();
refreshHistory();
