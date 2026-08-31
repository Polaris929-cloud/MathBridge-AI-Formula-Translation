/* MathBridge 核心引擎单元测试
 * 验证 Temml 能把示例公式转换为合法 MathML。
 * 运行：node tests/engine.test.mjs
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../assets/vendor/temml.js', import.meta.url), 'utf8');

// Temml 在浏览器环境运行，这里给出最小 DOM 桩
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} })
};

const run = new Function(src + '; return temml;');
const temml = run();

const cases = [
  ['E = mc^2', false],
  ['e^{i\\pi} + 1 = 0', true],
  ['x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', true],
  ['F(\\omega) = \\int_{-\\infty}^{\\infty} f(t)\\, e^{-i\\omega t}\\, dt', true],
  ['ax^2 + bx + c = 0', false]
];

let pass = 0;
for (const [tex, display] of cases) {
  const out = temml.renderToString(tex, { displayMode: display });
  const ok = out.startsWith('<math') && out.includes('</math>') &&
    (display ? out.includes('display="block"') : !out.includes('display="block"'));
  console.log((ok ? 'PASS' : 'FAIL'), '|', tex.slice(0, 50));
  if (ok) pass++;
}

console.log(`${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
