#!/usr/bin/env node
/** Gom các file web của app vào thư mục www/ (dùng cho GitHub Pages và đóng gói APK). */
import { cp, rm, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'www');
const ITEMS = ['index.html', 'player.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'data', 'assets', 'icons'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const it of ITEMS) await cp(path.join(ROOT, it), path.join(OUT, it), { recursive: true });
// CMP_REMOTE_BASE (tuỳ chọn): địa chỉ GitHub Pages để bản APK tự lấy dữ liệu mới, ví dụ https://tenban.github.io/camau-portal/
const remote = (process.env.CMP_REMOTE_BASE || '').trim();
if (remote) {
  if (!/^https:\/\/.+\/$/.test(remote)) { console.error('CMP_REMOTE_BASE phải bắt đầu bằng https:// và kết thúc bằng /'); process.exit(1); }
  await writeFile(path.join(OUT, 'js', 'config.js'), `window.CMP_REMOTE_BASE = ${JSON.stringify(remote)};\n`, 'utf8');
  console.log('Nguồn dữ liệu từ xa:', remote);
}
console.log('Đã tạo', path.relative(process.cwd(), OUT) || OUT, '(' + ITEMS.length + ' mục)');
