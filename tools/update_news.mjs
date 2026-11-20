#!/usr/bin/env node
/**
 * Cập nhật data/news.json (tin tức + du lịch) từ https://camau.gov.vn
 *
 * RSS của Cổng hiện không có bài nào, nên script đọc thẳng các trang chuyên mục:
 *   1. Mỗi trang chuyên mục -> gom link bài có dạng /<chuyen-muc>/<slug>-<ID số>
 *   2. Với bài CHƯA có trong data/news.json -> tải trang bài, lấy tiêu đề, mô tả,
 *      ảnh, ngày đăng từ thẻ meta (og:title, og:description, og:image, ngày dd/mm/yyyy hh:mm)
 *   3. Gộp vào file, giữ tối đa MAX bài mới nhất cho mỗi mục.
 *
 * Dùng:  node tools/update_news.mjs [--dry] [--file trang.html]
 * Cần Node 18+, không cần cài thư viện. Nếu trang không còn khớp, script báo lỗi và KHÔNG ghi đè dữ liệu cũ.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'news.json');
const BASE = process.env.CMP_BASE || 'https://camau.gov.vn';
const MAX = 120;          // số bài giữ lại cho mỗi mục
const MAX_NEW_PER_RUN = 60; // giới hạn số bài mới tải mỗi lần chạy (đỡ nặng máy chủ)

// Các trang chuyên mục cần đọc. kind: 'news' | 'tourism'
const SOURCES = [
  { kind: 'news', url: `${BASE}/` },
  { kind: 'news', url: `${BASE}/tin-tuc-su-kien` },
  { kind: 'news', url: `${BASE}/kinh-te` },
  { kind: 'news', url: `${BASE}/van-hoa-xa-hoi` },
  { kind: 'news', url: `${BASE}/chinh-sach-phap-luat` },
  { kind: 'tourism', url: `${BASE}/du-lich-1` },
];

const CAT_NAMES = {
  'kinh-te': 'Kinh tế',
  'van-hoa-xa-hoi': 'Văn hóa – Xã hội',
  'chinh-sach-phap-luat': 'Chính sách – Pháp luật',
  'tin-tuc-su-kien': 'Tin tức – Sự kiện',
  'tin-moi': 'Tin mới',
  'du-lich': 'Du lịch',
  'du-lich-1': 'Du lịch',
};

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

const UA = 'Mozilla/5.0 (CaMauPortalApp updater)';
const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const clean = (s) => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function get(url) {
  if (fileArg) return readFile(fileArg, 'utf8');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA, 'accept-language': 'vi' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

/** Gom link bài viết trong một trang, theo thứ tự xuất hiện, không trùng. */
export function extractArticleLinks(html) {
  const out = [];
  const seen = new Set();
  const re = /href\s*=\s*["']((?:https?:\/\/(?:www\.)?camau\.gov\.vn)?\/([a-z0-9-]+)\/([a-z0-9-]+?)-(\d{5,8}))\/?(?:[?#][^"']*)?["']/gi;
  for (const m of html.matchAll(re)) {
    const id = m[4];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, cat: m[2], url: `${BASE}/${m[2]}/${m[3]}-${id}` });
  }
  return out;
}

function meta(html, key) {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html);
  if (a) return decode(a[1]).trim();
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i').exec(html);
  return b ? decode(b[1]).trim() : '';
}

/** Ngày đăng -> 'YYYY-MM-DDTHH:mm' (giờ địa phương). */
export function findDate(html) {
  const iso = meta(html, 'article:published_time') || meta(html, 'og:updated_time');
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  const text = clean(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' '));
  m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(text);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}`;
  return '';
}

export function parseArticle(html, link) {
  let title = meta(html, 'og:title');
  if (!title) { const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); title = t ? clean(t[1]) : ''; }
  title = title.replace(/\s*[-|–]\s*(Cổng thông tin.*|Cà Mau.*)$/i, '').trim();
  let image = meta(html, 'og:image');
  if (image && image.startsWith('/')) image = BASE + image;
  const summary = clean(meta(html, 'og:description') || meta(html, 'description')).slice(0, 300);
  return { id: link.id, title, summary, image, date: findDate(html), cat: link.cat, catName: CAT_NAMES[link.cat] || '', url: link.url };
}

async function pool(items, size, fn) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; results[k] = await fn(items[k]).catch((e) => ({ error: String(e.message || e), item: items[k] })); }
  }));
  return results;
}

const existing = JSON.parse(await readFile(DATA_FILE, 'utf8'));
const have = new Set([...existing.news, ...existing.tourism].map((a) => a.id));

// 1) Đọc các trang chuyên mục
const found = { news: new Map(), tourism: new Map() };
const pages = await pool(SOURCES, 3, async (s) => ({ s, html: await get(s.url) }));
let okPages = 0;
for (const p of pages) {
  if (p.error) { console.warn('! không tải được', p.item.url, '-', p.error); continue; }
  okPages++;
  for (const l of extractArticleLinks(p.html)) {
    if (p.s.kind === 'tourism' && !found.tourism.has(l.id)) found.tourism.set(l.id, l);
    if (p.s.kind === 'news' && !found.news.has(l.id) && !found.tourism.has(l.id)) found.news.set(l.id, l);
  }
}
if (okPages === 0) { console.error('Không tải được trang nào - giữ nguyên data/news.json.'); process.exit(1); }

// 2) Tải chi tiết bài mới
const todo = [];
for (const kind of ['news', 'tourism']) for (const l of found[kind].values()) if (!have.has(l.id)) todo.push({ ...l, kind });
const batch = todo.slice(0, MAX_NEW_PER_RUN);
const details = await pool(batch, 4, async (l) => ({ kind: l.kind, a: parseArticle(await get(l.url), l) }));

const add = { news: [], tourism: [] };
let failed = 0;
for (const d of details) {
  if (d.error || !d.a.title) { failed++; continue; }
  add[d.kind].push(d.a);
}

const byDate = (a, b) => (b.date || '').localeCompare(a.date || '') || Number(b.id) - Number(a.id);
const merged = {
  updatedAt: new Date().toISOString(),
  source: BASE,
  news: [...add.news, ...existing.news].sort(byDate).slice(0, MAX),
  tourism: [...add.tourism, ...existing.tourism].sort(byDate).slice(0, MAX),
};

console.log(`Đọc ${okPages}/${SOURCES.length} trang; thấy ${found.news.size} link tin, ${found.tourism.size} link du lịch; bài mới: ${add.news.length} tin, ${add.tourism.length} du lịch; lỗi: ${failed}; còn chờ: ${todo.length - batch.length}.`);
if (failed && failed === batch.length) { console.error('Tất cả bài mới đều lỗi - không ghi file.'); process.exit(1); }
if (DRY) {
  for (const a of [...add.news, ...add.tourism]) console.log(` + ${a.date} [${a.cat}] ${a.title.slice(0, 70)}`);
} else {
  await writeFile(DATA_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log('Đã ghi', path.relative(process.cwd(), DATA_FILE));
}
