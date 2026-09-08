/* Bare-LaTeX recognition tests — 用户从 AI 复制「无 $ 定界符 LaTeX 源码」的场景 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SmartMath = require('../js/smartmath.js');
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../assets/vendor/temml.js', import.meta.url), 'utf8');
eval(src + '; globalThis.__temml = temml;');
const temml = globalThis.__temml;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS |', name); }
  else { fail++; console.log('FAIL |', name, extra ? '— ' + extra : ''); }
}

/* 用户 test.docx 中出现的裸 LaTeX 真实行 */
const BARE = {
  'wholeRow': 'R_{\\text{总}} = \\frac{E}{I} = \\frac{4.2}{0.30} = 14 \\, \\Omega',
  'embedded': '由最后一组数据（l = \\infty，I = 0.30 \\, \\text{A}）可得电路总电阻（不含电阻丝）为：',
  'innerR': '已知电流表内阻 R_A = 0.20 \\, \\Omega，定值电阻 R = 4.8 \\, \\Omega，则电源内阻：',
  'scNotation': '螺旋测微器测得电阻丝直径 d = 0.200 \\, \\text{mm} = 2.00 \\times 10^{-4} \\, \\text{m}，横截面积：',
  'slope': 'b \\approx 75.5 \\, \\text{A}^{-1} \\cdot \\text{cm} = 0.755 \\, \\text{A}^{-1} \\cdot \\text{m}。',
  'bigFraction': 'S = \\frac{\\pi d^2}{4} = \\frac{3.14 \\times (2.00 \\times 10^{-4})^2}{4} = 3.14 \\times 10^{-8} \\, \\text{m}^2'
};

function mathTexOf(str) {
  return SmartMath.detect(str).filter(s => s.type === 'math').map(s => s.tex);
}

/* --- 不劈碎 LaTeX 命令 --- */
check('整行 LaTeX 不被劈碎（\frac 完整保留）',
  mathTexOf(BARE.wholeRow).some(t => t.includes('\\frac{E}{I}')),
  JSON.stringify(mathTexOf(BARE.wholeRow)));

/* 渲染无 ParseError */
function rendersClean(tex) {
  try {
    const mm = temml.renderToString(tex, { throwOnError: false });
    return mm.indexOf('ParseError') === -1 && mm.indexOf('</math>') !== -1;
  } catch (e) { return false; }
}
const wholeTexs = mathTexOf(BARE.wholeRow);
check('整行公式可被 Temml 干净渲染（含 \\text 下标）',
  wholeTexs.length >= 1 && wholeTexs.every(rendersClean),
  JSON.stringify(wholeTexs.map(t => t.slice(0, 40))));

const wholeJoin = wholeTexs.join('|');
check('总为下标：\\text{总} 保留在公式内', wholeJoin.includes('\\text{总}'));

/* --- 句子内嵌公式 --- */
const emb = mathTexOf(BARE.embedded);
check('内嵌：提取出 l = \\infty 片段', emb.some(t => t.includes('l = \\infty')));
check('内嵌：提取出含 \\text{A} 片段', emb.some(t => t.includes('\\text{A}')));
check('内嵌：中文说明文字仍保留为文本',
  SmartMath.detect(BARE.embedded).some(s => s.type === 'text' && s.text.includes('由最后一组数据')));

/* --- 单位/科学计数法 --- */
const inner = mathTexOf(BARE.innerR);
check('内嵌电阻：R_A = 0.20 \\, \\Omega 提取完整', inner.some(t => t.includes('R_A = 0.20') && t.includes('\\Omega')));
const sci = mathTexOf(BARE.scNotation);
check('科学计数法：10^{-4} 完整', sci.join('|').includes('10^{-4}'));
const slope = mathTexOf(BARE.slope);
check('上标+乘号点：}^{-1} 与 \\cdot \\text{cm} 完整', slope.join('|').includes('}^{-1}') && slope.join('|').includes('\\cdot') && slope.join('|').includes('\\text{cm}'));

/* --- 纯文字段落不误判 --- */
check('纯中文行不误判为公式', mathTexOf('这是纯文字段落，没有公式。').length === 0);
check('「由公式：」不误判', mathTexOf('由公式：').length === 0);

/* --- 花括号配平不被 CJK 打断（\text{总} 中的 总 不导致截断） --- */
check('\\text{总} 中的汉字不打断配平', wholeTexs.every(t => { const b = t.match(/\{/g), e = t.match(/\}/g); return !b || !e || b.length === e.length; }));

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
