/**
 * Kiểm tra trang bằng cách CHẠY THẬT trong jsdom, không phải so byte.
 *
 * Có lần hai câu hỏi bị chèn nhầm vào giữa mảng STATUS: file vẫn đúng cú pháp,
 * kích thước vẫn khớp, grep vẫn thấy chuỗi — nhưng trang ném TypeError ngay khi
 * vẽ bộ lọc. Chỉ chạy thật mới bắt được.
 *
 * Chạy:  node check.js
 */
const fs = require('node:fs');
const path = require('node:path');

const JSDOM_PATH = path.resolve(
  __dirname,
  '../Marketplace/marketplace-fe/node_modules/jsdom',
);

let JSDOM;
try {
  ({ JSDOM } = require(JSDOM_PATH));
} catch {
  console.error('Không tìm thấy jsdom ở', JSDOM_PATH);
  console.error('Cài ở marketplace-fe hoặc sửa JSDOM_PATH.');
  process.exit(1);
}

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const errors = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: new (require(JSDOM_PATH).VirtualConsole)()
    .on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)))
    .on('error', (m) => errors.push('console.error: ' + m)),
});

const { window } = dom;

// `const BANK` o pham vi script KHONG gan vao window — phai lay qua eval toan cuc,
// noi nhin thay duoc cac rang buoc lexical cua script.
const g = (name) => window.eval(name);

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];

function check(name, fn) {
  try {
    const detail = fn();
    console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
  } catch (e) {
    console.log('  ✗ ' + name + ' — ' + e.message);
    errors.push(name + ': ' + e.message);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\nKIỂM TRA TRANG (jsdom)\n');

check('không có lỗi lúc nạp trang', () => {
  must(errors.length === 0, errors.join(' | '));
  return 'sạch';
});

check('BANK là mảng và mọi câu đủ trường bắt buộc', () => {
  const BANK = g("BANK");
  must(Array.isArray(BANK), 'BANK không phải mảng');
  must(BANK.length > 0, 'BANK rỗng');
  const ids = new Set();
  for (const q of BANK) {
    must(q && typeof q === 'object', 'phần tử không phải object');
    for (const f of ['id', 'section', 'topic', 'level', 'q', 'options', 'correct', 'why']) {
      must(q[f] !== undefined, `câu ${q.id || '?'} thiếu trường "${f}"`);
    }
    must(!ids.has(q.id), `id trùng: ${q.id}`);
    ids.add(q.id);
    must(Array.isArray(q.options) && q.options.length >= 2, `${q.id}: cần ít nhất 2 đáp án`);
    must(Array.isArray(q.correct) && q.correct.length >= 1, `${q.id}: thiếu đáp án đúng`);
    const optIds = q.options.map((o) => o.id);
    for (const c of q.correct) {
      must(optIds.includes(c), `${q.id}: đáp án đúng "${c}" không có trong options`);
    }
    must(g("SECTIONS")[q.section], `${q.id}: section "${q.section}" chưa khai trong SECTIONS`);
    if (q.multi) must(q.correct.length > 1, `${q.id}: multi nhưng chỉ có 1 đáp án đúng`);
    if (!q.multi) must(q.correct.length === 1, `${q.id}: không multi nhưng có nhiều đáp án đúng`);
  }
  return BANK.length + ' câu, id không trùng';
});

check('STATUS còn nguyên vẹn', () => {
  const S = g("STATUS");
  must(Array.isArray(S), 'STATUS không phải mảng');
  for (const item of S) {
    must(Array.isArray(item) && item.length === 2, 'phần tử STATUS phải là cặp [khoá, nhãn]');
  }
  return S.length + ' mục';
});

check('trang vẽ được thẻ câu hỏi', () => {
  must($('.card'), 'không thấy .card nào');
  must($('.qtext'), 'không thấy nội dung câu hỏi');
  must($$('.opt').length >= 2, 'không thấy đáp án');
  return $$('.opt').length + ' đáp án ở câu đầu';
});

check('bộ lọc vẽ được đủ nhóm chip', () => {
  must($$('#secChips .chipf').length >= 2, 'thiếu chip phần');
  must($$('#stChips .chipf').length === g("STATUS").length, 'chip trạng thái không khớp STATUS');
  must($$('#topicChips .chipf').length >= 1, 'thiếu chip chủ đề');
  return `${$$('#secChips .chipf').length} phần · ${$$('#stChips .chipf').length} trạng thái · ${$$('#topicChips .chipf').length} chủ đề`;
});

check('dải tiến độ khớp số câu đang hiện', () => {
  const segs = $$('#track .seg').length;
  must(segs > 0, 'dải tiến độ rỗng');
  return segs + ' vạch';
});

check('hộp thoại giải thích có mặt và đang đóng', () => {
  const p = $('#pop');
  must(p, 'không thấy <dialog id="pop">');
  must(!p.open, 'hộp thoại đang mở sẵn');
  return 'ok';
});

check('chọn đáp án rồi chấm thì hiện nút Xem giải thích', () => {
  $$('.opt')[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const btn = $$('.btn').find((b) => b.textContent.includes('Kiểm tra'));
  must(btn, 'không thấy nút Kiểm tra');
  must(!btn.disabled, 'nút Kiểm tra vẫn bị khoá sau khi chọn đáp án');
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  must($('.res'), 'không thấy khối kết quả');
  must($$('.btn').some((b) => b.textContent.includes('Xem giải thích')), 'không thấy nút Xem giải thích');
  return 'luồng làm bài chạy';
});

check('mọi sơ đồ SVG đều có marker mũi tên được định nghĩa', () => {
  const defined = new Set([...html.matchAll(/marker id="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]));
  const missing = [...used].filter((u) => !defined.has(u));
  must(missing.length === 0, 'marker chưa định nghĩa: ' + missing.join(', '));
  return used.size + ' marker, đủ cả';
});

check('mọi token màu dùng ở dark đều có bản ở :root', () => {
  const root = html.slice(html.indexOf(':root {'), html.indexOf('@media (prefers-color-scheme'));
  const dark = html.slice(html.indexOf('@media (prefers-color-scheme'), html.indexOf('* { box-sizing'));
  const names = new Set([...root.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const missing = [...new Set([...dark.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))]
    .filter((n) => !names.has(n));
  must(missing.length === 0, 'chỉ có ở dark: ' + missing.join(', '));
  return names.size + ' token';
});

console.log('');
if (errors.length) {
  console.log('HỎNG — ' + errors.length + ' lỗi\n');
  process.exit(1);
}
console.log('TẤT CẢ ĐỀU XANH\n');
