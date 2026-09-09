/* 集成冒烟：模拟 app.js parseSegments + DocxBuilder，对真实 demo 内容导出并校验 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

eval(readFileSync(new URL('../assets/vendor/temml.js', import.meta.url), 'utf8') + '; globalThis.temml = temml;');
globalThis.MathML2OMML = require('../js/mml2omml.js');
const SmartMath = require('../js/smartmath.js');
const DocxBuilder = require('../js/docx.js');

/* 复刻 app.js 的 FORMULA_RE + parseDelimited + parseSegments */
const FORMULA_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
function parseDelimited(src) {
  const segments = []; let last = 0; FORMULA_RE.lastIndex = 0; let m;
  while ((m = FORMULA_RE.exec(src)) !== null) {
    if (m.index > last) segments.push({ type: 'text', text: src.slice(last, m.index) });
    const tex = m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] != null ? m[3] : m[4];
    segments.push({ type: 'math', tex, displayMode: m[1] != null || m[2] != null });
    last = m.index + m[0].length;
  }
  if (last < src.length) segments.push({ type: 'text', text: src.slice(last) });
  return segments;
}
function parseSegments(src) {
  const merged = (src.indexOf('$$') === -1 && src.indexOf('\\[') === -1) ? SmartMath.mergeSoftLines(src) : src;
  const raw = parseDelimited(merged);
  const out = [];
  raw.forEach(seg => {
    if (seg.type !== 'text') { out.push(seg); return; }
    SmartMath.detect(seg.text).forEach(s => {
      if (s.type === 'math') out.push({ type: 'math', tex: s.tex, displayMode: false, smart: true });
      else out.push(s);
    });
  });
  return out;
}

/* zh demo（含 $$ 独立公式、$ 行内、智能识别文本） */
const demo = '求解二次方程 $ax^2 + bx + c = 0$ 时：\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n由最后一组数据可得：\nR总=EI=4.20.30=14Ω\n横截面积：\nS=πd24=3.14×(2.00×10−4)24=3.14×10−8m2';

const segs = parseSegments(demo);
const mathCount = segs.filter(s => s.type === 'math').length;
console.log('segments total:', segs.length, '| math:', mathCount);
console.log('math sample texs:', segs.filter(s => s.type === 'math').map(s => s.tex.slice(0, 30)).join(' || '));

const bytes = DocxBuilder.buildUint8(segs);
writeFileSync('tools/_demo_docx.docx', Buffer.from(bytes));
console.log('docx bytes:', bytes.length);

import { execFileSync } from 'child_process';
import { unlinkSync } from 'fs';
// 用 python 校验 zip 后清理临时文件
const py = "import zipfile,xml.dom.minidom as m,sys\nz=zipfile.ZipFile('tools/_demo_docx.docx')\nfor p in z.namelist(): m.parseString(z.read(p))\nd=z.read('word/document.xml').decode('utf-8')\nsys.exit(0 if d.count('<m:oMathPara>')>=4 and d.count('<m:rad>')>=1 else 1)\n";
execFileSync('python', ['-c', py], { stdio: 'inherit' });
unlinkSync('tools/_demo_docx.docx');
console.log('cleaned temp docx');
