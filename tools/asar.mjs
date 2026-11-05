// Minimal read-only ASAR reader: list the header tree or print one file.
// Usage: node asar.mjs <app.asar> ls [prefix] [limit]
//        node asar.mjs <app.asar> cat <path>
import { open } from 'node:fs/promises';

const [, , file, cmd, ...rest] = process.argv;
if (!file || !cmd) {
  console.error('usage: asar.mjs <app.asar> ls [prefix] [limit] | cat <path>');
  process.exit(2);
}

const fh = await open(file, 'r');

// Header layout: u32 4 | u32 headerPickleSize | u32 jsonPaddedSize | u32 jsonLen | json
const head = Buffer.alloc(16);
await fh.read(head, 0, 16, 0);
const headerPickleSize = head.readUInt32LE(4);
const jsonLen = head.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonLen);
await fh.read(jsonBuf, 0, jsonLen, 16);
const tree = JSON.parse(jsonBuf.toString('utf8'));
const dataBase = 8 + headerPickleSize;

function walk(node, base, out) {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const path = base ? `${base}/${name}` : name;
    if (value.files) {
      out.push({ type: 'dir', path });
      walk(value, path, out);
    } else {
      out.push({ type: 'file', path, size: value.size, offset: value.offset, unpacked: value.unpacked });
    }
  }
  return out;
}

if (cmd === 'ls') {
  const prefix = rest[0] ?? '';
  const limit = Number(rest[1] ?? 60);
  const all = walk(tree, '', []);
  const hit = prefix ? all.filter((e) => e.path === prefix || e.path.startsWith(prefix + '/') || e.path.startsWith(prefix)) : all;
  for (const e of hit.slice(0, limit)) {
    console.log(e.type === 'dir' ? `[dir]  ${e.path}` : `${String(e.size).padStart(10)}  ${e.path}${e.unpacked ? '  (unpacked)' : ''}`);
  }
  console.error(`-- ${hit.length} entries, showed ${Math.min(limit, hit.length)} --`);
} else if (cmd === 'cat') {
  const target = rest[0];
  const all = walk(tree, '', []);
  const entry = all.find((e) => e.type === 'file' && e.path === target);
  if (!entry) {
    console.error(`not found: ${target}`);
    process.exit(1);
  }
  const buf = Buffer.alloc(entry.size);
  await fh.read(buf, 0, entry.size, dataBase + Number(entry.offset));
  process.stdout.write(buf);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}
await fh.close();
