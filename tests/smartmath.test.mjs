/* SmartMath 引擎单元测试 — 用真实 AI 复制文本（来自用户 Word 测试文档）验证 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SmartMath = require('../js/smartmath.js');

/* 用户从 AI 聊天框复制出的原始文本（公式被拆行、分数被压平、上标丢失） */
const RAW = [
  '由最后一组数据（',
  'l=∞',
  '，',
  'I=0.30A',
  '）可得电路总电阻（不含电阻丝）为：',
  'R总=EI=4.20.30=14Ω',
  '已知电流表内阻 ',
  'RA=0.20Ω',
  '，定值电阻 ',
  'R=4.8Ω',
  '，则电源内阻：',
  'r=14−(0.20+4.8)=9Ω',
  '前四组数据经转换为国际单位后，作 ',
  '1/I',
  '- ',
  '1/l',
  '图，拟合直线斜率 ',
  'b≈75.5A−1⋅cm=0.755A−1⋅m',
  '。螺旋测微器测得电阻丝直径 ',
  'd=0.200mm=2.00×10−4m',
  '，横截面积：',
  'S=πd24=3.14×(2.00×10−4)24=3.14×10−8m2'
].join('\n');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS |', name); }
  else { fail++; console.log('FAIL |', name, extra ? '— ' + extra : ''); }
}

/* --- 软换行合并 --- */
const merged = SmartMath.mergeSoftLines(RAW);
check('合并：括号内公式与正文同行', merged.includes('由最后一组数据（l=∞，I=0.30A）可得电路总电阻（不含电阻丝）为：R总=EI=4.20.30=14Ω'), merged.split('\n')[0]);
check('合并：句号开头行并回上行', merged.includes('0.755A−1⋅m。螺旋测微器测得'));
check('保留：空行/独立段落结构', merged.split('\n').length < RAW.split('\n').length);
check('不误伤：普通两段中文不合并', SmartMath.mergeSoftLines('第一段结论。\n第二段开始') === '第一段结论。\n第二段开始');
check('不误伤：LaTeX 独立公式保持单独成行', SmartMath.mergeSoftLines('公式如下：\n$$x=1$$') === '公式如下：\n$$x=1$$');

/* --- 公式识别 --- */
const segs = SmartMath.detect(merged);
const mathSegs = segs.filter(s => s.type === 'math');
console.log('识别出', mathSegs.length, '个公式：');
mathSegs.forEach(s => console.log('  $' + s.tex + '$'));

check('识别数量 >= 8', mathSegs.length >= 8, String(mathSegs.length));
const allTex = mathSegs.map(s => s.tex).join('\n');

/* --- 分数重建 --- */
check('分数A：4.20.30 → \\frac{4.2}{0.30}', allTex.includes('\\frac{4.2}{0.30}'), allTex);
check('分数B：1/I → \\frac{1}{I}', allTex.includes('\\frac{1}{I}'));
check('分数B：1/l → \\frac{1}{l}', allTex.includes('\\frac{1}{l}'));
check('分数C：πd24 → \\frac{\\pi d^{2}}{4}', allTex.includes('\\frac{\\pi d^{2}}{4}'));
check('分数C：…)24 → \\frac{…)^{2}}{4}', allTex.includes('(2.00\\times 10-4)^{2}}{4}'));

/* --- 符号还原 --- */
check('符号：∞ → \\infty', allTex.includes('l=\\infty'));
check('符号：× → \\times', allTex.includes('2.00\\times 10-4'));
check('符号：−(U+2212) → -', allTex.includes('r=14-(0.20+4.8)'));
check('符号：≈ → \\approx', allTex.includes('b\\approx 75.5'));
check('符号：Ω → \\Omega', allTex.includes('14\\Omega'));
check('中文下标：R总 → R_{\\text{总}}', allTex.includes('R_{\\text{总}}=EI'));

/* --- 文本保留（回归：公式之间的文字不得丢失） --- */
const allText = segs.filter(s => s.type === 'text').map(s => s.text).join('');
check('文本保留：公式前的中文说明不丢失', allText.includes('由最后一组数据（'), allText.slice(0, 60));
check('文本保留：公式间标点不丢失', allText.includes('，') && allText.includes('）可得电路总电阻'), allText.slice(0, 120));
check('文本保留：结尾句号不丢失', allText.includes('。螺旋测微器测得电阻丝直径'), allText);

/* --- 误报防护 --- */
const PROSE = '这是一段普通中文，包含数字 3 和 14，但没有公式。The quick brown fox jumps over the lazy dog. 步骤1 完成后执行步骤2。';
const prose = SmartMath.detect(PROSE);
check('纯文本无误报', prose.every(s => s.type === 'text') && prose.length > 0, JSON.stringify(prose.filter(s=>s.type==='math')));
check('纯文本内容完整保留', prose.map(s=>s.text).join('') === PROSE);
const falsePos = SmartMath.detect('使用 sha256 哈希算法，版本 v2.03.04 与 3rd party 库');
const fpMath = falsePos.filter(s => s.type === 'math').map(s => s.tex);
check('常见英文/版本号不误判为分数', !fpMath.some(t => t.includes('frac')), fpMath.join(' ; '));

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
