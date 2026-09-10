/* 页面装配（wiring）测试 —— 守住「脚本/元素/文案 没接上」这类静默失效。
 *
 * 背景：曾出现「点导出 Word 提示 Export unavailable」的线上事故，
 * 根因是 index.html 漏了 <script src="js/docx.js">，导致 window.DocxBuilder
 * 永远 undefined。单测直接单测模块时不会暴露这种问题，因此这里按 index.html
 * 真实的加载顺序在 VM 沙箱里跑一遍，模拟浏览器环境做端到端装配校验。
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) {
  cond ? (pass++, console.log('PASS |', name))
       : (fail++, console.log('FAIL |', name, extra === undefined ? '' : extra));
}

/* ---------- 1. 抽出 <script src> 顺序 ---------- */
const scriptSrcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
console.log('scripts:', scriptSrcs.join(' -> '));

ck('index.html 至少加载 4 个脚本', scriptSrcs.length >= 4, scriptSrcs.length);

/* ---------- 2. 每个被引用的脚本文件必须真实存在 ---------- */
for (const src of scriptSrcs) {
  ck(`脚本文件存在：${src}`, existsSync(resolve(root, src)));
}

/* ---------- 3. 关键脚本存在且顺序正确 ---------- */
const at = (s) => scriptSrcs.indexOf(s);
ck('加载了 js/docx.js（导出 Word 依赖）', at('js/docx.js') !== -1);
ck('加载了 js/mml2omml.js', at('js/mml2omml.js') !== -1);
ck('加载了 js/app.js', at('js/app.js') !== -1);
ck('docx.js 在 mml2omml.js 之后', at('js/docx.js') > at('js/mml2omml.js'), `idx docx=${at('js/docx.js')} mml=${at('js/mml2omml.js')}`);
ck('docx.js 在 app.js 之前', at('js/docx.js') < at('js/app.js') && at('js/docx.js') !== -1, `idx docx=${at('js/docx.js')} app=${at('js/app.js')}`);
ck('app.js 是最后一个脚本', at('js/app.js') === scriptSrcs.length - 1, `idx app=${at('js/app.js')}/${scriptSrcs.length - 1}`);

/* ---------- 4. 按真实顺序在沙箱里跑，校验全局对象装配 ---------- */
const sandbox = { console, Math, JSON, Date, String, Number, Boolean, Array, Object, RegExp, Error, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent };
sandbox.self = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

let loadErr = null;
const loaded = [];
for (const src of scriptSrcs) {
  if (src === 'js/app.js') break; // app.js 需要真实 DOM，沙箱不加载
  try {
    vm.runInContext(readFileSync(resolve(root, src), 'utf8'), ctx, { filename: src });
    loaded.push(src);
  } catch (e) { loadErr = `${src}: ${e.message}`; break; }
}
ck('非 DOM 脚本全部可加载', loadErr === null, loadErr);

ck('沙箱内 window.temml 可用', typeof sandbox.temml === 'object' && typeof sandbox.temml.renderToString === 'function');
ck('沙箱内 window.MathML2OMML 可用', sandbox.MathML2OMML && typeof sandbox.MathML2OMML.toOMML === 'function');
ck('沙箱内 window.DocxBuilder 可用 ← 本次线上事故的回归点', sandbox.DocxBuilder && typeof sandbox.DocxBuilder.buildDocx === 'function' && typeof sandbox.DocxBuilder.buildUint8 === 'function');

/* 端到端：按 index.html 的加载顺序跑一次真实导出，必须产出合法 zip */
let built = null, buildErr = null;
try {
  built = sandbox.DocxBuilder.buildUint8([
    { type: 'text', text: '由最后一组数据可得电路总电阻为：' },
    { type: 'math', tex: 'R_{总} = \\frac{E}{I} = \\frac{4.2}{0.30} = 14 \\, \\Omega', displayMode: true, smart: true },
    { type: 'text', text: '其中电流' },
    { type: 'math', tex: 'I = 0.30 \\, \\text{A}', displayMode: false, smart: true },
    { type: 'text', text: '，电阻丝横截面积为' },
    { type: 'math', tex: 'S = 3.14 \\times 10^{-8}', displayMode: false, smart: true },
    { type: 'text', text: '。' },
  ]);
} catch (e) { buildErr = e.message; }

ck('端到端导出无异常', buildErr === null, buildErr);
ck('端到端产物是合法 zip（PK 头 + EOCD）',
  !!built && built[0] === 0x50 && built[1] === 0x4b && built.length > 500,
  built ? `len=${built.length}` : 'null');

/* docx 内容必须真的含原生 OMML 公式（而不是回退成 LaTeX 纯文本），
 * 且块级公式必须包在 <w:p> 内 —— 裸 <m:oMathPara> 会让 Word 直接拒开文件
 * （用户实测「导出后公式全消失」的根因），也不允许出现顺序敏感的 <m:scr>。 */
const asLatin1 = built ? Array.from(built, (c) => String.fromCharCode(c)).join('') : '';
const displayCount = (asLatin1.match(/<m:oMathPara>/g) || []).length;
const inlineCount = (asLatin1.match(/<m:oMath>/g) || []).length - displayCount;
ck('docx 内含原生 OMML（m:oMath / m:sSub）',
  asLatin1.includes('<m:oMathPara>') && asLatin1.includes('<m:oMath>') && asLatin1.includes('m:sSub'));
ck('块级公式全部包在 <w:p> 内（Word 兼容性关键）',
  displayCount > 0 &&
  (asLatin1.match(/<\/w:pPr><m:oMathPara>/g) || []).length === displayCount &&
  (asLatin1.match(/<\/m:oMathPara><\/w:p>/g) || []).length === displayCount);
ck('m:rPr 不含 <m:scr>（schema 顺序敏感且冗余）', !asLatin1.includes('<m:scr'));
/* 行内公式必须嵌在文字段落里（紧凑排版），不得自己独占段落 */
ck('行内公式紧跟文字 run、同段排布', /<\/w:r><m:oMath>/.test(asLatin1));
ck('行内公式数量正确（不额外占段落）', inlineCount === 2, `display=${displayCount} inline=${inlineCount}`);

/* ---------- 5. app.js 引用的 DOM id 必须在 index.html 里存在 ---------- */
const appJs = readFileSync(resolve(root, 'js/app.js'), 'utf8');
const ids = [...appJs.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)].map((m) => m[1]);
const uniqueIds = [...new Set(ids)];
for (const id of uniqueIds) {
  ck(`app.js 引用的 #${id} 存在于 index.html`, new RegExp(`id="${id}"`).test(html));
}

/* ---------- 6. index.html 的 data-i18n 键在两种语言里都有 ---------- */
const i18nKeys = [...new Set([...html.matchAll(/data-i18n(?:-placeholder)?="([\w-]+)"/g)].map((m) => m[1]))];
for (const key of i18nKeys) {
  const count = (appJs.match(new RegExp(`(^|[\\s{,])${key}\\s*:`, 'g')) || []).length;
  ck(`i18n 键 ${key} 有中英两份`, count >= 2, `found ${count}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
