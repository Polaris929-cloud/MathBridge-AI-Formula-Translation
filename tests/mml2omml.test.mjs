/* 验证 MathML → OMML 转换：渲染用户报告的真实公式，检查 OMML 结构 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const M2O = require('../js/mml2omml.js');
import { readFileSync } from 'fs';
eval(readFileSync(new URL('../assets/vendor/temml.js', import.meta.url), 'utf8') + '; globalThis.__temml = temml;');
const temml = globalThis.__temml;

const eqs = {
  'EQ1 R总 分数': 'R_{总} = \\frac{E}{I} = \\frac{4.2}{0.30} = 14 \\, \\Omega',
  'EQ2 内阻': 'r = 14 - (0.20+4.8) = 9 \\, \\Omega',
  'EQ3 斜率 上标单位': 'b \\approx 75.5 \\, \\text{A}^{-1} \\cdot \\text{cm} = 0.755 \\, \\text{A}^{-1} \\cdot \\text{m}',
  'EQ4 面积 嵌套上标分数': 'S = \\frac{\\pi d^2}{4} = \\frac{3.14 \\times (2.00 \\times 10^{-4})^2}{4} = 3.14 \\times 10^{-8} \\, \\text{m}^2'
};

let pass = 0, fail = 0;
function ck(name, cond, extra) {
  if (cond) { pass++; console.log('PASS |', name); }
  else { fail++; console.log('FAIL |', name, extra ? '— ' + extra : ''); }
}

for (const [name, latex] of Object.entries(eqs)) {
  const mathml = temml.renderToString(latex, { throwOnError: false });
  const omml = M2O.toOMML(mathml);
  console.log('\n== ' + name + ' ==');
  console.log('  OMML len=' + omml.length);
  console.log('  ' + omml.slice(0, 400));
}

const mm1 = temml.renderToString(eqs['EQ1 R总 分数'], { throwOnError: false });
const o1 = M2O.toOMML(mm1);
ck('EQ1 中文总进入 m:sub', /<m:sub>[\s\S]*?<m:t xml:space="preserve">总<\/m:t>[\s\S]*?<\/m:sub>/.test(o1), o1.slice(0, 200));
ck('EQ1 分数 m:f 数量=2', (o1.match(/<m:f>/g) || []).length === 2);
ck('EQ1 含 m:oMath 外层则失败(应为false)', o1.indexOf('<m:oMath>') === -1);

const mm3 = temml.renderToString(eqs['EQ3 斜率 上标单位'], { throwOnError: false });
const o3 = M2O.toOMML(mm3);
ck('EQ3 上标 m:sSup=2', (o3.match(/<m:sSup>/g) || []).length === 2, o3);
ck('EQ3 直立单位 cm/m 以 plain(非斜体) 渲染',
  /<m:r><m:rPr><m:sty m:val="p"\/><m:scr m:val="roman"\/><\/m:rPr><m:t xml:space="preserve">cm<\/m:t><\/m:r>/.test(o3) &&
  /<m:t xml:space="preserve">m<\/m:t>/.test(o3), o3.slice(0, 300));

const mm4 = temml.renderToString(eqs['EQ4 面积 嵌套上标分数'], { throwOnError: false });
const o4 = M2O.toOMML(mm4);
ck('EQ4 m:f=2', (o4.match(/<m:f>/g) || []).length === 2);
ck('EQ4 m:sSup>=5', (o4.match(/<m:sSup>/g) || []).length >= 5, String((o4.match(/<m:sSup>/g) || []).length));
ck('EQ4 外层无 m:oMath', o4.indexOf('<m:oMath>') === -1);

// 引号/尖括号转义（直接喂含 < 的 raw MathML，绕过 Temml）
const oEsc = M2O.toOMML('<math><mrow><mi>a</mi><mo>&lt;</mo><mi>b</mi></mrow></math>');
ck('转义：&lt; 出现在 OMML', oEsc.indexOf('&lt;') !== -1, oEsc.slice(0,120));

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
