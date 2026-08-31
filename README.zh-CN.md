# MathBridge · AI 公式搬运工

简体中文 | **[English](README.md)**

把 AI 生成的 LaTeX 公式**原样粘贴进 Word / WPS**，保持原生可编辑公式格式，不再是乱码。

**[🚀 在线使用](https://polaris929-cloud.github.io/MathBridge-AI-Formula-Translation/)**

![对比：直接粘贴得到乱码源码 vs MathBridge 转换后的 Word 原生公式](assets/demo-comparison.png)

## 为什么需要它

让 ChatGPT / Claude / DeepSeek 写数学内容时，它们输出的是 LaTeX 源码（如 `$E = mc^2$`）。直接复制粘贴到 Word 里，得到的要么是带反斜杠的源码文本，要么是被硬生生拍扁的乱码。

MathBridge 做的事：

```
AI 输出的 LaTeX  →  MathML  →  系统剪贴板(text/html)  →  Word 粘贴时自动转为原生公式(OMML)
```

粘贴后在 Word 里得到的是**原生公式对象**——可以双击编辑、随文档排版，和手动插入的公式完全一致。

## 使用方法

1. 打开 `index.html`（或访问在线部署地址）
2. 把 AI 回复整段粘贴到左侧输入框
3. 右侧实时预览渲染效果
4. 点击 **「复制到 Word」**（或 Ctrl + Enter），到 Word / WPS 里 Ctrl + V

也可以点击预览区中的**单个公式块**，只复制该公式。

## 特性

- **零上传**：全部转换在浏览器本地完成，公式内容不经过任何服务器
- **零依赖部署**：纯静态文件，Temml 引擎已内置在 `assets/vendor/`，可离线使用
- **混合解析**：自动识别 `$...$` 行内公式与 `$$...$$`、`\[...\]` 独立公式，正文与公式混排无缝处理
- **容错**：单条公式解析失败时标红提示，不影响其余部分复制
- **中英双语界面**：右上角一键切换，语言偏好本地记忆
- **界面自定义**：字体大小、字体粗细、背景颜色、文本框高度与圆角均可调节，偏好本地记忆
- **无框架**：原生 HTML/CSS/JS，单目录结构，方便二次开发

## 支持情况

| 粘贴目标 | 效果 |
|---------|------|
| Word 桌面版（2016+） | 原生可编辑公式 |
| WPS Office | 原生可编辑公式 |
| 飞书文档 | 公式渲染为富文本 |
| Word 网页版 | 部分支持，建议用桌面版 |
| 腾讯文档 / Google Docs | 以富文本形式粘贴，格式基本保留 |

## 本地运行

无需构建步骤：

```bash
# 直接用任意静态服务器打开
python -m http.server 8000
# 或
npx serve .
```

然后访问 `http://localhost:8000`。直接双击 `index.html` 也可以工作。

## 测试

```bash
node tests/engine.test.mjs
```

验证 Temml 引擎能把示例公式转换为合法 MathML（5/5 通过）。

## 项目结构

```
mathbridge/
├── index.html              # 页面入口
├── css/style.css           # 样式
├── js/app.js               # 解析 / 渲染 / 剪贴板 / i18n 逻辑
├── tests/engine.test.mjs   # 引擎单元测试
├── assets/vendor/
│   ├── temml.js            # Temml 0.13.5 (LaTeX → MathML)
│   └── temml.css           # 数学字体样式
├── README.md               # English
├── README.zh-CN.md         # 简体中文
└── LICENSE
```

## Roadmap

- [ ] Word 公式 → LaTeX 反向转换（OMML 解析）
- [ ] Unicode 数学符号（∀、≥、∑）智能识别
- [ ] 浏览器插件：在 AI 聊天页面公式块上一键「复制为 Word 公式」
- [ ] 独立 npm 包：`latex-to-clipboard` 核心引擎，供其他编辑器集成
- [ ] 更多界面语言

## 致谢

- [Temml](https://temml.org/) — LaTeX → MathML 转换引擎

## License

[MIT](LICENSE)
