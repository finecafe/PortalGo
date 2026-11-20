#!/usr/bin/env node
/**
 * Cập nhật data/videos.json từ https://camau.gov.vn/media
 *
 * Cách dùng (cần Node 18+, không cần cài thêm thư viện):
 *   node tools/update_videos.mjs                 # tải trang thật và gộp vào data/videos.json
 *   node tools/update_videos.mjs --file a.html   # đọc từ file HTML đã lưu (để thử)
 *   node tools/update_videos.mjs --dry           # chỉ in kết quả, không ghi file
 *
 * Nguyên lý: trang /media liệt kê video theo từng nhóm. Mỗi video có ảnh
 * img.youtube.com/vi/<ID>/..., tiếp theo là tiêu đề và ngày dd/mm/yyyy. Tên nhóm
 * là dòng chữ nằm giữa ngày của video cuối nhóm trước và ảnh video đầu nhóm sau
 * (nhóm đầu tiên không có tên = "Mới nhất"). Video cũ trong data/videos.json được giữ lại.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'videos.json');
const SOURCE = 'https://camau.gov.vn/media';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

const PAGER = /^(trang đầu|trang cuối|«|»|\.\.\.|…|\d+|<|>|‹|›)$/i;
const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const YT_THUMB = /(?:img\.youtube\.com|i\.ytimg\.com)\/vi\/([A-Za-z0-9_-]{11})\//;
const YT_EMBED = /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/;

/** Biến HTML thành dãy token: {t:'vid', id} hoặc {t:'text', v} theo đúng thứ tự trên trang. */
function tokenize(html) {
  html = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const tokens = [];
  const re = /<img\b[^>]*>|<[^>]+>|[^<]+/gi;
  const seenInThisItem = new Set();
  for (const m of html.matchAll(re)) {
    const chunk = m[0];
    if (chunk[0] === '<') {
      if (/^<img\b/i.test(chunk)) {
        const hit = YT_THUMB.exec(chunk);
        if (hit) tokens.push({ t: 'vid', id: hit[1] });
      } else if (/^<(a|iframe)\b/i.test(chunk)) {
        const hit = YT_EMBED.exec(chunk);
        // iframe/link nhúng chỉ dùng để nhận diện ID khi chưa có ảnh đi kèm
        if (hit && !seenInThisItem.has(hit[1])) { seenInThisItem.add(hit[1]); tokens.push({ t: 'embed', id: hit[1] }); }
      }
      continue;
    }
    const v = decode(chunk).replace(/\s+/g, ' ').trim();
    if (v) tokens.push({ t: 'text', v });
  }
  return tokens;
}

function parse(html) {
  const tokens = tokenize(html);
  const out = [];
  let group = '';          // tên nhóm hiện tại ('' = nhóm đầu tiên "Mới nhất")
  let pendingGroup = null; // chữ có thể là tên nhóm kế tiếp
  let cur = null;

  const flush = () => { if (cur && cur.title) out.push(cur); cur = null; };

  for (const tk of tokens) {
    if (tk.t === 'vid') {
      flush();
      if (pendingGroup !== null) { group = pendingGroup; pendingGroup = null; }
      cur = { id: tk.id, title: '', date: '', group };
      continue;
    }
    if (tk.t === 'embed') {
      // Ảnh thumbnail luôn đứng sau iframe/link của chính video đó -> bỏ qua, ảnh sẽ tạo mục
      continue;
    }
    if (!cur) continue;
    const m = DATE.exec(tk.v);
    if (m) { cur.date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; continue; }
    if (PAGER.test(tk.v)) continue;
    if (!cur.title) { cur.title = tk.v; continue; }
    if (cur.date) {
      // chữ xuất hiện sau ngày, trước ảnh kế tiếp => tên nhóm kế tiếp
      const next = tk.v.replace(/\s+/g, ' ');
      if (next.length <= 90) pendingGroup = next;
    }
  }
  flush();
  return out;
}

async function loadHtml() {
  if (fileArg) return readFile(fileArg, 'utf8');
  const res = await fetch(SOURCE, { headers: { 'user-agent': 'Mozilla/5.0 (CaMauPortalApp updater)', 'accept-language': 'vi' } });
  if (!res.ok) throw new Error(`Tải trang thất bại: HTTP ${res.status}`);
  return res.text();
}

function merge(existing, parsed) {
  const cats = [...existing.categories];
  const catByName = new Map(cats.map((c) => [slug(c.name), c]));
  const videos = new Map(existing.videos.map((v) => [v.id, v]));
  let added = 0;
  let updated = 0;

  const ensureCat = (name) => {
    if (!name) return 'moi-nhat';
    const key = slug(name);
    // so khớp lỏng với danh mục đã có (tên trên trang có thể dài hơn tên rút gọn trong app)
    for (const [k, c] of catByName) if (k === key || key.startsWith(k) || k.startsWith(key)) return c.id;
    const c = { id: key || 'khac', name, icon: 'play' };
    cats.push(c);
    catByName.set(key, c);
    return c.id;
  };

  for (const p of parsed) {
    const category = ensureCat(p.group);
    const prev = videos.get(p.id);
    if (!prev) { added++; videos.set(p.id, { id: p.id, title: p.title, date: p.date, category }); continue; }
    // Giữ chuyên mục cũ nếu đã có (video "Mới nhất" sau này sẽ chuyển về nhóm chính thức)
    const next = { ...prev, title: p.title || prev.title, date: p.date || prev.date };
    if (prev.category === 'moi-nhat' && category !== 'moi-nhat') next.category = category;
    if (JSON.stringify(next) !== JSON.stringify(prev)) updated++;
    videos.set(p.id, next);
  }

  return {
    stats: { added, updated, total: videos.size },
    data: {
      updatedAt: new Date().toISOString(),
      source: SOURCE,
      categories: cats,
      videos: [...videos.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    },
  };
}

const html = await loadHtml();
const parsed = parse(html);
if (parsed.length === 0) {
  console.error('Không tìm thấy video nào trong trang. Cấu trúc trang có thể đã đổi - giữ nguyên data/videos.json.');
  process.exit(1);
}
const existing = JSON.parse(await readFile(DATA_FILE, 'utf8'));
const { data, stats } = merge(existing, parsed);

console.log(`Đọc được ${parsed.length} video; thêm mới ${stats.added}, cập nhật ${stats.updated}; tổng ${stats.total}.`);
if (DRY) {
  for (const v of parsed) console.log(` - [${v.group || 'Mới nhất'}] ${v.date} ${v.id} ${v.title.slice(0, 60)}`);
} else {
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Đã ghi', path.relative(process.cwd(), DATA_FILE));
}
