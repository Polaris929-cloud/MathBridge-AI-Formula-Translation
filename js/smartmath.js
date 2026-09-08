/*! SmartMath — MathBridge 智能文本公式识别引擎
 *
 * 解决「从 AI 聊天界面复制公式」时常见的三类损伤：
 *  1) 公式与文字被聊天 UI 拆成多行      → mergeSoftLines 软换行合并
 *  2) 渲染后的 Unicode 符号/上下标丢失  → unicodeToLatex 符号还原 + fixScripts 上下标还原
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
    '×': '\\times ', '⋅': '{\\cdot}', '·': '{\\cdot}',
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
    /* 中文下标：拉丁字母后紧跟汉字（如 R总）→ R_{总}
     * CJK 直接放进 _{...} 即可（Temml 会输出 <mtext>，作为正常下标渲染） */
    s = s.replace(/([A-Za-z])([\u4e00-\u9fff]+)/g, function (_, a, b) {
      return a + '_{' + b + '}';
    });
    return s;
  }

  /* ==================== 2.5 上下标还原启发式 ==================== */
  /* 渲染后的上标复制成纯文本时被压平成普通字符，按常见模式还原：
   *   A) 科学计数法：×10−4、10−8  → 10^{-4}、10^{-8}
   *   B) 负指数单位：A−1·cm       → A^{-1}{\cdot}cm（仅当后跟乘号，避免误伤 y=x-1）
   *   C) 面积/体积单位：cm2、m3   → cm^{2}、m^{3}
   */
  function fixScripts(tex) {
    /* A) 科学计数法（10 前面不能是数字或小数点，避免误伤 110-4、1.10-4） */
    tex = tex.replace(/(?<![\d.])10-(\d+)/g, '10^{-$1}');
    /* B) 字母/右括号 + 负指数，且后面紧跟乘号点 */
    tex = tex.replace(/([A-Za-z)])(-\d+)(?=\s*\{\\cdot\})/g, '$1^{$2}');
    /* C) 单位平方/立方（长单位优先匹配） */
    tex = tex.replace(/\b(mm|cm|dm|km|m|s)([23])\b/g, '$1^{$2}');
    return tex;
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

  /* ==================== 4.5 裸 LaTeX 识别 ==================== */
  /* 用户常从 AI 复制到「没有 $ 定界符的 LaTeX 源码」，
   * 例如  R_{\text{总}} = \frac{E}{I} = \frac{4.2}{0.30} = 14 \, \Omega
   * 这类文本含 \frac / \text / \infty / \, 等命令，必须整段交给渲染引擎，
   * 绝不能像 Unicode 纯文本那样逐字符切割（否则 \frac 会被劈成 \f r a c，产生乱码）。
   *
   * hasBareLatex(): 判断文本里是否含「强 LaTeX 命令信号」。
   * splitBareLatex(): 把混排文本切分为 text / latex(math) 两段。
   *   - 花括号配平 + 反斜杠转义感知，保证 \text{总} 这类带 CJK 的组不被截断
   *   - 遇 CJK 正文（花括号外）即截断，避免误吞中文说明文字
   */

  /* 一见到这些命令就视为进入 LaTeX 数学上下文 */
  var STRONG_LATEX_RE = /\\(?:frac|dfrac|tfrac|text|mathrm|textup|operatorname|sqrt|infty|Omega|times|approx|cdot|left|right|pi|sum|int|prod|lim|pm|mp|ge|le|ne|to|rightarrow|leq|geq|neq|times|div|cdot|ldots|cdots|overrightarrow|vec|frac)\b/;
  /* 命令首字符后的标识符范围 */
  var TEX_ID = /[A-Za-z@]/;

  /**
   * 判断字符串中是否存在「裸 LaTeX 命令」。
   */
  function hasBareLatex(s) {
    return STRONG_LATEX_RE.test(s);
  }

  /**
   * 用花括号配平扫描：自「{」下标 from 起，返回越过最后匹配「}」之后的下标。
   * 处理 \{ \} 转义。未配平则返回 s.length（让渲染器报错提示用户）。
   */
  function scanBalanced(s, from) {
    var depth = 0;
    var i = from;
    for (; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '\\') { i++; continue; }        /* 跳过转义字符及下一个 */
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return s.length;
  }

  /* 数学 run 中的字符判定（这些字符可安全地在数学与文字边界外连续）。
   * CJK 与中文句读会中断一个数学 run——除 LaTeX 花括号内(\text{总})的 CJK。 */
  var MATH_RUN_TERMINATOR = /[，。；：！？、（）【】《》「」『』“”‘’…\u4e00-\u9fff]/;
  /* 这些字符属于一个数学表达式的延续 */
  var MATH_RUN_CHARS = /[A-Za-z0-9.=\-+(),/|<>^_{}~*'":;\\\s]/;
  /* 数字或数学符号开头的子串、紧跟等号/运算符 → 属于数学表达式 */
  var MATH_START_HINT = /^[A-Za-z0-9\\.,=+\-()]+(?:\s*=|\s*\\frac|\s*\(|\s*[0-9])/;

  /**
   * 判断一个字符是否应被并入「数学上下文」（非 CJK、非中文标点）。
   */
  function isMathRunChar(ch) {
    if (!ch) return false;
    if (MATH_RUN_TERMINATOR.test(ch)) return false;
    return MATH_RUN_CHARS.test(ch);
  }

  /**
   * 自 idx 向后吞并连续数学字符，直到遇到 CJK / 中文句读 或 行尾。
   * 期间若遇到 \command{ 做配平吸收。返回吞并后的末尾下标（不含被截断点）。
   */
  function eatMathRun(s, idx) {
    var n = s.length;
    var j = idx;
    while (j < n) {
      var c = s.charAt(j);
      if (MATH_RUN_TERMINATOR.test(c)) break;         /* 中文/句读 → 停 */
      if (c === '\\' && j + 1 < n && TEX_ID.test(s.charAt(j + 1))) {
        /* 反斜杠命令：读出名字，若后跟 { 则配平吸收整组 */
        var k = j + 1;
        while (k < n && TEX_ID.test(s.charAt(k))) k++;
        if (k < n && s.charAt(k) === '{') {
          var endB = scanBalanced(s, k);              /* 从 { 开始配平 */
          j = endB;
          continue;
        }
        j = k;
        continue;
      }
      if (isMathRunChar(c)) { j++; continue; }
      break;
    }
    return j;
  }

  /**
   * 自 idx 向前回退，吞并紧邻的数学字符（把 R_{ 这种命令前残片并入）。
   * 只吞并到安全的边界：不会越过 CJK / 中文句读。
   */
  function rewindMathRun(s, idx) {
    var j = idx;
    while (j > 0) {
      var c = s.charAt(j - 1);
      if (MATH_RUN_TERMINATOR.test(c)) break;
      if (!isMathRunChar(c)) break;
      j--;
    }
    return j;
  }

  /**
   * 把混排文本切分为 text / latex(math) 段。
   * 核心策略：找到每一个「强 LaTeX 命令」作为锚点，向前回退、向后吞并，
   * 把整段连续数学表达式收拢为一段 math，避免把 \frac 等劈成碎片。
   * @returns {Array<{type:'text',text}|{type:'math',tex}>}|null
   */
  function splitBareLatex(src) {
    if (!src || !hasBareLatex(src)) return null;
    var segments = [];
    var i = 0;
    var n = src.length;
    var textBuf = '';
    var STRONG_G = new RegExp(STRONG_LATEX_RE.source, 'g');

    function flushText() {
      if (textBuf) { segments.push({ type: 'text', text: textBuf }); textBuf = ''; }
    }

    while (i < n) {
      /* 找下一个强 LaTeX 命令锚点 */
      STRONG_G.lastIndex = i;
      var m = STRONG_G.exec(src);
      if (!m) {
        textBuf += src.slice(i);
        break;
      }
      var anchor = m.index;
      /* 锚点前的文字（不含紧邻数学残片）保留 */
      var rw = rewindMathRun(src, anchor);
      if (rw > i) { textBuf += src.slice(i, rw); }
      /* 从回退后的位置开始吞并整个数学 run */
      var endRun = eatMathRun(src, anchor);
      /* 若锚点很靠前、run 含等号/公式结构才算一段 */
      var run = src.slice(rw, endRun).trim();
      if (run && hasBareLatex(run)) {
        flushText();
        segments.push({ type: 'math', tex: run });
        i = endRun;
        continue;
      }
      /* 该锚点未形成有效公式（罕见），当作文字继续 */
      textBuf += src.slice(i, anchor + 1);
      i = anchor + 1;
    }
    flushText();
    if (!segments.some(function (s) { return s.type === 'math'; })) return null;
    return segments;
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
    /* 先检查「裸 LaTeX」：若命中，按花括号配平切出 math 段（原文直达渲染），
     * 剩余纯文本递归交给下方 Unicode 识别，避免逐字符劈碎 LaTeX 命令。 */
    var latexPieces = splitBareLatex(text);
    if (latexPieces) {
      var segs = [];
      latexPieces.forEach(function (p) {
        if (p.type === 'math') {
          segs.push({ type: 'math', tex: p.tex.trim() });
        } else {
          detectInto(p.text, segs);
        }
      });
      return segs;
    }
    var out = [];
    detectInto(text, out);
    return out;
  }

  function detectInto(text, segments) {
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
        var tex = fixFractions(fixScripts(unicodeToLatex(run.trim())));
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
  }

  return {
    mergeSoftLines: mergeSoftLines,
    unicodeToLatex: unicodeToLatex,
    fixScripts: fixScripts,
    fixFractions: fixFractions,
    hasBareLatex: hasBareLatex,
    splitBareLatex: splitBareLatex,
    detect: detect
  };
});
