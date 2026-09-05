import fs from 'node:fs';
import path from 'node:path';
import ar from '../client/src/i18n/ar.ts';
import en from '../client/src/i18n/en.ts';

type Dict = Record<string, unknown>;

function flatten(obj: Dict, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      for (const x of flatten(v as Dict, key)) out.add(x);
    } else {
      out.add(key);
    }
  }
  return out;
}

const arKeys = flatten(ar as Dict);
const enKeys = flatten(en as Dict);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = walk(path.resolve('client/src'));
const used = new Set<string>();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /(?<![A-Za-z0-9_$])(?:i18n\.t|t|translate)\(\s*['"]([a-z0-9.]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) used.add(m[1]);
}

const onlyAr = [...arKeys].filter((k) => !enKeys.has(k));
const onlyEn = [...enKeys].filter((k) => !arKeys.has(k));
const missing = [...used].filter((k) => !arKeys.has(k) || !enKeys.has(k)).sort();

console.log('ar keys:', arKeys.size, '| en keys:', enKeys.size);
console.log('used keys:', used.size);
if (onlyAr.length) console.log('ONLY in ar:', onlyAr);
if (onlyEn.length) console.log('ONLY in en:', onlyEn);
if (missing.length) {
  console.log('USED BUT MISSING:', missing);
  process.exit(1);
}
console.log('i18n parity OK');
