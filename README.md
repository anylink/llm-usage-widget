# LLM Usage Widget

**一个跨平台桌面悬浮窗,实时显示你订阅的各家大模型平台用量与余额。**

A cross-platform desktop floating widget that shows your LLM platform usage & balance in real time. (Windows / macOS / Linux)

> 🚧 项目早期开发中,当前按 [设计方案](docs/DESIGN.md) 推进里程碑 M1。

## 为什么做这个

订阅了 GLM Coding Plan、Kimi For Coding、DeepSeek、MiniMax、火山方舟、OpenRouter……每家都要打开控制台才能看到用量和余额,太麻烦了。这个项目把所有平台汇总成一个**常驻桌面的悬浮窗**:余额多少、套餐用了多少百分比、距重置还有多久,一眼可见。

## 特性(规划)

- 📊 **多平台聚合** —— 内置 DeepSeek / StepFun / SiliconFlow / OpenRouter / Novita / Kimi / 智谱 GLM / MiniMax / ZenMux / OpenCode Go / 火山方舟 等厂商,开箱即用
- 🖥️ **悬浮窗** —— 自由拖放、边缘缩放、置顶、点击穿透,不进任务栏
- 🎨 **外观随心** —— 透明度、背景、字体颜色、主题包(亮色/暗色/玻璃拟态/像素风)
- 🔔 **阈值提醒** —— 进度条变色 → 悬浮窗气泡 → 系统通知,余量不足早知道
- 👥 **多账户** —— 同一厂商挂多个 Key,全部展示
- 🧩 **厂商可扩展** —— 厂商定义是 TOML 文件,设置界面提供表单+JSON树点选,不改代码接入新厂商
- 🔒 **安全** —— Key 经系统级加密存本地,零遥测
- 🌍 **中英双语**

## 明确不支持

- ❌ 各类中转站(new-api / one-api)的额度查询——本项目**只做官方平台**;有需求可通过自定义厂商机制自行接入。

## 开发

```bash
npm install
npm run dev      # 开发模式
npm run build    # 打包当前平台安装包
```

技术栈:Electron + React + TypeScript + electron-vite。完整架构、厂商 TOML Schema、里程碑计划见 [docs/DESIGN.md](docs/DESIGN.md)。

## 致谢

- [CC Switch](https://github.com/farion1231/cc-switch) —— 厂商数据模型与查询语义的参考
- [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk) —— 悬浮窗交互的灵感来源

## 许可

[MIT](LICENSE)
