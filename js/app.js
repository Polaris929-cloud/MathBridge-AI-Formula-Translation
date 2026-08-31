/* MathBridge — AI 公式搬运工 / AI Formula Translator
 * 核心：解析混合文本中的 LaTeX 公式 → Temml 渲染为 MathML →
 * 以 text/html 剪贴板 flavor 复制 → Word/WPS 粘贴时转为原生公式(OMML)。
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
      inputPlaceholder: '把 AI 聊天框里的回复直接粘贴到这里。\n\n支持 $...$ 行内公式、$$...$$ 与 \\[...\\] 独立公式，正文与公式可以混排。',
      previewTitle: '实时预览',
      copyBtn: '复制到 Word',
      hint: 'Ctrl + Enter 快速复制 · 点击公式块可单独复制该公式 · 粘贴后在 Word 里即为原生可编辑公式',
      footer: '原理：LaTeX → MathML → 剪贴板，Word / WPS 粘贴时自动转为原生公式（OMML）。全程在浏览器本地完成，公式内容不上传任何服务器。',
      empty: '左边粘贴 AI 输出，这里会实时显示渲染效果',
      noFormula: '未检测到公式（需要 $...$ 或 $$...$$ 定界符）',
      statusOk: function (n) { return '已识别 ' + n + ' 个公式，全部解析成功'; },
      statusErr: function (n, e) { return '已识别 ' + n + ' 个公式，其中 ' + e + ' 个解析失败'; },
      parseError: '公式解析失败：',
      copyOneLabel: '复制此公式',
      copiedAll: '已复制，去 Word 里 Ctrl+V 即可',
      copiedOne: '公式已复制',
      copyFail: '复制失败，请重试',
      copyBlocked: '复制被浏览器拦截，请点击页面任意处后重试',
      demo: '质能方程 $E = mc^2$ 揭示了质量与能量的等价关系。\n\n' +
        '而最美的公式当属欧拉公式：\n\n$$e^{i\\pi} + 1 = 0$$\n\n' +
        '求解二次方程 $ax^2 + bx + c = 0$ 时，求根公式为：\n\n' +
        '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n' +
        '信号处理中的傅里叶变换定义为：\n\n' +
        '$$F(\\omega) = \\int_{-\\infty}^{\\infty} f(t)\\, e^{-i\\omega t}\\, dt$$'
    },
    en: {
      docTitle: 'MathBridge · AI Formula Translator',
      htmlLang: 'en',
      langBtn: '中文',
      tagline: 'Paste AI formulas into Word — no more garbled code',
      inputTitle: 'Paste AI output',
      demoBtn: 'Load demo',
      clearBtn: 'Clear',
      inputPlaceholder: 'Paste any AI chat reply here.\n\nSupports $...$ inline formulas, $$...$$ and \\[...\\] display formulas, mixed with regular text.',
      previewTitle: 'Live preview',
      copyBtn: 'Copy to Word',
      hint: 'Ctrl + Enter to copy · Click a formula block to copy it alone · Pasted into Word as a native editable equation',
      footer: 'How it works: LaTeX → MathML → clipboard. Word / WPS converts it to a native equation (OMML) on paste. Everything runs locally in your browser — nothing is uploaded.',
      empty: 'Paste AI output on the left — the rendered result appears here',
      noFormula: 'No formula detected (needs $...$ or $$...$$ delimiters)',
      statusOk: function (n) { return n + ' formula' + (n > 1 ? 's' : '') + ' detected, all parsed successfully'; },
      statusErr: function (n, e) { return n + ' formula' + (n > 1 ? 's' : '') + ' detected, ' + e + ' failed to parse'; },
      parseError: 'Failed to parse: ',
      copyOneLabel: 'Copy this formula',
      copiedAll: 'Copied — Ctrl+V into Word now',
      copiedOne: 'Formula copied',
      copyFail: 'Copy failed, please try again',
      copyBlocked: 'Clipboard blocked by browser — click anywhere on the page and retry',
      demo: 'The mass-energy equivalence $E = mc^2$ reveals that mass and energy are interchangeable.\n\n' +
        'But the most beautiful formula is Euler\'s identity:\n\n$$e^{i\\pi} + 1 = 0$$\n\n' +
        'For a quadratic equation $ax^2 + bx + c = 0$, the root formula is:\n\n' +
        '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n' +
        'The Fourier transform in signal processing is defined as:\n\n' +
        '$$F(\\omega) = \\int_{-\\infty}^{\\infty} f(t)\\, e^{-i\\omega t}\\, dt$$'
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
    renderPreview();
  }

  btnLang.addEventListener('click', function () {
    lang = lang === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('mathbridge-lang', lang); } catch (e) { /* ignore */ }
    applyLang();
  });

  /* ---------- 公式识别 ---------- */
  // 依次匹配：$$...$$  \[...\]  \(...\)  $...$
  // 注意顺序：先 display 后 inline，避免 $$ 被当作两个 $
  var FORMULA_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

  // 分段结果：{ type: 'text', text } 或 { type: 'math', tex, displayMode }
  function parseSegments(src) {
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

  /* ---------- MathML 渲染 ---------- */
  function renderMathml(tex, displayMode) {
    return temml.renderToString(tex, { displayMode: displayMode, throwOnError: false });
  }

  /* ---------- HTML 转义 ---------- */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- 预览渲染 ---------- */
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

    segments.forEach(function (seg) {
      if (seg.type === 'text') {
        var p = document.createElement('p');
        p.className = 'seg-text';
        p.textContent = seg.text;
        preview.appendChild(p);
        return;
      }

      mathCount++;
      var wrapper;
      try {
        var mathml = renderMathml(seg.tex, seg.displayMode);
        wrapper = document.createElement(seg.displayMode ? 'div' : 'span');
        wrapper.className = seg.displayMode ? 'math-block' : 'math-inline';
        wrapper.innerHTML = mathml;
        wrapper.title = t('copyOneLabel');
        wrapper.setAttribute('tabindex', '0');
        wrapper.setAttribute('role', 'button');
        wrapper.setAttribute('aria-label', t('copyOneLabel'));
        attachSingleCopy(wrapper, seg);
      } catch (err) {
        errorCount++;
        wrapper = document.createElement('div');
        wrapper.className = 'math-error';
        wrapper.innerHTML = escapeHtml(t('parseError')) + '<code>' + escapeHtml(seg.tex) + '</code>' +
          (err && err.message ? ' — ' + escapeHtml(String(err.message)) : '');
      }
      preview.appendChild(wrapper);
    });

    if (mathCount === 0) {
      statusEl.textContent = t('noFormula');
      statusEl.className = 'status';
      btnCopy.disabled = false;
      return;
    }

    statusEl.textContent = errorCount > 0
      ? t('statusErr')(mathCount, errorCount)
      : t('statusOk')(mathCount);
    statusEl.className = errorCount > 0 ? 'status err' : 'status ok';
    btnCopy.disabled = false;
  }

  /* ---------- 复制 ---------- */
  function buildRichHtml(segments) {
    var parts = segments.map(function (seg) {
      if (seg.type === 'text') {
        return '<p>' + escapeHtml(seg.text).replace(/\n/g, '<br>') + '</p>';
      }
      try {
        var mathml = renderMathml(seg.tex, seg.displayMode);
        return seg.displayMode
          ? '<p style="text-align:center">' + mathml + '</p>'
          : '<p>' + mathml + '</p>';
      } catch (err) {
        return '<p>' + escapeHtml(seg.tex) + '</p>';
      }
    });
    return '<html><body>' + parts.join('') + '</body></html>';
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
  applyLang();
})();
