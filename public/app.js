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
  collectionList: document.getElementById('collectionList'),
  collSearch: document.getElementById('collSearch'),
  beautify: document.getElementById('beautify'),
  bodyFindPrev: document.getElementById('bodyFindPrev'),
  bodyFindNext: document.getElementById('bodyFindNext'),
  respFindPrev: document.getElementById('respFindPrev'),
  respFindNext: document.getElementById('respFindNext'),
  bodyFind: document.getElementById('bodyFind'),
  bodyFindCount: document.getElementById('bodyFindCount'),
  respFind: document.getElementById('respFind'),
  respFindCount: document.getElementById('respFindCount'),
  toggleAll: document.getElementById('toggleAll'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  envSelect: document.getElementById('envSelect'),
};

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
    const active = radio.value === type;
    radio.checked = active;
    radio.closest('label')?.classList.toggle('selected', active);
  }
  for (const editor of document.querySelectorAll('[data-body]')) {
    editor.classList.toggle('hidden', editor.dataset.body !== type);
  }
  // Postman shows one blank row; start each table that way instead of empty.
  if (type === 'formdata' && !els.formRows.children.length) addFormRow();
  if (type === 'urlencoded' && !els.urlRows.children.length) addTextRow(els.urlRows);
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

let respMatchIndex = 0;

function showBody(text) {
  lastResponseText = text;
  els.pretty.disabled = els.copy.disabled = false;
  els.pretty.textContent = prettyOn ? '原始响应' : '格式化 JSON';
  respMatchIndex = 0;
  renderResponseBody();
}

// Everything is inserted as text nodes, so a response containing markup is
// still just text; only our own <mark> elements are real elements.
function renderResponseBody() {
  const text = prettyOn ? prettyJson(lastResponseText) : lastResponseText;
  const query = els.respFind.value.trim();
  els.responseBody.replaceChildren();
  if (!query) {
    els.responseBody.textContent = text;
    els.respFindCount.textContent = '';
    return;
  }
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let from = 0;
  let count = 0;
  let first = null;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) els.responseBody.append(document.createTextNode(text.slice(from, at)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + needle.length);
    els.responseBody.append(mark);
    if (!first) first = mark;
    count += 1;
    from = at + needle.length;
  }
  els.responseBody.append(document.createTextNode(text.slice(from)));
  els.respFindCount.textContent = count ? `1/${count}` : '未找到';
  if (first) first.scrollIntoView({ block: 'center' });
}

function jumpRespMatch(delta) {
  const marks = [...els.responseBody.querySelectorAll('mark')];
  if (!marks.length) {
    els.respFindCount.textContent = els.respFind.value.trim() ? '未找到' : '';
    return;
  }
  respMatchIndex = (respMatchIndex + delta + marks.length) % marks.length;
  marks[respMatchIndex].scrollIntoView({ block: 'center' });
  els.respFindCount.textContent = `${respMatchIndex + 1}/${marks.length}`;
}

let bodyMatchIndex = -1;

function bodyMatches(query) {
  const needle = query.toLowerCase();
  const haystack = els.body.value.toLowerCase();
  const hits = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) hits.push(at);
  return hits;
}

// Focus stays in the find box so Enter keeps advancing; the textarea keeps the
// selection, which is what shows the match (same split Postman uses).
function gotoBodyMatch(delta, reset = false) {
  const query = els.bodyFind.value.trim();
  if (!query) {
    els.bodyFindCount.textContent = '';
    bodyMatchIndex = -1;
    return;
  }
  const hits = bodyMatches(query);
  if (!hits.length) {
    els.bodyFindCount.textContent = '未找到';
    bodyMatchIndex = -1;
    return;
  }
  if (reset || bodyMatchIndex < 0) bodyMatchIndex = 0;
  else bodyMatchIndex = (bodyMatchIndex + delta + hits.length) % hits.length;

  const at = hits[bodyMatchIndex];
  els.body.focus();
  els.body.setSelectionRange(at, at + query.length);
  els.bodyFind.focus();
  els.bodyFindCount.textContent = `${bodyMatchIndex + 1}/${hits.length}`;
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
    const payload = applyVars({ method, url, headers, ...bodyPayload, followRedirects: true });

    const unresolved = [...new Set((payload.url.match(/\{\{[^}]+\}\}/g) || []))];
    if (unresolved.length) {
      els.statusPill.className = 'pill error';
      els.statusPill.textContent = '变量未定义';
      showBody(`这些变量没有值：${unresolved.join('、')}\n\n右上角切一个变量环境，或者直接在 URL 里写死。`);
      return;
    }

    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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

/* ---------- collections + variables ---------- */

let collections = [];
let environments = [];
const ENV_KEY = 'reqpad.env';

function currentEnvValues() {
  const name = els.envSelect.value;
  const found = environments.find((env) => env.name === name);
  return found ? found.values : {};
}

function substituteVars(text) {
  const values = currentEnvValues();
  return String(text ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  ));
}

function applyVars(payload) {
  payload.url = substituteVars(payload.url);
  const headers = {};
  for (const [key, value] of Object.entries(payload.headers)) headers[key] = substituteVars(value);
  payload.headers = headers;
  if (typeof payload.body === 'string') payload.body = substituteVars(payload.body);
  if (Array.isArray(payload.form)) {
    payload.form = payload.form.map((row) => ({ ...row, value: substituteVars(row.value) }));
  }
  return payload;
}

function renderEnvSelect() {
  const previous = localStorage.getItem(ENV_KEY) || '';
  els.envSelect.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = environments.length ? '变量: 不替换' : '变量: 无';
  els.envSelect.append(none);
  for (const env of environments) {
    const option = document.createElement('option');
    option.value = env.name;
    option.textContent = `${env.name} (${Object.keys(env.values || {}).length})`;
    els.envSelect.append(option);
  }
  if (environments.some((env) => env.name === previous)) els.envSelect.value = previous;
}

// Collapse state is remembered per collection name and per collection|folder.
const OPEN_COLLECTIONS_KEY = 'reqpad.openCollections';
const CLOSED_FOLDERS_KEY = 'reqpad.closedFolders';

function loadSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Storage may be unavailable; collapsing still works for this session.
  }
}

let openCollections = loadSet(OPEN_COLLECTIONS_KEY);
let searchQuery = '';
const closedFolders = loadSet(CLOSED_FOLDERS_KEY);

function caret() {
  const span = document.createElement('span');
  span.className = 'caret';
  span.textContent = '▶';
  return span;
}

function updateToggleAll() {
  const anyClosed = collections.some((collection) => !openCollections.has(collection.name));
  els.toggleAll.textContent = anyClosed ? '展开' : '折叠';
}

function renderCollections() {
  els.collectionList.replaceChildren();
  const query = searchQuery.trim().toLowerCase();

  if (!collections.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '还没有集合，点右上角「导入」选 Postman 导出的 JSON。';
    els.collectionList.append(li);
    updateToggleAll();
    return;
  }

  const itemRow = (item) => {
    const row = document.createElement('div');
    row.className = 'item';
    const method = document.createElement('span');
    method.className = 'm';
    method.textContent = item.method;
    const name = document.createElement('span');
    name.className = 'n';
    name.textContent = item.name;
    name.title = `${item.name}\n${item.url}`;
    row.append(method, name);
    row.addEventListener('click', () => applyItem(item));
    return row;
  };

  // While searching the tree is flattened: only matches, always expanded.
  const view = [];
  for (const collection of collections) {
    const nameHit = collection.name.toLowerCase().includes(query);
    const items = !query || nameHit
      ? collection.items
      : collection.items.filter((item) => item.name.toLowerCase().includes(query)
        || item.url.toLowerCase().includes(query)
        || item.method.toLowerCase().includes(query)
        || (item.folder || '').toLowerCase().includes(query));
    if (!query || nameHit || items.length) view.push({ collection, items });
  }

  if (query && !view.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = `没有匹配「${searchQuery.trim()}」的集合或请求。`;
    els.collectionList.append(li);
    updateToggleAll();
    return;
  }

  for (const { collection, items: collectionItems } of view) {
    const collEl = document.createElement('li');
    const collOpen = Boolean(query) || openCollections.has(collection.name);
    collEl.className = collOpen ? 'coll open' : 'coll';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'coll-head';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = collection.name;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `· ${collectionItems.length}`;
    if (query) head.append(name, count);
    else head.append(caret(), name, count);

    const body = document.createElement('div');
    body.className = collEl.classList.contains('open') ? 'coll-body' : 'coll-body hidden';

    head.addEventListener('click', () => {
      const open = !collEl.classList.contains('open');
      collEl.classList.toggle('open', open);
      body.classList.toggle('hidden', !open);
      if (open) openCollections.add(collection.name);
      else openCollections.delete(collection.name);
      saveSet(OPEN_COLLECTIONS_KEY, openCollections);
      updateToggleAll();
    });

    // Folders first (sorted by name, which is how Postman numbers them),
    // then the requests that sit outside any folder.
    const folders = new Map();
    const loose = [];
    for (const item of collectionItems) {
      if (!item.folder) {
        loose.push(item);
        continue;
      }
      if (!folders.has(item.folder)) folders.set(item.folder, []);
      folders.get(item.folder).push(item);
    }

    for (const [folderName, items] of [...folders].sort((a, b) => a[0].localeCompare(b[0], 'zh'))) {
      const folderKey = `${collection.name}|${folderName}`;
      const folderEl = document.createElement('div');
      const folderOpen = Boolean(query) || !closedFolders.has(folderKey);
      folderEl.className = folderOpen ? 'folder open' : 'folder';

      const folderHead = document.createElement('button');
      folderHead.type = 'button';
      folderHead.className = 'folder-head';
      const folderNameEl = document.createElement('span');
      folderNameEl.className = 'name';
      folderNameEl.textContent = folderName;
      const folderCount = document.createElement('span');
      folderCount.className = 'count';
      folderCount.textContent = `· ${items.length}`;
      if (query) folderHead.append(folderNameEl, folderCount);
      else folderHead.append(caret(), folderNameEl, folderCount);

      const folderBody = document.createElement('div');
      folderBody.className = folderEl.classList.contains('open') ? 'folder-body' : 'folder-body hidden';

      folderHead.addEventListener('click', () => {
        const open = !folderEl.classList.contains('open');
        folderEl.classList.toggle('open', open);
        folderBody.classList.toggle('hidden', !open);
        if (open) closedFolders.delete(folderKey);
        else closedFolders.add(folderKey);
        saveSet(CLOSED_FOLDERS_KEY, closedFolders);
      });

      for (const item of items) folderBody.append(itemRow(item));
      folderEl.append(folderHead, folderBody);
      body.append(folderEl);
    }
    for (const item of loose) body.append(itemRow(item));

    collEl.append(head, body);
    els.collectionList.append(collEl);
  }

  updateToggleAll();
}

async function refreshCollections() {
  try {
    const res = await fetch('/api/collections');
    if (!res.ok) return;
    const data = await res.json();
    collections = Array.isArray(data.collections) ? data.collections : [];
    environments = Array.isArray(data.environments) ? data.environments : [];
    renderEnvSelect();
    renderCollections();
  } catch {
    // No backend: nothing to show until it is reachable.
  }
}

function applyItem(item) {
  els.method.value = item.method || 'GET';
  els.url.value = item.url || '';
  syncParamsFromUrl();

  els.headerRows.replaceChildren();
  const headers = Object.entries(item.headers || {});
  if (headers.length) for (const [k, v] of headers) addHeaderRow(k, v);
  else addHeaderRow();
  syncHeaderCount();

  els.body.value = item.body || '';
  setBodyType(item.bodyType || 'none');
  els.formRows.replaceChildren();
  if ((item.bodyType || 'none') === 'formdata') {
    for (const row of item.form || []) addFormRow(row.key, row.value || '', row.type || 'text');
    if (!els.formRows.children.length) addFormRow();
  }
  els.urlRows.replaceChildren();
  if (item.bodyType === 'urlencoded') {
    for (const [k, v] of new URLSearchParams(item.body || '')) addTextRow(els.urlRows, k, v);
    if (!els.urlRows.children.length) addTextRow(els.urlRows);
  }
  els.binFile.value = '';
}

async function importFiles(fileList) {
  const files = [...fileList];
  let added = 0;
  let envAdded = 0;
  const errors = [];
  for (const file of files) {
    try {
      const data = JSON.parse(await file.text());
      const res = await fetch('/api/collections/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      added += result.addedItems || 0;
      envAdded += result.addedEnvironments || 0;
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
    }
  }
  await refreshCollections();
  const summary = `导入完成：新增 ${added} 个请求、${envAdded} 个环境`;
  els.meta.textContent = summary;
  if (errors.length) showBody(`${summary}\n\n失败：\n${errors.join('\n')}`);
  else showBody(`${summary}`);
}

/* ---------- wiring ---------- */

els.addHeader.addEventListener('click', () => addHeaderRow());
els.addParam.addEventListener('click', () => {
  const row = addParamRow();
  syncParamCount();
  row.querySelectorAll('input')[1].focus();
});
els.url.addEventListener('input', syncParamsFromUrl);
els.envSelect.addEventListener('change', () => {
  localStorage.setItem(ENV_KEY, els.envSelect.value);
});
els.respFind.addEventListener('input', () => {
  respMatchIndex = 0;
  renderResponseBody();
});
els.bodyFind.addEventListener('input', () => {
  bodyMatchIndex = -1;
  gotoBodyMatch(0, true);
});
els.bodyFind.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    gotoBodyMatch(event.shiftKey ? -1 : 1);
  }
  if (event.key === 'Escape') {
    els.bodyFind.value = '';
    els.bodyFindCount.textContent = '';
    bodyMatchIndex = -1;
  }
});
els.respFind.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    jumpRespMatch(event.shiftKey ? -1 : 1);
  }
  if (event.key === 'Escape') {
    els.respFind.value = '';
    renderResponseBody();
  }
});
els.bodyFindNext.addEventListener('click', () => gotoBodyMatch(1));
els.bodyFindPrev.addEventListener('click', () => gotoBodyMatch(-1));
els.respFindNext.addEventListener('click', () => jumpRespMatch(1));
els.respFindPrev.addEventListener('click', () => jumpRespMatch(-1));
els.collSearch.addEventListener('input', () => {
  searchQuery = els.collSearch.value;
  renderCollections();
});
els.beautify.addEventListener('click', () => {
  if (els.rawFormat.value !== 'json') {
    els.rawHint.textContent = '只有 JSON 支持格式化';
    return;
  }
  const text = els.body.value.trim();
  if (!text) return;
  try {
    els.body.value = JSON.stringify(JSON.parse(text), null, 2);
    setRawHint();
  } catch (error) {
    els.rawHint.textContent = `JSON 解析失败：${error.message}`;
  }
});
els.importBtn.addEventListener('click', () => els.importFile.click());
els.toggleAll.addEventListener('click', () => {
  const anyClosed = collections.some((collection) => !openCollections.has(collection.name));
  for (const collection of collections) {
    if (anyClosed) openCollections.add(collection.name);
    else openCollections.delete(collection.name);
  }
  saveSet(OPEN_COLLECTIONS_KEY, openCollections);
  renderCollections();
});
els.importFile.addEventListener('change', async () => {
  if (!els.importFile.files?.length) return;
  await importFiles(els.importFile.files);
  els.importFile.value = '';
});
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
    return;
  }
  // Cmd/Ctrl+F searches wherever the cursor is: request body or response.
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    const focus = document.activeElement;
    const inBodyPane = focus === els.body || Boolean(focus && focus.closest && focus.closest('[data-pane="body"]'));
    const target = inBodyPane ? els.bodyFind : els.respFind;
    target.focus();
    target.select();
  }
});

addHeaderRow();
syncHeaderCount();
syncParamsFromUrl();
setBodyType('none');
refreshCollections();
