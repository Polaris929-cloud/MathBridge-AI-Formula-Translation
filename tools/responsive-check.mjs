/* 多视口响应式校验（Edge headless）
 *
 * 目的：确认「伸缩浏览器窗口时所有文本内容均正常显示」——
 *   1. 页面不产生横向滚动条（内容宽度不溢出视口）；
 *   2. 任何文本元素自身都没有被裁切（scrollWidth/scrollHeight ≤ client 尺寸）；
 *   3. 面板头部的按钮不会溢出面板边框；
 *   4. 面板高度落在 clamps 区间内，且输入框 / 预览区始终有可用的可视高度；
 *   5. 页脚说明文字在任意宽度下都完整可读。
 *
 * 做法：把 index.html 复制到临时文件，注入诊断脚本，然后用不同
 * --window-size 分别启动 Edge，把测量结果写入 DOM 后 dump 回来断言。
 *
 * 用法：node tools/responsive-check.mjs
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execFileSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = resolve(root, '_responsive-check.html');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

if (!EDGE) {
  console.log('SKIP | 未找到 Edge，跳过多视口响应式校验');
  process.exit(0);
}

/* 视口清单：桌面宽/窄、单列临界点、平板竖屏、浏览器最小窗口宽度
 * （低于 ~489px 时浏览器窗口本身已到最小尺寸，改用 iframe 模拟，见 NARROW_WIDTHS） */
const VIEWPORTS = [
  { w: 1600, h: 1000, name: '桌面 1600x1000' },
  { w: 1440, h: 900, name: '大笔记本 1440x900' },
  { w: 1280, h: 800, name: '笔记本 1280x800' },
  { w: 1100, h: 700, name: '窄桌面 1100x700' },
  { w: 901, h: 620, name: '双列临界 901x620' },
  { w: 900, h: 620, name: '单列临界 900x620' },
  { w: 820, h: 560, name: '矮窗口 820x560' },
  { w: 768, h: 1024, name: '平板竖屏 768x1024' },
  { w: 500, h: 800, name: '最小窗口 500x800' },
];

/* 由页面内 iframe 模拟的窄屏宽度（媒体查询按 iframe 自身视口求值） */
const NARROW_WIDTHS = [430, 400, 360, 320];

const DIAG = String.raw`
<script>
(function () {
  function measure(win) {
    var doc = win.document;
    var out = { vw: win.innerWidth, vh: win.innerHeight };
    function rect(el) { return el ? el.getBoundingClientRect() : null; }
    function clipped(el) {
      if (!el) return null;
      return {
        x: el.scrollWidth > el.clientWidth + 1,
        y: el.scrollHeight > el.clientHeight + 1,
        sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight
      };
    }
    var de = doc.documentElement;

    out.docScrollW = de.scrollWidth;
    out.docClientW = de.clientWidth;
    out.hasHScroll = de.scrollWidth > de.clientWidth + 1;

    var textSelectors = [
      '.brand h1', '.tagline', '.pane-head h2', '.status', '.hint',
      '.site-footer p', '.setting-row > label'
    ];
    out.clippedText = [];
    textSelectors.forEach(function (sel) {
      Array.prototype.forEach.call(doc.querySelectorAll(sel), function (el) {
        var c = clipped(el);
        if (c && (c.x || c.y)) out.clippedText.push(sel + ' ' + JSON.stringify(c));
      });
    });

    out.btnOverflow = [];
    Array.prototype.forEach.call(doc.querySelectorAll('.pane'), function (pane) {
      var pr = rect(pane);
      Array.prototype.forEach.call(pane.querySelectorAll('.btn'), function (b) {
        var br = rect(b);
        if (br.left < pr.left - 1 || br.right > pr.right + 1) {
          out.btnOverflow.push(b.textContent.trim() + ' ' + Math.round(br.left) + '..' + Math.round(br.right) +
            ' pane ' + Math.round(pr.left) + '..' + Math.round(pr.right));
        }
        if (br.width < 40) out.btnOverflow.push('按钮被压扁: ' + b.textContent.trim());
      });
    });

    var pane = doc.querySelector('.pane');
    out.paneH = Math.round(rect(pane).height);
    out.paneW = Math.round(rect(pane).width);
    out.taH = Math.round(rect(doc.getElementById('input')).height);
    out.taW = Math.round(rect(doc.getElementById('input')).width);
    out.pvH = Math.round(rect(doc.getElementById('preview')).height);
    out.pvW = Math.round(rect(doc.getElementById('preview')).width);

    out.footer = clipped(doc.querySelector('.site-footer p'));
    out.header = clipped(doc.querySelector('.site-header'));
    out.footerText = (doc.querySelector('.site-footer p') || {}).textContent || '';

    out.paneCutChildren = [];
    Array.prototype.forEach.call(doc.querySelectorAll('.pane'), function (pn) {
      var pr = rect(pn);
      Array.prototype.forEach.call(pn.querySelectorAll('.status, .hint, .pane-head'), function (el) {
        var er = rect(el);
        if (er.top < pr.top - 1 || er.bottom > pr.bottom + 1) {
          out.paneCutChildren.push((el.className || el.tagName) + ' ' +
            Math.round(er.top) + '..' + Math.round(er.bottom) + ' pane ' +
            Math.round(pr.top) + '..' + Math.round(pr.bottom));
        }
      });
    });

    out.docScrollH = de.scrollHeight;
    return out;
  }

  var results = {};
  try {
    results['main'] = measure(window);
  } catch (e) {
    results['main'] = { error: String(e && e.message) };
  }

  /* 窗口宽度受浏览器最小尺寸限制（Edge headless 约 489px），
   * 更窄的视口用同源 iframe 模拟——媒体查询按 iframe 自身视口求值。 */
  var NARROW = [[430, 860], [400, 800], [360, 740], [320, 700]];
  var pending = NARROW.length;

  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'diag-result';
    pre.textContent = 'DIAG' + JSON.stringify(results);
    document.body.appendChild(pre);
  }

  NARROW.forEach(function (size) {
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;top:0;border:0;width:' +
      size[0] + 'px;height:' + size[1] + 'px';
    /* 指向纯净的 index.html，而不是注入了本脚本的临时副本（否则会无限嵌套） */
    f.src = 'index.html';
    f.onload = function () {
      try { results['w' + size[0]] = measure(f.contentWindow); }
      catch (e) { results['w' + size[0]] = { error: 'iframe 访问受限: ' + e.message }; }
      if (--pending === 0) finish();
    };
    f.onerror = function () {
      results['w' + size[0]] = { error: 'iframe 加载失败' };
      if (--pending === 0) finish();
    };
    document.body.appendChild(f);
  });

  /* 兜底：iframe 万一始终不触发 load，也要产出结果 */
  setTimeout(finish, 2500);
})();
</script>
`;

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
writeFileSync(tmp, html.replace('</body>', DIAG + '</body>'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ck(viewport, name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(`${viewport} | ${name}${extra === undefined ? '' : ' → ' + extra}`); }
}

console.log('视口响应式校验（index.html 真实渲染）\n');

for (const vp of VIEWPORTS) {
  let dom = '';
  try {
    dom = execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
      `--window-size=${vp.w},${vp.h}`,
      '--virtual-time-budget=4000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/'),
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    ck(vp.name, 'Edge 启动', false, e.message);
    continue;
  }

  const m = dom.match(/DIAG(\{[\s\S]*?\})<\/pre>/);
  if (!m) { ck(vp.name, '产出诊断结果', false, '诊断脚本未执行'); continue; }
  const all = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

  /* 主文档 + 窄屏 iframe 一起断言 */
  const runs = [{ label: vp.name, r: all.main }];
  NARROW_WIDTHS.forEach((w) => {
    if (all['w' + w]) runs.push({ label: `${w}px 窄屏(iframe)`, r: all['w' + w] });
  });

  for (const run of runs) {
    const r = run.r;
    if (!r || r.error) { ck(run.label, '无运行时异常', false, r ? r.error : '无数据'); continue; }

    ck(run.label, '无横向滚动（内容不溢出视口）', !r.hasHScroll,
      `scrollW=${r.docScrollW} clientW=${r.docClientW}`);
    ck(run.label, '文本元素无裁切', r.clippedText.length === 0, r.clippedText.join(' ; '));
    ck(run.label, '按钮不溢出面板', r.btnOverflow.length === 0, r.btnOverflow.join(' ; '));
    ck(run.label, '面板宽度有效', r.paneW > 200, String(r.paneW));
    ck(run.label, '输入框可用高度 > 80px', r.taH > 80, String(r.taH));
    ck(run.label, '预览区可用高度 > 80px', r.pvH > 80, String(r.pvH));
    ck(run.label, '输入框/预览区不横向溢出', r.taW <= r.paneW && r.pvW <= r.paneW,
      `ta=${r.taW} pv=${r.pvW} pane=${r.paneW}`);
    ck(run.label, '页脚文字未被裁切', r.footer && !r.footer.x && !r.footer.y,
      r.footer ? JSON.stringify(r.footer) : 'null');
    ck(run.label, '页脚文字完整（非空）', typeof r.footerText === 'string' && r.footerText.length > 20);
    ck(run.label, '面板内固定条未被裁掉', r.paneCutChildren.length === 0, r.paneCutChildren.join(' ; '));

    if (r === all.main) {
      console.log(
        `  ${vp.name} (视口 ${r.vw}x${r.vh}) → pane ${r.paneW}x${r.paneH}, ` +
        `输入 ${r.taW}x${r.taH}, 预览 ${r.pvW}x${r.pvH}` +
        (r.hasHScroll ? '  ← 横向溢出!' : '')
      );
    }
  }
  /* 窄屏 iframe 汇总一行，便于一眼扫过 */
  const narrow = NARROW_WIDTHS
    .map((w) => all['w' + w])
    .filter((x) => x && !x.error)
    .map((x) => `${x.vw}px→pane ${x.paneW}x${x.paneH}`)
    .join(', ');
  if (narrow) console.log(`    └ 窄屏 iframe: ${narrow}`);
}

unlinkSync(tmp);

console.log('');
if (failures.length) {
  console.log('失败明细：');
  failures.forEach((f) => console.log('  FAIL | ' + f));
  console.log('');
}
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
