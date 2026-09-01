/*! SmartMath — MathBridge 智能文本公式识别引擎
 *
 * 解决「从 AI 聊天界面复制公式」时常见的三类损伤：
 *  1) 公式与文字被聊天 UI 拆成多行      → mergeSoftLines 软换行合并
 *  2) 渲染后的 Unicode 符号/上下标丢失  → unicodeToLatex 符号与上下标还原
 *  3) 分数被压平成「分子分母直接拼接」  → 分数重建启发式（4.20.30 → \frac{4.2}{0.30}）
 *
 * 纯函数、零依赖，浏览器与 Node 均可运行（UMD 风格导出）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmartMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==================== 1. 软换行合并 ==================== */
  /* AI 聊天界面复制出的纯文本里，行内公式元素常被拆成独立行。
   * 判定「软换行」（应合并）的依据：
   *   a) 上一行以 ，、：（ 等延续性标点结尾
   *   b) 当前行以 ，、。；：） 等标点开头（标点被甩到下一行的情形）
   *   c) 当前行以数学字符开头，且上一行未以句末标点收尾
   *   d) 上一行以字母/希腊字母/单位/右括号结尾，且该行含数学特征
   * 空行（段落分隔）与 $$ 独立公式行不做合并。
   */

  var HARD_END_RE = /[。！？；!?;…]["')]?\s*$/;
  var CONT_END_RE = /[，、：:（(【[]\s*$/;
  var CONT_START_RE = /^[，、。；：！？）)】\]》”"’'…]/;
  var MATH_START_RE = /^[0-9A-Za-z=+\-−±×⋅·\/\\^_(\[{≤≥≈≠√π∞°∑∏∫]/;
  var UNIT_END_RE = /[A-Za-zΩπ%°)\]》”"']$/;

  function isCjkChar(c) {
    if (!c) return false;
    var code = c.charCodeAt(0);
    return (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef);
  }

  function mathyLine(line) {
    /* 行内含等号/运算符，或以 Ω 等单位符号收尾 → 视为含数学特征 */
    return /[=≈≤≥≠±×⋅·^_\\]/.test(line) || /\d/.test(line) && /[A-Za-zΩπ]/.test(line) || /[Ωπ°]\s*$/.test(line);
  }

  function shouldMerge(prev, cur) {
    prev = prev.trim();
    cur = cur.trim();
    if (!prev || !cur) return false;
    if (/^\s*(\$\$|\\\[)/.test(cur)) return false; /* 独立公式保持单独成行 */
    if (CONT_END_RE.test(prev)) return true;
    if (CONT_START_RE.test(cur)) return true;
    if (MATH_START_RE.test(cur) && !HARD_END_RE.test(prev)) return true;
    if (UNIT_END_RE.test(prev) && mathyLine(prev)) return true;
    return false;
  }

  function joinLines(a, b) {
    var last = a.charAt(a.length - 1);
    var first = b.charAt(0);
    var needsSpace = !isCjkChar(last) && !isCjkChar(first) &&
      last !== ' ' && last !== '' && first !== ' ' && first !== '';
    return a + (needsSpace ? ' ' : '') + b;
  }

  function mergeSoftLines(src) {
    if (!src) return src;
    var lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var cur = lines[i];
      if (out.length && shouldMerge(out[out.length - 1], cur)) {
        out[out.length - 1] = joinLines(out[out.length - 1], cur);
      } else {
        out.push(cur);
      }
    }
    return out.join('\n');
  }

  /* ==================== 2. Unicode → LaTeX ==================== */

  var SYMBOL_MAP = {
    '×': '\\times ', '⋅': '\\cdot ', '·': '\\cdot ',
    '−': '-', '±': '\\pm ', '≈': '\\approx ', '≠': '\\ne ',
    '≤': '\\le ', '≥': '\\ge ', '≡': '\\equiv ', '∝': '\\propto ',
    '∞': '\\infty ', '√': '\\sqrt ', '°': '^\\circ ',
    '→': '\\to ', '⇒': '\\Rightarrow ', '∈': '\\in ', '∉': '\\notin ',
    '∪': '\\cup ', '∩': '\\cap ', '⊂': '\\subset ', '⊃': '\\supset ',
    'µ': '\\mu ', '∑': '\\sum ', '∏': '\\prod ', '∫': '\\int ',
    'π': '\\pi ', 'Ω': '\\Omega ',
    'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ',
    'ε': '\\varepsilon ', 'ζ': '\\zeta ', 'η': '\\eta ', 'θ': '\\theta ',
    'ι': '\\iota ', 'κ': '\\kappa ', 'λ': '\\lambda ', 'ν': '\\nu ',
    'ξ': '\\xi ', 'ρ': '\\rho ', 'σ': '\\sigma ', 'τ': '\\tau ',
    'φ': '\\varphi ', 'χ': '\\chi ', 'ψ': '\\psi ', 'ω': '\\omega ',
    'Γ': '\\Gamma ', 'Δ': '\\Delta ', 'Θ': '\\Theta ', 'Λ': '\\Lambda ',
    'Ξ': '\\Xi ', 'Π': '\\Pi ', 'Σ': '\\Sigma ', 'Φ': '\\Phi ', 'Ψ': '\\Psi '
  };

  var SUP_MAP = {
    '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3',
    '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7',
    '\u2078': '8', '\u2079': '9', '\u207a': '+', '\u207b': '-', '\u207f': 'n'
  };
  var SUB_MAP = {
    '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3',
    '\u2084': '4', '\u2085': '5', '\u2086': '6', '\u2087': '7',
    '\u2088': '8', '\u2089': '9', '\u208a': '+', '\u208b': '-'
  };

  function expandScript(run, map) {
    var out = '';
    for (var i = 0; i < run.length; i++) {
      out += map[run.charAt(i)] != null ? map[run.charAt(i)] : run.charAt(i);
    }
    return out;
  }

  var SUP_RUN_RE = /[\u2070\u00b9\u00b2\u00b3\u2074-\u2079\u207a\u207b\u207f]+/g;
  var SUB_RUN_RE = /[\u2080-\u2089\u208a\u208b]+/g;

  function escapeForCharClass(ch) {
    return ch.replace(/[\]\\^-]/g, '\\$&');
  }

  var SYMBOL_RE = new RegExp('[' +
    Object.keys(SYMBOL_MAP).map(escapeForCharClass).join('') +
    ']', 'g');

  function unicodeToLatex(s) {
    /* Unicode 上下标 → ^{...} / _{...}（信息无损，优先处理） */
    s = s.replace(SUP_RUN_RE, function (run) { return '^{' + expandScript(run, SUP_MAP) + '}'; });
    s = s.replace(SUB_RUN_RE, function (run) { return '_{' + expandScript(run, SUB_MAP) + '}'; });
    /* 数学符号 → LaTeX 命令 */
    s = s.replace(SYMBOL_RE, function (ch) { return SYMBOL_MAP[ch]; });
    /* 中文下标：拉丁字母后紧跟单个汉字（如 R总）→ R_{\text{总}} */
    s = s.replace(/([A-Za-z])([\u4e00-\u9fff])/g, function (_, a, b) {
      return a + '_{\\text{' + b + '}}';
    });
    return s;
  }

  /* ==================== 3. 分数重建启发式 ==================== */
  /* 渲染成上下结构的分数，复制成纯文本后变成「分子+分母」直接拼接。
   * 按 = 切片后逐段应用三条规则（分数不会跨越等号）：
   *   A) 拼接小数，分母以 0. 开头：4.20.30   → \frac{4.2}{0.30}
   *   B) 斜线分数：3/4、1/I                 → \frac{3}{4}、\frac{1}{I}
   *   C) 末尾「字母或右括号+一位指数+分母」：d24、…)24 → \frac{d^{2}}{4}
   * 规则 C 要求前面至少有一个字符且该字符不是数字，避免误伤普通数字串。
   */

  function fixFractionsInToken(tok) {
    tok = tok.trim();
    if (!tok) return tok;

    /* A) 拼接小数，分母以 0. 开头 */
    tok = tok.replace(/(\d+(?:\.\d+)?)(0\.\d+)/g, '\\frac{$1}{$2}');
    /* B) 斜线分数 */
    tok = tok.replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g, '\\frac{$1}{$2}');
    tok = tok.replace(/(\d)\s*\/\s*([A-Za-z])/g, '\\frac{$1}{$2}');
    /* C) 末尾 字母/右括号 + 一位指数 + 分母 */
    var m = tok.match(/^(.+?)([A-Za-z\)])(\d)(\d)$/);
    if (m && m[1] && !(m[2] !== ')' && /\d$/.test(m[1]))) {
      tok = '\\frac{' + m[1] + m[2] + '^{' + m[3] + '}}{' + m[4] + '}';
    }
    return tok;
  }

  function fixFractions(tex) {
    return tex.split('=').map(fixFractionsInToken).join('=');
  }

  /* ==================== 4. 公式片段识别 ==================== */
  /* 在纯文本中扫描「数学片段」：由数学字符（含汉字下标）构成、
   * 且含有数学信号（等号、运算符、数字-字母邻接、斜线分数等）的连续片段。
   */

  var MATHY_CHARS = "0-9A-Za-z=+\\-−±×⋅·\/^_().,%<>\\[\\]{}'\" " +
    '\u2070-\u209f\u00b9\u00b2\u00b3\u2211\u220f\u222b' +
    '\u221a\u03c0\u221e\u00b0\u00b5' +
    '\u03b1-\u03c9\u0391-\u03a9' +
    '≈≤≥≠→⇒∈∉∪∩⊂⊃≡∝';
  var MATHY_RE = new RegExp('[' + MATHY_CHARS + ']');

  var SIGNAL_RES = [
    /[=≈≤≥≠≡∝]/,
    /[±×⋅·^_\\√°∑∏∫]/,
    /π|∞/,
    /\d[A-Za-z](?![A-Za-z])/,      /* 0.30A：数字+单位字母 */
    /(?:^|[^A-Za-z])[A-Za-z]\d/,   /* R1、d24：单字母+数字 */
    /\d\s*\/\s*[A-Za-z0-9]/,       /* 1/I */
    /[A-Za-z0-9]\s*\/\s*\d/        /* a/2 */
  ];

  function hasSignal(run) {
    for (var i = 0; i < SIGNAL_RES.length; i++) {
      if (SIGNAL_RES[i].test(run)) return true;
    }
    return false;
  }

  /**
   * 识别文本中的数学片段。
   * @param {string} text 纯文本
   * @returns {Array<{type:'text',text:string}|{type:'math',tex:string}>}
   */
  function detect(text) {
    var segments = [];
    var runStart = -1;
    var textStart = 0;

    function pushText(t) {
      if (!t) return;
      if (segments.length && segments[segments.length - 1].type === 'text') {
        segments[segments.length - 1].text += t;
      } else {
        segments.push({ type: 'text', text: t });
      }
    }

    function flushMath(run) {
      if (!run) return;
      if (hasSignal(run)) {
        var tex = fixFractions(unicodeToLatex(run.trim()));
        segments.push({ type: 'math', tex: tex });
      } else {
        pushText(run);
      }
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var prev = i > 0 ? text.charAt(i - 1) : '';
      var next = i < text.length - 1 ? text.charAt(i + 1) : '';
      var mathy;
      if (MATHY_RE.test(ch)) {
        mathy = true;
      } else if (isCjkChar(ch) && /[A-Za-z]/.test(prev) &&
        next && MATHY_RE.test(next) && !isCjkChar(next)) {
        /* 汉字下标：R总= → 「总」并入数学片段 */
        mathy = true;
      } else {
        mathy = false;
      }
      if (mathy) {
        if (runStart < 0) {
          pushText(text.slice(textStart, i));
          runStart = i;
        }
      } else if (runStart >= 0) {
        flushMath(text.slice(runStart, i));
        runStart = -1;
        textStart = i;
      }
    }
    if (runStart >= 0) flushMath(text.slice(runStart));
    else pushText(text.slice(textStart));

    return segments;
  }

  return {
    mergeSoftLines: mergeSoftLines,
    unicodeToLatex: unicodeToLatex,
    fixFractions: fixFractions,
    detect: detect
  };
});
