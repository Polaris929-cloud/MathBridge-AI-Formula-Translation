/*! DocxBuilder — MathBridge 浏览器端「导出 Word」docx 生成器
 *
 * 输入：与 app.js parseSegments 相同的分段数组：
 *   { type:'text', text } 或 { type:'math', tex, displayMode, smart }
 * 流程：每个公式段用 MathML2OMML 转成原生 OMML（<m:oMathPara> 居中），
 *       文本段转成 w:p；组装最小合法 OOXML docx，用内置 STORE zip 打包成 Blob。
 *
 * 为何原生 OMML：WPS 的 MathML→自身公式转换会漏掉中文下标字号；OMML 是
 * Word/WPS 共同原生语言，下标由各自引擎保证（R_总 的「总」必缩小）。
 *
 * 零依赖：内置 CRC-32 + STORE(方法0) zip 写入，纯浏览器可用。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DocxBuilder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OMML = (typeof MathML2OMML !== 'undefined') ? MathML2OMML : null;

  /* ---------------- XML 工具 ---------------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function xmlTop() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  }
  function textRun(t) {
    return '<w:r><w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>';
  }

  /* 把一个含换行的文本段，转成一组 w:p 段落（连续空行分隔；单换行→<w:br/>） */
  function textToParas(text) {
    var paras = [];
    var cur = [];
    var lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line === '') {
        if (cur.length) { paras.push(cur); cur = []; }
        continue;
      }
      cur.push(textRun(line));
    }
    if (cur.length) paras.push(cur);
    return paras;
  }

  /* ---------------- docx 部件 ---------------- */
  function buildBody(segments) {
    var body = '';
    var hasTextPara = false;

    segments.forEach(function (seg) {
      if (seg.type === 'text') {
        var paras = textToParas(seg.text);
        paras.forEach(function (runs) {
          body += '<w:p><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/>' +
            '<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr>' +
            '</w:pPr>' + runs.join('') + '</w:p>';
          hasTextPara = true;
        });
        return;
      }
      // 公式段 → 原生 OMML 居中块
      var mathml, inner = '';
      try {
        if (typeof temml !== 'undefined') {
          mathml = temml.renderToString(seg.tex, { displayMode: true, throwOnError: false });
        } else {
          mathml = '';
        }
        if (mathml && mathml.indexOf('ParseError') === -1 && OMML) {
          inner = OMML.toOMML(mathml);
        }
      } catch (e) { inner = ''; }
      if (!inner) {
        // 兜底：渲染失败就按文本输出该公式的 LaTeX，避免内容丢失
        body += '<w:p><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/>' +
          '<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr>' +
          '</w:pPr>' + textRun(seg.tex) + '</w:p>';
        return;
      }
      body += '<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>' +
        '<m:oMath>' + inner + '</m:oMath></m:oMathPara>';
    });

    if (!hasTextPara) {
      // 至少保证 body 非空（Word 允许空 body，这里预防）
      body = '<w:p><w:pPr/></w:p>' + body;
    }
    return body;
  }

  function makeParts(segments) {
    var bodyXml = buildBody(segments);
    var doc =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body>' + bodyXml +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
      '</w:body></w:document>';

    var contentTypes =
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>';

    var rels =
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';

    var docRels =
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var styles =
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '</w:styles>';

    return [
      { name: '[Content_Types].xml', data: strBytes(xmlTop() + contentTypes) },
      { name: '_rels/.rels', data: strBytes(xmlTop() + rels) },
      { name: 'word/document.xml', data: strBytes(xmlTop() + doc) },
      { name: 'word/_rels/document.xml.rels', data: strBytes(xmlTop() + docRels) },
      { name: 'word/styles.xml', data: strBytes(xmlTop() + styles) }
    ];
  }

  /* ---------------- UTF-8 / CRC32 / STORE zip ---------------- */
  function strBytes(str) {
    // UTF-8 编码字符串为 Uint8Array
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    // 降级（几乎用不到）
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return new Uint8Array(out);
  }

  var CRC_TABLE = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(v) { return [v & 0xff, (v >>> 8) & 0xff]; }
  function u32(v) {
    return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  }

  function concatBytes(arrays) {
    var len = 0;
    arrays.forEach(function (a) { len += a.length; });
    var out = new Uint8Array(len);
    var p = 0;
    arrays.forEach(function (a) { out.set(a, p); p += a.length; });
    return out;
  }

  /* 打包为 STORE（无压缩）zip，写入本地文件头 + 中央目录 */
  function zipFiles(entries) {
    var chunks = [];
    var central = [];
    var offset = 0;
    var encName = function (n) {
      var b = strBytes(n);
      return { bytes: b, flag: 0x0800 }; /* UTF-8 名字，置 flag bit 11 */
    };

    entries.forEach(function (e) {
      var nameBytes = strBytes(e.name);
      var crc = crc32(e.data);
      var size = e.data.length;
      var flag = 0x0800; /* UTF-8 */

      // 本地文件头
      var lh = new Uint8Array(30);
      var lv = 0;
      lh[lv++] = 0x50; lh[lv++] = 0x4b; lh[lv++] = 0x03; lh[lv++] = 0x04; // signature
      lh[lv++] = 20; lh[lv++] = 0;        // version needed
      lh[lv++] = flag & 0xff; lh[lv++] = (flag >> 8) & 0xff;
      u16(0).forEach(function (b) { lh[lv++] = b; }); // compression method 0 (STORE)
      u16(0).forEach(function (b) { lh[lv++] = b; }); // mod time
      u16(0).forEach(function (b) { lh[lv++] = b; }); // mod date
      u32(crc).forEach(function (b) { lh[lv++] = b; });
      u32(size).forEach(function (b) { lh[lv++] = b; }); // comp size
      u32(size).forEach(function (b) { lh[lv++] = b; }); // uncomp size
      u16(nameBytes.length).forEach(function (b) { lh[lv++] = b; });
      u16(0).forEach(function (b) { lh[lv++] = b; }); // extra len
      chunks.push(lh, nameBytes, e.data);

      // 中央目录记录
      var ch = new Uint8Array(46);
      var cv = 0;
      ch[cv++] = 0x50; ch[cv++] = 0x4b; ch[cv++] = 0x01; ch[cv++] = 0x02;
      u16(20).forEach(function (b) { ch[cv++] = b; });   // version made by
      u16(20).forEach(function (b) { ch[cv++] = b; });   // version needed
      u16(flag).forEach(function (b) { ch[cv++] = b; });
      u16(0).forEach(function (b) { ch[cv++] = b; });    // method
      u16(0).forEach(function (b) { ch[cv++] = b; });    // time
      u16(0).forEach(function (b) { ch[cv++] = b; });    // date
      u32(crc).forEach(function (b) { ch[cv++] = b; });
      u32(size).forEach(function (b) { ch[cv++] = b; });
      u32(size).forEach(function (b) { ch[cv++] = b; });
      u16(nameBytes.length).forEach(function (b) { ch[cv++] = b; }); // nameLen
      u16(0).forEach(function (b) { ch[cv++] = b; }); // extraLen
      u16(0).forEach(function (b) { ch[cv++] = b; }); // commentLen
      u16(0).forEach(function (b) { ch[cv++] = b; }); // disk number start
      u16(0).forEach(function (b) { ch[cv++] = b; }); // internal file attrs
      u32(0).forEach(function (b) { ch[cv++] = b; }); // external file attrs
      u32(offset).forEach(function (b) { ch[cv++] = b; });
      central.push(ch, nameBytes);
      offset += 30 + nameBytes.length + e.data.length;
    });

    var cdStart = offset;
    var centralBytes = concatBytes(central);
    var cdSize = centralBytes.length;

    var eocd = new Uint8Array(22);
    var ev = 0;
    eocd[ev++] = 0x50; eocd[ev++] = 0x4b; eocd[ev++] = 0x05; eocd[ev++] = 0x06;
    u16(0).forEach(function (b) { eocd[ev++] = b; });
    u16(0).forEach(function (b) { eocd[ev++] = b; });
    u16(entries.length).forEach(function (b) { eocd[ev++] = b; });
    u16(entries.length).forEach(function (b) { eocd[ev++] = b; });
    u32(cdSize).forEach(function (b) { eocd[ev++] = b; });
    u32(cdStart).forEach(function (b) { eocd[ev++] = b; });
    u16(0).forEach(function (b) { eocd[ev++] = b; });

    return concatBytes(chunks.concat([centralBytes, eocd]));
  }

  /**
   * 生成一个「文档.docx」Blob。
   * @param {Array} segments parseSegments 的输出
   * @returns {Blob}
   */
  function buildDocx(segments) {
    var parts = makeParts(segments);
    var zipped = zipFiles(parts);
    return new Blob([zipped.buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------------- Node 侧测试辅助：直接产出 Uint8Array ---------------- */
  function buildUint8(segments) {
    var parts = makeParts(segments);
    return zipFiles(parts);
  }

  return { buildDocx: buildDocx, buildUint8: buildUint8 };
});
