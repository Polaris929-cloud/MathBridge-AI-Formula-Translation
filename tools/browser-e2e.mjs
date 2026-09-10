/* 真实浏览器端到端校验（Edge headless）
 *
 * 目的：Node 单测跑得再绿，也可能漏掉「浏览器里脚本没接上 / 按钮点了没反应」
 * 这类装配问题（本次「Export unavailable」事故就是如此）。这里用 Edge headless
 * 打开 index.html 的副本，真实驱动 UI（填内容 → 点导出），把 toast 文案与导出的
 * ByteLength 写进 DOM，再用 --dump-dom 读回来断言。
 *
 * 用法：node tools/browser-e2e.mjs
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execFileSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = resolve(root, '_e2e-check.html');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

if (!EDGE) {
  console.log('SKIP | 未找到 Edge，跳过后端到端浏览器校验');
  process.exit(0);
}

/* 注入的诊断脚本：模拟用户点击「导出 Word」并回收结果 */
const DIAG = String.raw`
<script>
(function () {
  var out = {};
  function dump() {
    var pre = document.createElement('pre');
    pre.id = 'diag-result';
    pre.textContent = 'DIAG' + JSON.stringify(out);
    document.body.appendChild(pre);
    document.title = 'DIAG' + JSON.stringify(out);
  }
  try {
    out.docxBuilder = !!(window.DocxBuilder && window.DocxBuilder.buildUint8);
    out.omml = !!(window.MathML2OMML && window.MathML2OMML.toOMML);
    out.temml = !!(window.temml && window.temml.renderToString);

    /* 拦截真实下载，只捕获 Blob */
    var realClick = HTMLAnchorElement.prototype.click;
    var realCreate = URL.createObjectURL;
    var captured = null;
    HTMLAnchorElement.prototype.click = function () { out.clickedAnchor = true; };
    URL.createObjectURL = function (b) { captured = b; return 'blob:stub'; };

    var input = document.getElementById('input');
    input.value = '由最后一组数据可得电路总电阻为：\n$$R_{总} = \\frac{E}{I} = \\frac{4.2}{0.30} = 14 \\, \\Omega$$\n\n横截面积 $$S = \\frac{\\pi d^{2}}{4} = 3.14 \\times 10^{-8} \\, \\text{m}^2$$';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    out.exportBtnDisabledBefore = document.getElementById('btn-export').disabled;
    out.previewMathNodes = document.querySelectorAll('#preview .math-block, #preview .math-inline').length;
    out.previewErrors = document.querySelectorAll('#preview .math-error').length;
    out.status = (document.getElementById('status') || {}).textContent || '';

    document.getElementById('btn-export').click();

    var toast = document.querySelector('.toast');
    out.toast = toast ? toast.textContent : null;
    out.blobSize = captured ? captured.size : 0;
    out.blobType = captured ? captured.type : null;

    HTMLAnchorElement.prototype.click = realClick;
    URL.createObjectURL = realCreate;
  } catch (e) {
    out.error = String(e && e.message);
  }
  dump();
})();
</script>
`;

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
writeFileSync(tmp, html.replace('</body>', DIAG + '</body>'), 'utf8');

let dom = '';
try {
  dom = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
    '--virtual-time-budget=6000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/'),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  console.log('FAIL | Edge 启动失败：' + e.message);
  unlinkSync(tmp);
  process.exit(1);
}
unlinkSync(tmp);

const m = dom.match(/DIAG(\{[\s\S]*?\})/);
if (!m) {
  console.log('FAIL | 页面未产出诊断结果（诊断脚本未执行）');
  process.exit(1);
}
const r = JSON.parse(m[1]);
console.log('诊断结果：', JSON.stringify(r, null, 2));

let pass = 0, fail = 0;
function ck(name, cond, extra) {
  cond ? (pass++, console.log('PASS |', name))
       : (fail++, console.log('FAIL |', name, extra === undefined ? '' : extra));
}

ck('无运行时异常', !r.error, r.error);
ck('页面加载了 DocxBuilder', r.docxBuilder === true);
ck('页面加载了 MathML2OMML', r.omml === true);
ck('页面加载了 temml', r.temml === true);
ck('输入内容后导出按钮启用', r.exportBtnDisabledBefore === false, String(r.exportBtnDisabledBefore));
ck('预览渲染出公式节点', r.previewMathNodes >= 2, String(r.previewMathNodes));
ck('预览无解析错误', r.previewErrors === 0, String(r.previewErrors));
ck('点击导出生成了 Blob', r.blobSize > 1000, String(r.blobSize));
ck('Blob 类型为 docx',
  typeof r.blobType === 'string' && r.blobType.indexOf('wordprocessingml') !== -1, r.blobType);
ck('触发了下载（a.click 被调用）', r.clickedAnchor === true);
ck('toast 不是英文兜底提示 "Export unavailable"',
  !r.toast || r.toast.indexOf('Export unavailable') === -1, String(r.toast));
ck('toast 为成功提示（含 文档.docx）',
  typeof r.toast === 'string' && r.toast.indexOf('文档.docx') !== -1, String(r.toast));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
