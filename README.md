# LLM Usage Widget

**一个跨平台桌面悬浮窗,实时显示你订阅的各家大模型平台用量与余额。**

A cross-platform desktop floating widget that shows your LLM platform usage & balance in real time. (Windows / macOS / Linux)

> 按 [设计方案](docs/DESIGN.md) 推进,当前进度见下方里程碑标注。

## 为什么做这个

订阅了 GLM Coding Plan、Kimi For Coding、DeepSeek、MiniMax、火山方舟、OpenRouter……每家都要打开控制台才能看到用量和余额,太麻烦了。这个项目把所有平台汇总成一个**常驻桌面的悬浮窗**:余额多少、套餐用了多少百分比、距重置还有多久,一眼可见。

## 特性

- 📊 **多平台聚合** —— 内置 DeepSeek / StepFun / SiliconFlow / OpenRouter / Novita / Kimi / 智谱 GLM / MiniMax / ZenMux / OpenCode Go / 火山方舟 等 12 家厂商,开箱即用
- 🖥️ **悬浮窗** —— 自由拖放、贴边吸附、四边/角缩放、置顶、点击穿透,不进任务栏
- 🎨 **外观随心** —— 背景透明度(文字永远不透明)、四套主题(暗色/亮色/玻璃拟态/像素风)、用户主题热加载、字体颜色覆盖
- 🔔 **阈值提醒三层** —— 进度条变色 + 边框呼吸光 → 悬浮窗气泡 → 系统通知;迟滞防抖,支持每厂商阈值覆盖
- 👥 **多账户** —— 同一厂商挂多个 Key,全部展示
- 🧩 **厂商可扩展** —— 设置界面提供表单编辑器(测试请求 + JSON 树点选填路径),高级用户可直接写 TOML 热重载
- 🖼️ **厂商 LOGO** —— 内置/用户上传均可,无图时主题色 + 首字母兜底
- 🔄 **CC Switch 导入** —— 只读扫描 `~/.cc-switch/cc-switch.db`,自动识别官方平台 Key(中转站不支持)
- 🌍 **中英双语** —— 跟随系统或手动切换,切换即时生效
- 🚀 **自动更新** —— GitHub Releases + electron-updater(推送 `v*` 标签自动三平台构建发布)
- 🔒 **安全** —— Key 经系统级加密存本地,零遥测

## 明确不支持

- ❌ 各类中转站(new-api / one-api)的额度查询——本项目**只做官方平台**;有需求可通过自定义厂商机制自行接入。

## 开发

```bash
npm install
npm run dev      # 开发模式
npm run build    # 打包当前平台安装包
```

> **里程碑进度**:M1 可用 ✅ · M2 好用 ✅ · M3 大众化 ✅ · M4 生态(OAuth 订阅账户 / Grok / 签名公证)🚧

技术栈:Electron + React + TypeScript + electron-vite。完整架构、厂商 TOML Schema、里程碑计划见 [docs/DESIGN.md](docs/DESIGN.md)。
> Schema 以 `resources/vendors/*.toml` 实际文件为准 —— 支持 percent / percentFrom / complement / computed 等多种提取方式与请求回退链,比设计文档示例更丰富。

## 致谢

- [CC Switch](https://github.com/farion1231/cc-switch) —— 厂商数据模型与查询语义的参考
- [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk) —— 悬浮窗交互的灵感来源

## 许可

[MIT](LICENSE)
