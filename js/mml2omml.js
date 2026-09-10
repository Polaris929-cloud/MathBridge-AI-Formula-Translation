/*! MathML2OMML — MathBridge 的 MathML → OMML（Office Math Markup Language）转换器
 *
 * 背景：Word 与 WPS 都能原生渲染 OMML，但 WPS 对「MathML → 自身公式」的转换
 * 存在缺陷（尤其把 <mtext> 里的 CJK 下标「总」固化成整字号、不缩小）。
 * 直接在剪贴板 / docx 里投递 OMML，可绕开各应用的 MathML→OMML 差异，让下标
 * 字号由 Word/WPS 各自 OMML 引擎保证 —— Word 与 WPS 得到一致且正确的原生公式。
 *
 * 本转换器面向 MathBridge 支持的有限公式结构（分数/上下标/根式/文本/常见符号），
 * 输入是 Temml 产出的 MathML 字符串，输出是 OMML 片段（不含 <m:oMath> 外层）。
 *
 * 纯函数、零依赖、浏览器与 Node 均可运行（UMD 风格导出）。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MathML2OMML = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 需要以普通（非斜体）样式渲染的字母表意（数字、单位、希腊正体由调用侧决定）。
   * 变量/字母默认斜体；数字与 \text/单位/upright 用 plain。 */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Node 手写解析器不解码 XML 实体，统一解码保证与浏览器 DOMParser 一致 */
  function decodeEntities(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  /* 单个文本 token 转成 OMML run。isPlain=true 表示不斜体（数字/单位/直立文本）。
   * 直立样式只写 <m:sty m:val="p"/>（与 Word 自身输出一致，schema 里 m:rPr 子元素
   * 顺序敏感，多写 m:scr 反而可能触发校验问题）。 */
  function run(char, isPlain) {
    var c = String(char);
    if (!c) return '';
    var rPr = isPlain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : '';
    return '<m:r>' + rPr + '<m:t xml:space="preserve">' + esc(c) + '</m:t></m:r>';
  }

  /* 数学字母(拉丁/希腊)默认斜体；但 CJK 文本、数字、\Omega 直立希腊、\text 直立不用斜体。
   * 采用保守规则：仅 [A-Za-z]（除已知直立字母集合）斜体，其余不斜体。 */
  var ITALIC_LETTER = /^[A-Za-z]$/;
  var UPRIGHT_LETTER = /^(e|i|j|d|ln|lg|log|sin|cos|tan|exp|max|min|lim|π|Ω|Δ|π)$/;

  function tokenStyle(text) {
    if (ITALIC_LETTER.test(text) && !UPRIGHT_LETTER.test(text)) return 'italic';
    return 'plain';
  }

  /* ---------------- MathML → OMML 递归转换 ---------------- */

  /**
   * @param {Element|Node} el MathML 子节点
   * @returns {string} OMML 片段
   */
  function convertNode(el) {
    var tag = el.nodeName.toLowerCase();
    // 收集子节点文本（token）
    function children() {
      var out = '';
      for (var i = 0; i < el.childNodes.length; i++) {
        out += convertNode(el.childNodes[i]);
      }
      return out;
    }
    // 取单子（跳过注释/空白）
    function nth(n) {
      var kids = [];
      for (var i = 0; i < el.childNodes.length; i++) {
        var nd = el.childNodes[i];
        if (nd.nodeType === 1) kids.push(nd);
      }
      return kids[n];
    }
    // 标签内文字（解码实体）
    function textOnly() {
      var t = '';
      for (var i = 0; i < el.childNodes.length; i++) {
        var nd = el.childNodes[i];
        if (nd.nodeType === 3) t += nd.nodeValue;
      }
      return decodeEntities(t);
    }

    switch (tag) {
      case '#text': {
        var val = el.nodeValue;
        if (!val) return '';
        // 仅处理非空白（mtext 内中文可能是文本，保留）
        if (/^\s*$/.test(val)) return '';
        return run(decodeEntities(val).trim(), true);
      }
      case 'math':
      case 'mrow':
        return children();
      case 'mi':
      case 'mn':
      case 'mo':
      case 'mtext': {
        var txt = textOnly();
        var style;
        if (tag === 'mo') {
          style = 'plain';
        } else if (tag === 'mi') {
          style = tokenStyle(txt);
        } else {
          style = 'plain'; // mn, mtext
        }
        return run(txt, style !== 'italic');
      }
      case 'mfrac': {
        var num = nth(0), den = nth(1);
        return '<m:f><m:num>' + (num ? convertNode(num) : '') +
          '</m:num><m:den>' + (den ? convertNode(den) : '') + '</m:den></m:f>';
      }
      case 'msub': {
        var base = nth(0), sub = nth(1);
        return '<m:sSub><m:e>' + (base ? convertNode(base) : '') +
          '</m:e><m:sub>' + (sub ? convertNode(sub) : '') + '</m:sub></m:sSub>';
      }
      case 'msup': {
        var b2 = nth(0), sup = nth(1);
        return '<m:sSup><m:e>' + (b2 ? convertNode(b2) : '') +
          '</m:e><m:sup>' + (sup ? convertNode(sup) : '') + '</m:sup></m:sSup>';
      }
      case 'msubsup': {
        var b3 = nth(0), su = nth(1), sp = nth(2);
        return '<m:sSubSup><m:e>' + (b3 ? convertNode(b3) : '') +
          '</m:e><m:sub>' + (su ? convertNode(su) : '') +
          '</m:sub><m:sup>' + (sp ? convertNode(sp) : '') + '</m:sup></m:sSubSup>';
      }
      case 'msqrt': {
        var rad = children();
        return '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>' +
          '<m:e>' + rad + '</m:e></m:rad>';
      }
      case 'mroot': {
        var b4 = nth(0), deg = nth(1);
        return '<m:rad><m:deg>' + (deg ? convertNode(deg) : '') +
          '</m:deg><m:e>' + (b4 ? convertNode(b4) : '') + '</m:e></m:rad>';
      }
      case 'mspace':
      case 'mpadded':
      case 'mphantom':
      case 'menclose':
      case 'merror':
        // 简单跳过或透传子节点
        return children();
      default:
        return children(); // 未知结构透传子节点，尽量保内容
    }
  }

  /**
   * MathML 字符串 → OMML 片段（不含外层 <m:oMath>）。
   * @param {string} mathml Temml/KaTeX 产出的 <math> 片段
   * @returns {string} OMML 片段
   */
  function toOMML(mathml) {
    var doc;
    if (typeof DOMParser !== 'undefined') {
      doc = new DOMParser().parseFromString(mathml, 'text/xml');
    } else {
      // Node 环境无 DOMParser：用简易手写解析器（本项目 MathML 结构规整）
      doc = parseMathMLNode(mathml);
    }
    if (!doc) return '';
    // 取 <math> 根
    var mathEl = doc.nodeType === 9 ? doc.documentElement : doc;
    if (!mathEl || (mathEl.nodeName || '').toLowerCase() !== 'math') {
      // 可能外层有 wrapper
      var m = mathml.match(/<math[\s>]/);
      if (m) {
        // 尝试定位 math 根子内容
        var inner = mathml.slice(mathml.indexOf('>', mathml.indexOf('<math')) + 1);
        inner = inner.replace(/<\/math>[\s\S]*$/, '');
        return innerToOMML(inner);
      }
      return '';
    }
    return convertNode(mathEl);
  }

  /* ---------------- Node 简易 MathML DOM ---------------- */
  /* 仅实现本项目所需的最小解析：标签 + 文本。返回伪 DOM 节点树，
   * 与 convertNode 通过 nodeName / childNodes / nodeType 兼容。 */

  function el(tag) {
    return { nodeType: 1, nodeName: tag, childNodes: [] };
  }
  function tx(text) {
    return { nodeType: 3, nodeValue: text };
  }
  function parseMathMLNode(str) {
    // 解析为最小树：递归扫描标签与文本，忽略属性
    var root = el('math');
    var stack = [root];
    var re = /<(\/?)([A-Za-z#]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    var last = 0;
    var m;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) {
        var textSeg = str.slice(last, m.index);
        if (textSeg) stack[stack.length - 1].childNodes.push(tx(textSeg));
      }
      if (m[1] === '/') {
        if (stack.length > 1) stack.pop();
      } else {
        var node = el(m[2]);
        stack[stack.length - 1].childNodes.push(node);
        if (m[2].toLowerCase() !== 'math') stack.push(node);
      }
      last = re.lastIndex;
    }
    if (last < str.length) {
      var tail = str.slice(last);
      if (tail) stack[0].childNodes.push(tx(tail));
    }
    return root;
  }

  /* 字符串解析路径的另一种入口：给定 <math> 内部内容 */
  function innerToOMML(inner) {
    var fake = '<math>' + inner + '</math>';
    var doc = parseMathMLNode(fake);
    return convertNode(doc);
  }

  return { toOMML: toOMML, run: run };
});
