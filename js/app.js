/* MathBridge — AI 公式搬运工 / AI Formula Translator
 * 核心：解析混合文本中的 LaTeX 公式 → Temml 渲染为 MathML →
 * 以 text/html 剪贴板 flavor 复制 → Word/WPS 粘贴时转为原生公式(OMML)。
 *
 * v0.2 新增：
 *  - SmartMath 智能识别：AI 复制出的 Unicode 纯文本也能还原成公式
 *    （软换行合并、符号/上下标还原、分数重建）
 *  - 富文本粘贴：剪贴板 HTML 含 KaTeX MathML 时直接提取 LaTeX 源码，零损失
 *  - 段落流式渲染：行内公式不再被拆成独立段落，保持原文紧凑排版
 */

(function () {
  'use strict';

  var input = document.getElementById('input');
  var preview = document.getElementById('preview');
  var statusEl = document.getElementById('status');
  var btnCopy = document.getElementById('btn-copy');
  var btnDemo = document.getElementById('btn-demo');
  var btnClear = document.getElementById('btn-clear');
  var btnLang = document.getElementById('btn-lang');

  /* ---------- 国际化 / i18n ---------- */
  var I18N = {
    zh: {
      docTitle: 'MathBridge · AI 公式搬运工',
      htmlLang: 'zh-CN',
      langBtn: 'EN',
      tagline: 'AI 公式搬运工 · 粘贴进 Word 不乱码',
      inputTitle: '粘贴 AI 输出',
      demoBtn: '载入示例',
      clearBtn: '清空',
      inputPlaceholder: '把 AI 聊天框里的回复直接粘贴到这里。\n\n支持 $...$ 行内公式、$$...$$ 与 \\[...\\] 独立公式；\n从 AI 界面复制的纯文本（Unicode 符号、被压平的分数）也能自动识别。',
      previewTitle: '实时预览',
      copyBtn: '复制到 Word',
      hint: 'Ctrl + Enter 快速复制 · 点击公式可单独复制 · 橙色虚线框为智能识别结果，如有偏差可在左侧直接修改',
      footer: '原理：LaTeX → MathML → 剪贴板，Word / WPS 粘贴时自动转为原生公式（OMML）。全程在浏览器本地完成，公式内容不上传任何服务器。',
      empty: '左边粘贴 AI 输出，这里会实时显示渲染效果',
      noFormula: '未检测到公式（支持 $...$ 定界符，或直接粘贴 AI 复制出的文本自动识别）',
      statusOk: function (n) { return '已识别 ' + n + ' 个公式，全部解析成功'; },
      statusErr: function (n, e) { return '已识别 ' + n + ' 个公式，其中 ' + e + ' 个解析失败'; },
      smartNote: function (m) { return '；其中 ' + m + ' 个由 Unicode 智能识别，建议核对'; },
      parseError: '公式解析失败：',
      copyOneLabel: '复制此公式',
      copiedAll: '已复制，去 Word 里 Ctrl+V 即可',
      copiedOne: '公式已复制',
      copyFail: '复制失败，请重试',
      copyBlocked: '复制被浏览器拦截，请点击页面任意处后重试',
      richPaste: '已从剪贴板提取 ' + 'LaTeX' + ' 公式源码',
      settingsBtn: '界面设置',
      settingsTitle: '界面设置',
      fontSize: '字体大小',
      fontWeight: '字体粗细',
      bgColor: '背景颜色',
      customColor: '自定义颜色',
      paneSize: '文本框高度',
      cornerRadius: '圆角',
      resetSettings: '恢复默认',
      demo: '质能方程 $E = mc^2$ 揭示了质量与能量的等价关系。\n\n' +
        '而最美的公式当属欧拉公式：\n\n$$e^{i\\pi} + 1 = 0$$\n\n' +
        '求解二次方程 $ax^2 + bx + c = 0$ 时，求根公式为：\n\n' +
        '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n' +
        '—— 以下为智能识别示例（直接从 AI 聊天框复制的纯文本）——\n\n' +
        '由最后一组数据（l=∞，I=0.30A）可得电路总电阻为：\n' +
        'R总=EI=4.20.30=14Ω\n\n' +
        '已知电流表内阻 RA=0.20Ω，定值电阻 R=4.8Ω，则电源内阻：\n' +
        'r=14−(0.20+4.8)=9Ω\n\n' +
        '作 1/I - 1/l 图，横截面积：\n' +
        'S=πd24=3.14×(2.00×10−4)24=3.14×10−8m2'
    },
    en: {
      docTitle: 'MathBridge · AI Formula Translator',
      htmlLang: 'en',
      langBtn: '中文',
      tagline: 'Paste AI formulas into Word — no more garbled code',
      inputTitle: 'Paste AI output',
      demoBtn: 'Load demo',
      clearBtn: 'Clear',
      inputPlaceholder: 'Paste any AI chat reply here.\n\nSupports $...$ inline formulas, $$...$$ and \\[...\\] display formulas.\nPlain Unicode text copied from AI chats (with flattened fractions) is auto-detected too.',
      previewTitle: 'Live preview',
      copyBtn: 'Copy to Word',
      hint: 'Ctrl + Enter to copy · Click a formula to copy it alone · Orange dashed boxes are auto-detected — edit on the left if needed',
      footer: 'How it works: LaTeX → MathML → clipboard. Word / WPS converts it to a native equation (OMML) on paste. Everything runs locally in your browser — nothing is uploaded.',
      empty: 'Paste AI output on the left — the rendered result appears here',
      noFormula: 'No formula detected (use $...$ delimiters, or just paste AI-copied text for auto-detection)',
      statusOk: function (n) { return n + ' formula' + (n > 1 ? 's' : '') + ' detected, all parsed successfully'; },
      statusErr: function (n, e) { return n + ' formula' + (n > 1 ? 's' : '') + ' detected, ' + e + ' failed to parse'; },
      smartNote: function (m) { return ' (' + m + ' auto-detected from Unicode text — please review)'; },
      parseError: 'Failed to parse: ',
      copyOneLabel: 'Copy this formula',
      copiedAll: 'Copied — Ctrl+V into Word now',
      copiedOne: 'Formula copied',
      copyFail: 'Copy failed, please try again',
      copyBlocked: 'Clipboard blocked by browser — click anywhere on the page and retry',
      richPaste: 'LaTeX source extracted from clipboard HTML',
      settingsBtn: 'Settings',
      settingsTitle: 'Appearance',
      fontSize: 'Font size',
      fontWeight: 'Font weight',
      bgColor: 'Background color',
      customColor: 'Custom color',
      paneSize: 'Panel height',
      cornerRadius: 'Corner radius',
      resetSettings: 'Reset to defaults',
      demo: 'The mass-energy equivalence $E = mc^2$ reveals that mass and energy are interchangeable.\n\n' +
        'But the most beautiful formula is Euler\'s identity:\n\n$$e^{i\\pi} + 1 = 0$$\n\n' +
        'For a quadratic equation $ax^2 + bx + c = 0$, the root formula is:\n\n' +
        '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n' +
        '— Smart detection demo (plain text copied straight from an AI chat) —\n\n' +
        'From the last data point (l=∞, I=0.30A), the total resistance is:\n' +
        'R总=EI=4.20.30=14Ω\n\n' +
        'The cross-section area:\n' +
        'S=πd24=3.14×(2.00×10−4)24=3.14×10−8m2'
    }
  };

  var lang = 'zh';
  try {
    var saved = localStorage.getItem('mathbridge-lang');
    if (saved === 'zh' || saved === 'en') lang = saved;
    else if (navigator.language && !/^zh/i.test(navigator.language)) lang = 'en';
  } catch (e) { /* localStorage 不可用时用默认语言 */ }

  function t(key) {
    return I18N[lang][key];
  }

  function applyLang() {
    document.documentElement.lang = t('htmlLang');
    document.title = t('docTitle');
    btnLang.textContent = t('langBtn');
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    btnSettings.setAttribute('title', t('settingsBtn'));
    btnSettings.setAttribute('aria-label', t('settingsBtn'));
    renderPreview();
  }

  btnLang.addEventListener('click', function () {
    lang = lang === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('mathbridge-lang', lang); } catch (e) { /* ignore */ }
    applyLang();
  });

  /* ---------- 界面自定义 / Appearance settings ---------- */
  var APPEARANCE_KEY = 'mathbridge-appearance';
  var APPEARANCE_DEFAULTS = { fs: 100, fw: 400, bg: '#faf9f5', paneH: 400, radius: 10 };

  var btnSettings = document.getElementById('btn-settings');
  var settingsPanel = document.getElementById('settings-panel');
  var setFontsize = document.getElementById('set-fontsize');
  var setFontweight = document.getElementById('set-fontweight');
  var setBgcolor = document.getElementById('set-bgcolor');
  var setPaneheight = document.getElementById('set-paneheight');
  var setRadius = document.getElementById('set-radius');
  var valFontsize = document.getElementById('val-fontsize');
  var valPaneheight = document.getElementById('val-paneheight');
  var valRadius = document.getElementById('val-radius');
  var btnResetSettings = document.getElementById('btn-reset-settings');

  function loadAppearance() {
    var state = {};
    try {
      var raw = localStorage.getItem(APPEARANCE_KEY);
      if (raw) state = JSON.parse(raw) || {};
    } catch (e) { /* localStorage 不可用时用默认值 */ }
    return {
      fs: clampNum(state.fs, 80, 160, APPEARANCE_DEFAULTS.fs),
      fw: clampNum(state.fw, 300, 700, APPEARANCE_DEFAULTS.fw),
      bg: validColor(state.bg) ? state.bg : APPEARANCE_DEFAULTS.bg,
      paneH: clampNum(state.paneH, 280, 680, APPEARANCE_DEFAULTS.paneH),
      radius: clampNum(state.radius, 0, 20, APPEARANCE_DEFAULTS.radius)
    };
  }

  function clampNum(v, min, max, fallback) {
    var n = Number(v);
    return isFinite(n) && n >= min && n <= max ? n : fallback;
  }

  function validColor(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  }

  var appearance = loadAppearance();

  function applyAppearance() {
    var root = document.documentElement.style;
    root.setProperty('--font-scale', String(appearance.fs / 100));
    root.setProperty('--text-weight', String(appearance.fw));
    root.setProperty('--bg', appearance.bg);
    root.setProperty('--pane-min-h', appearance.paneH + 'px');
    root.setProperty('--radius-base', appearance.radius + 'px');

    // 同步控件显示
    setFontsize.value = appearance.fs;
    valFontsize.textContent = appearance.fs + '%';
    setFontweight.value = String(appearance.fw);
    setBgcolor.value = appearance.bg;
    setPaneheight.value = appearance.paneH;
    valPaneheight.textContent = appearance.paneH + 'px';
    setRadius.value = appearance.radius;
    valRadius.textContent = appearance.radius + 'px';
    settingsPanel.querySelectorAll('.swatch').forEach(function (s) {
      s.classList.toggle('active', s.getAttribute('data-bg').toLowerCase() === appearance.bg.toLowerCase());
    });
  }

  function saveAppearance() {
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); } catch (e) { /* ignore */ }
  }

  function updateAppearance(patch) {
    for (var k in patch) appearance[k] = patch[k];
    applyAppearance();
    saveAppearance();
  }

  btnSettings.addEventListener('click', function (e) {
    e.stopPropagation();
    var willOpen = settingsPanel.hidden;
    settingsPanel.hidden = !willOpen;
    btnSettings.setAttribute('aria-expanded', String(willOpen));
  });

  settingsPanel.addEventListener('click', function (e) { e.stopPropagation(); });

  document.addEventListener('click', function () {
    if (!settingsPanel.hidden) {
      settingsPanel.hidden = true;
      btnSettings.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !settingsPanel.hidden) {
      settingsPanel.hidden = true;
      btnSettings.setAttribute('aria-expanded', 'false');
      btnSettings.focus();
    }
  });

  setFontsize.addEventListener('input', function () {
    updateAppearance({ fs: Number(this.value) });
  });

  setFontweight.addEventListener('change', function () {
    updateAppearance({ fw: Number(this.value) });
  });

  setBgcolor.addEventListener('input', function () {
    updateAppearance({ bg: this.value });
  });

  setPaneheight.addEventListener('input', function () {
    updateAppearance({ paneH: Number(this.value) });
  });

  setRadius.addEventListener('input', function () {
    updateAppearance({ radius: Number(this.value) });
  });

  settingsPanel.querySelectorAll('.swatch').forEach(function (s) {
    s.addEventListener('click', function () {
      updateAppearance({ bg: s.getAttribute('data-bg') });
    });
  });

  btnResetSettings.addEventListener('click', function () {
    appearance = loadAppearanceDefaults();
    applyAppearance();
    saveAppearance();
  });

  function loadAppearanceDefaults() {
    return {
      fs: APPEARANCE_DEFAULTS.fs,
      fw: APPEARANCE_DEFAULTS.fw,
      bg: APPEARANCE_DEFAULTS.bg,
      paneH: APPEARANCE_DEFAULTS.paneH,
      radius: APPEARANCE_DEFAULTS.radius
    };
  }

  /* ---------- 富文本粘贴：从剪贴板 HTML 提取 KaTeX LaTeX 源码 ---------- */
  /* 多数 AI 界面（DeepSeek/Kimi/ChatGPT 等）用 KaTeX 渲染公式，
   * 复制时剪贴板 text/html 里带有 MathML <annotation encoding="application/x-tex">
   * ——即原始 LaTeX。直接提取可零损失还原（分数、上下标完整）。 */
  var BLOCK_TAG_RE = /^(P|DIV|LI|UL|OL|H[1-6]|PRE|BLOCKQUOTE|TR|TABLE|SECTION|ARTICLE)$/;

  function extractMathFromHtml(html) {
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var maths = Array.prototype.slice.call(doc.querySelectorAll('math'));
      if (!maths.length) return null;

      var withTex = maths.filter(function (m) {
        return !!m.querySelector('annotation[encoding="application/x-tex"]');
      });

      if (withTex.length) {
        /* 有 LaTeX 源：丢弃 KaTeX 可见层（避免内容重复），用 annotation 替换 MathML */
        doc.querySelectorAll('.katex-html, script, style').forEach(function (n) { n.remove(); });
        withTex.forEach(function (m) {
          var tex = m.querySelector('annotation[encoding="application/x-tex"]').textContent;
          var display = m.getAttribute('display') === 'block';
          m.parentNode.replaceChild(
            doc.createTextNode(display ? '\n$$' + tex + '$$\n' : '$' + tex + '$'),
            m
          );
        });
      } else {
        /* 无 LaTeX 源：MathML 多为隐藏辅助副本，丢弃之，保留可见文本，
         * 交给 SmartMath 智能识别 */
        maths.forEach(function (m) { m.remove(); });
        doc.querySelectorAll('script, style').forEach(function (n) { n.remove(); });
      }

      /* 块级元素边界 → 换行 */
      doc.querySelectorAll('br').forEach(function (br) {
        br.parentNode.replaceChild(doc.createTextNode('\n'), br);
      });
      doc.querySelectorAll('*').forEach(function (el) {
        if (BLOCK_TAG_RE.test(el.tagName)) {
          el.insertBefore(doc.createTextNode('\n'), el.firstChild);
          el.appendChild(doc.createTextNode('\n'));
        }
      });

      var text = doc.body.textContent;
      text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
      return text;
    } catch (err) {
      return null;
    }
  }

  input.addEventListener('paste', function (e) {
    var cd = e.clipboardData;
    if (!cd) return;
    var html = cd.getData('text/html');
    if (!html || html.indexOf('<math') === -1) return; /* 普通粘贴走默认路径 */
    var text = extractMathFromHtml(html);
    if (text == null) return;
    e.preventDefault();
    /* execCommand 保留撤销栈；失败时手动插入 */
    var inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch (err) { inserted = false; }
    if (!inserted) {
      var s = input.selectionStart, epos = input.selectionEnd;
      input.value = input.value.slice(0, s) + text + input.value.slice(epos);
      input.selectionStart = input.selectionEnd = s + text.length;
    }
    renderPreview();
  });

  /* ---------- 公式识别 ---------- */
  // 依次匹配：$$...$$  \[...\]  \(...\)  $...$
  // 注意顺序：先 display 后 inline，避免 $$ 被当作两个 $
  var FORMULA_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

  // 分段结果：{ type: 'text', text } 或 { type: 'math', tex, displayMode, smart }
  function parseDelimited(src) {
    var segments = [];
    var last = 0;
    FORMULA_RE.lastIndex = 0;
    var m;
    while ((m = FORMULA_RE.exec(src)) !== null) {
      if (m.index > last) {
        segments.push({ type: 'text', text: src.slice(last, m.index) });
      }
      var tex = m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] != null ? m[3] : m[4];
      var displayMode = m[1] != null || m[2] != null;
      segments.push({ type: 'math', tex: tex, displayMode: displayMode });
      last = m.index + m[0].length;
    }
    if (last < src.length) {
      segments.push({ type: 'text', text: src.slice(last) });
    }
    return segments;
  }

  // 完整管线：软换行合并 → 定界符解析 → 纯文本片段智能识别
  function parseSegments(src) {
    var merged = (window.SmartMath && src.indexOf('$$') === -1 && src.indexOf('\\[') === -1)
      ? SmartMath.mergeSoftLines(src)
      : src;
    var raw = parseDelimited(merged);
    if (!window.SmartMath) return raw;

    var segments = [];
    raw.forEach(function (seg) {
      if (seg.type !== 'text') {
        segments.push(seg);
        return;
      }
      SmartMath.detect(seg.text).forEach(function (s) {
        if (s.type === 'math') {
          segments.push({ type: 'math', tex: s.tex, displayMode: false, smart: true });
        } else {
          segments.push(s);
        }
      });
    });
    return segments;
  }

  /* ---------- MathML 渲染 ---------- */
  function renderMathml(tex, displayMode) {
    return temml.renderToString(tex, { displayMode: displayMode, throwOnError: false });
  }

  /* ---------- HTML 转义 ---------- */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- 预览渲染（段落流：行内公式与文字同段落） ---------- */
  function renderPreview() {
    var src = input.value;
    preview.innerHTML = '';

    if (!src.trim()) {
      preview.innerHTML = '<div class="empty">' + escapeHtml(t('empty')) + '</div>';
      statusEl.textContent = '';
      statusEl.className = 'status';
      btnCopy.disabled = true;
      return;
    }

    var segments = parseSegments(src);
    var mathCount = 0;
    var errorCount = 0;
    var smartCount = 0;

    var para = null;
    function closePara() { para = null; }
    function ensurePara() {
      if (!para) {
        para = document.createElement('p');
        para.className = 'seg-text';
        preview.appendChild(para);
      }
      return para;
    }
    function appendText(text) {
      var lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        if (lines[i] === '') { closePara(); continue; }
        if (i > 0 && para) ensurePara().appendChild(document.createElement('br'));
        ensurePara().appendChild(document.createTextNode(lines[i]));
      }
    }

    segments.forEach(function (seg) {
      if (seg.type === 'text') {
        appendText(seg.text);
        return;
      }

      mathCount++;
      if (seg.smart) smartCount++;

      var wrapper;
      var failed = false;
      try {
        var mathml = renderMathml(seg.tex, seg.displayMode);
        wrapper = document.createElement(seg.displayMode ? 'div' : 'span');
        wrapper.className = (seg.displayMode ? 'math-block' : 'math-inline') + (seg.smart ? ' smart' : '');
        wrapper.innerHTML = mathml;
        wrapper.title = t('copyOneLabel');
        wrapper.setAttribute('tabindex', '0');
        wrapper.setAttribute('role', 'button');
        wrapper.setAttribute('aria-label', t('copyOneLabel'));
        attachSingleCopy(wrapper, seg);
      } catch (err) {
        failed = true;
        errorCount++;
        wrapper = document.createElement('span');
        wrapper.className = 'math-error';
        wrapper.innerHTML = escapeHtml(t('parseError')) + '<code>' + escapeHtml(seg.tex) + '</code>' +
          (err && err.message ? ' — ' + escapeHtml(String(err.message)) : '');
      }

      if (seg.displayMode || failed) {
        closePara();
        preview.appendChild(wrapper);
      } else {
        ensurePara().appendChild(wrapper);
      }
    });

    if (mathCount === 0) {
      statusEl.textContent = t('noFormula');
      statusEl.className = 'status';
      btnCopy.disabled = false;
      return;
    }

    var msg = errorCount > 0
      ? t('statusErr')(mathCount, errorCount)
      : t('statusOk')(mathCount);
    if (smartCount > 0) msg += t('smartNote')(smartCount);
    statusEl.textContent = msg;
    statusEl.className = errorCount > 0 ? 'status err' : 'status ok';
    btnCopy.disabled = false;
  }

  /* ---------- 复制（段落流：行内公式与文字同段落，保持原文紧凑排版） ---------- */
  function buildRichHtml(segments) {
    var html = '';
    var open = false;
    function pOpen() { if (!open) { html += '<p>'; open = true; } }
    function pClose() { if (open) { html += '</p>'; open = false; } }

    segments.forEach(function (seg) {
      if (seg.type === 'text') {
        var lines = escapeHtml(seg.text).split('\n');
        var needBr = false;
        lines.forEach(function (line) {
          if (line === '') { pClose(); needBr = false; return; }
          pOpen();
          if (needBr) html += '<br>';
          html += line;
          needBr = true;
        });
        return;
      }
      var mathml;
      try {
        mathml = renderMathml(seg.tex, seg.displayMode);
      } catch (err) {
        mathml = escapeHtml(seg.tex);
      }
      if (seg.displayMode) {
        pClose();
        html += '<p style="text-align:center">' + mathml + '</p>';
      } else {
        pOpen();
        html += mathml;
      }
    });
    pClose();
    return '<html><body>' + html + '</body></html>';
  }

  async function copyToClipboard(html, plain) {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' })
      })]);
      return true;
    }
    // 降级方案：老浏览器用 execCommand 复制富文本
    var holder = document.createElement('div');
    holder.setAttribute('contenteditable', 'true');
    holder.style.position = 'fixed';
    holder.style.left = '-9999px';
    holder.innerHTML = html;
    document.body.appendChild(holder);
    var range = document.createRange();
    range.selectNodeContents(holder);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = document.execCommand('copy');
    sel.removeAllRanges();
    document.body.removeChild(holder);
    return ok;
  }

  var toastTimer = null;
  function showToast(msg) {
    var el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  async function copyWhole() {
    var src = input.value;
    if (!src.trim()) return;
    var segments = parseSegments(src);
    try {
      var ok = await copyToClipboard(buildRichHtml(segments), src);
      showToast(ok ? t('copiedAll') : t('copyFail'));
    } catch (err) {
      // 常见于未授权剪贴板权限：提示用户点击页面后重试
      showToast(t('copyBlocked'));
    }
  }

  function attachSingleCopy(el, seg) {
    function doCopy() {
      var html = '<html><body>' +
        (seg.displayMode
          ? '<p style="text-align:center">' + renderMathml(seg.tex, true) + '</p>'
          : '<p>' + renderMathml(seg.tex, false) + '</p>') +
        '</body></html>';
      copyToClipboard(html, seg.tex).then(function (ok) {
        showToast(ok ? t('copiedOne') : t('copyFail'));
      }).catch(function () {
        showToast(t('copyBlocked'));
      });
    }
    el.addEventListener('click', doCopy);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doCopy();
      }
    });
  }

  /* ---------- 示例与清空 ---------- */
  btnDemo.addEventListener('click', function () {
    input.value = t('demo');
    renderPreview();
  });

  btnClear.addEventListener('click', function () {
    input.value = '';
    renderPreview();
    input.focus();
  });

  btnCopy.addEventListener('click', copyWhole);

  input.addEventListener('input', renderPreview);

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      copyWhole();
    }
  });

  // 初始化
  applyAppearance();
  applyLang();
  if (location.hash === '#settings') {
    settingsPanel.hidden = false;
    btnSettings.setAttribute('aria-expanded', 'true');
  }
})();
