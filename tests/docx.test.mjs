/* docx.js 浏览器端打包器测试：Node 内产出 zip 字节，解包校验结构与 OMML */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

// 组装 Node 全局，模拟浏览器加载顺序
eval(readFileSync(new URL('../assets/vendor/temml.js', import.meta.url), 'utf8') + '; globalThis.temml = temml;');
globalThis.MathML2OMML = require('../js/mml2omml.js');
const DocxBuilder = require('../js/docx.js');

/* 模拟 parseSegments 输出（正文 + 公式混排） */
const segments = [
  { type: 'text', text: '由最后一组数据可得电路总电阻为：' },
  { type: 'math', tex: 'R_{总} = \\frac{E}{I} = \\frac{4.2}{0.30} = 14 \\, \\Omega', displayMode: true, smart: true },
  { type: 'text', text: '横截面积：' },
  { type: 'math', tex: 'S = \\frac{\\pi d^2}{4} = \\frac{3.14 \\times (2.00 \\times 10^{-4})^2}{4} = 3.14 \\times 10^{-8} \\, \\text{m}^2', displayMode: true, smart: true }
];

const bytes = DocxBuilder.buildUint8(segments);
const outPath = 'tools/_docxjs_out.docx';
writeFileSync(outPath, Buffer.from(bytes));
console.log('built bytes:', bytes.length);

let pass = 0, fail = 0;
function ck(n, c, extra) { c ? (pass++, console.log('PASS |', n)) : (fail++, console.log('FAIL |', n, extra || '')); }

const b = bytes;
ck('产出非空且含 PK 头', b.length > 100 && b[0] === 0x50 && b[1] === 0x4b);
ck('含 EOCD 结束签名(末尾22字节处 PK 05 06)',
  b[b.length - 22] === 0x50 && b[b.length - 21] === 0x4b &&
  b[b.length - 20] === 0x05 && b[b.length - 19] === 0x06);

console.log('\n' + pass + '/' + (pass + fail) + ' (基础字节检查)');

/* 用 python 做最终 zip/XML 校验后清理，避免遗留临时文件 */
import { execFileSync } from 'child_process';
import { unlinkSync } from 'fs';
const py =
  "import zipfile,xml.dom.minidom as m,sys\n" +
  "z=zipfile.ZipFile('" + outPath + "')\n" +
  "for p in z.namelist(): m.parseString(z.read(p))\n" +
  "d=z.read('word/document.xml').decode('utf-8')\n" +
  "print('python: parts_OK XML_OK oMathPara=', d.count('<m:oMathPara>'), 'sSub=', d.count('<m:sSub>'))\n" +
  "sys.exit(0 if d.count('<m:oMathPara>')>=2 and d.count('<m:sSub>')>=1 else 1)\n";
execFileSync('python', ['-c', py], { stdio: 'inherit' });
unlinkSync(outPath);
console.log('cleaned temp docx');
