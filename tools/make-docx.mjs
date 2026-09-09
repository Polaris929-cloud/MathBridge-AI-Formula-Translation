/* 生成含原生 OMML 公式的 .docx（WPS / Word 均可原生编辑、下标必缩小）
 *
 * 用法：node tools/make-docx.mjs  <输出路径>
 * 逻辑：每段文本直接写 w:p；每个 display 公式：LaTeX → Temml MathML → M2O.toOMML
 *       → 包成 <m:oMathPara><m:oMath>..</m:oMath></m:oMathPara>（居中）。
 * 产出为标准 OOXML 的 zip（最小部件集），再用系统 zip 打成 .docx。
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const M2O = require('../js/mml2omml.js');
import { readFileSync } from 'fs';
eval(readFileSync(new URL('../assets/vendor/temml.js', import.meta.url), 'utf8') + '; globalThis.__temml = temml;');
const temml = globalThis.__temml;

const outPath = process.argv[2] || path.resolve('report-with-equations.docx');
const workDir = path.join(path.dirname(outPath), '.docx_build');

/* ================= 文档内容 ================= */
/* 段落数组：string = 纯文本段落；{eq: latex} = 居中公式 */
const P = [];
P.push('电阻率测定实验数据处理');
P.push({ text: '根据实验数据与电路分析，采用电流表与定值电阻串联后再与电阻丝并联的电路模型，结合闭合电路欧姆定律及并联分流原理，将数据转化为 1/I 与 1/l 的线性关系，通过拟合求得斜率，并利用螺旋测微器测得的直径计算电阻率。', center: false });
P.push({ text: '由最后一组数据（l = ∞，I = 0.30 A）可得电路总电阻（不含电阻丝）为：', center: false });
P.push({ eq: 'R_{总} = \\frac{E}{I} = \\frac{4.2}{0.30} = 14 \\, \\Omega' });
P.push({ text: '已知电流表内阻 R_A = 0.20 Ω，定值电阻 R = 4.8 Ω，则电源内阻：', center: false });
P.push({ eq: 'r = 14 - (0.20 + 4.8) = 9 \\, \\Omega' });
P.push({ text: '前四组数据经转换为国际单位后，作 1/I − 1/l 图，拟合直线斜率：', center: false });
P.push({ eq: 'b \\approx 75.5 \\, \\text{A}^{-1} \\cdot \\text{cm} = 0.755 \\, \\text{A}^{-1} \\cdot \\text{m}' });
P.push({ text: '螺旋测微器测得电阻丝直径 d = 0.200 mm = 2.00 × 10⁻⁴ m，横截面积：', center: false });
P.push({ eq: 'S = \\frac{\\pi d^2}{4} = \\frac{3.14 \\times (2.00 \\times 10^{-4})^2}{4} = 3.14 \\times 10^{-8} \\, \\text{m}^2' });

/* ================= OMML 包裹 ================= */
function displayOMML(latex) {
  const mathml = temml.renderToString(latex, { displayMode: true, throwOnError: false });
  if (mathml.indexOf('ParseError') !== -1) throw new Error('Temml ParseError: ' + latex);
  const inner = M2O.toOMML(mathml);
  return '<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath>' +
    inner + '</m:oMath></m:oMathPara>';
}

function runXml(s) {
  return '<w:r><w:t xml:space="preserve">' + esc(s) + '</w:t></w:r>';
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function para(xml) {
  return '<w:p><w:pPr><w:rPr><w:rFonts w:ascii="Cambria" w:eastAsia="宋体" w:hAnsi="Cambria"/><w:sz w:val="24"/></w:rPr></w:pPr>' + xml + '</w:p>';
}

const bodyParts = P.map((item) => {
  if (typeof item === 'string') {
    return para('<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:eastAsia="黑体" w:hAnsi="Cambria"/><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">' + esc(item) + '</w:t></w:r>');
  }
  if (item.eq) {
    return para(displayOMML(item.eq));
  }
  // 正文段落，可按需两端对齐
  return para(runXml(item.text));
});

const w =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<w:body>' + bodyParts.join('') +
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
  '</w:body></w:document>';

/* ================= 组装 zip 部件 ================= */
function xmlTop() { return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'; }

const contentTypes =
  xmlTop() +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>';

const rels =
  xmlTop() +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const docRels =
  xmlTop() +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

const styles =
  xmlTop() +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '</w:styles>';

if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
mkdirSync(path.join(workDir, '_rels'), { recursive: true });
mkdirSync(path.join(workDir, 'word'), { recursive: true });
mkdirSync(path.join(workDir, 'word', '_rels'), { recursive: true });

writeFileSync(path.join(workDir, '[Content_Types].xml'), contentTypes, 'utf8');
writeFileSync(path.join(workDir, '_rels', '.rels'), rels, 'utf8');
writeFileSync(path.join(workDir, 'word', 'document.xml'), w, 'utf8');
writeFileSync(path.join(workDir, 'word', '_rels', 'document.xml.rels'), docRels, 'utf8');
writeFileSync(path.join(workDir, 'word', 'styles.xml'), styles, 'utf8');

/* 用系统 zip 打包（避免引入 JS zip 依赖）；Windows Compress-Archive 只认 .zip 扩展名 */
import { renameSync } from 'fs';
const zipCmd = process.platform === 'win32' ? 'powershell' : 'zip';
const tmpZip = outPath.replace(/\.docx$/i, '') + '_pkg.zip';
if (zipCmd === 'zip') {
  execFileSync('zip', ['-r', '-q', tmpZip, '.'], { cwd: workDir });
} else {
  const ps = 'Compress-Archive -Path "*" -DestinationPath "' + tmpZip + '" -Force';
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { cwd: workDir });
}
renameSync(tmpZip, outPath);
console.log('DOCX written:', outPath);
console.log('document.xml size:', w.length, 'chars; equations:', P.filter(p => p && p.eq).length);
