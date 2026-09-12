# LLM Usage Widget — 完整设计方案

> 版本:v1.1(2026-09-12)
> 状态:定稿,进入实施
> 技术栈:**Electron**(v1.0 曾评估 Tauri,因开发机工具链成本改定 Electron,其余设计不受影响)
> 仓库:https://github.com/anylink/llm-usage-widget

---

## 1. 项目概述

### 1.1 一句话定位

一个跨平台桌面悬浮窗应用:在屏幕上常驻一个小巧的悬浮窗,实时展示多家大模型平台的**套餐用量 / 账户余额**,支持拖放、缩放、透明度调节、主题换肤与阈值提醒。

### 1.2 目标用户

订阅了多家大模型服务(GLM Coding Plan、Kimi For Coding、DeepSeek、MiniMax、火山方舟、OpenRouter 等)的开发者与重度用户。**面向大众**,不假设用户会手写配置文件。

### 1.3 核心价值

- **不用打开任何 App**:用量信息常驻桌面,一眼可见;
- **多平台聚合**:CC Switch / 各厂商官网都要逐个点进去看,这里汇总成一屏;
- **跨平台**:Windows / macOS / Linux 一套代码;
- **可扩展**:厂商定义文件化(TOML),社区可以不改代码接入新厂商;
- **零门槛**:Node.js 生态,贡献者众;用户全程图形界面。

### 1.4 项目起源与参考

- 作者已有一个 ESP32-S3 硬件版本(`esp32/llm-usage-display`),固件直连五家厂商 API 查询用量,LVGL 多页卡片展示。本项目是其桌面端"姊妹篇",数据模型与厂商适配逻辑同源。
- 参考项目:
  - [CC Switch](https://github.com/farion1231/cc-switch)(MIT,技术栈 Tauri/Rust):厂商数据模型、错误双通道语义、厂商覆盖清单;
  - [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk)(AGPL-3.0,技术栈 Electron):悬浮窗交互形态与主题包机制的同栈先例。
- 本项目从零实现,不复制上述项目的代码。

---

## 2. 需求清单

### 2.1 功能需求

| 编号 | 需求 | 说明 |
|---|---|---|
| F1 | 厂商用量展示 | 每厂商一卡:LOGO、名称、余额/套餐主数值、利用率进度条、窗口倒计时 |
| F2 | 多账户 | 同一厂商支持配置多个账户(不同 Key),全部展示 |
| F3 | 悬浮窗交互 | 无边框透明窗,自由拖放、边缘缩放、置顶开关、点击穿透开关、不进任务栏 |
| F4 | 外观调节 | **窗体背景透明度可调(0-100%),文字/图标/进度条保持完全不透明,视觉上悬浮于桌面**;背景设置(纯色/渐变/图片)、字体颜色、主题包 |
| F5 | 厂商 LOGO | 内置厂商带 SVG LOGO;自定义厂商可上传图片,无图时主题色+首字母兜底 |
| F6 | 阈值提醒 | 三层:进度条变色 → 悬浮窗气泡 → 系统通知;支持百分比与绝对值两种阈值;迟滞防抖 |
| F7 | 图形化设置 | 全部配置走设置界面(独立窗口);TOML 仅作为持久化格式与高级用户入口 |
| F8 | 厂商可扩展 | 用户可在设置界面通过表单+JSON 树点选新增厂商;高级用户可直接写 TOML,热重载生效 |
| F9 | 全厂商预置 | 内置 CC Switch 全部厂商(见 §8 覆盖矩阵),开箱即用 |
| F10 | 托盘 | 托盘图标 + 菜单:立即刷新、显示/隐藏、点击穿透开关、打开设置、退出 |
| F11 | 首次运行向导 | 无配置时引导添加第一个厂商;支持从 CC Switch 导入已有 Key(可选) |
| F12 | 国际化 | 中文/英文起步 |
| F13 | 自动更新 | electron-updater + GitHub Releases |

### 2.2 非功能需求

| 编号 | 需求 | 目标 |
|---|---|---|
| N1 | 资源占用 | 常驻内存 ≤ 250MB(Electron 基线),空闲 CPU ≈ 0;相比 Tauri 方案的差距已在选型时接受 |
| N2 | 平台 | Windows 10+ / macOS 12+ / 主流 Linux |
| N3 | 安全 | API Key 仅存本地并加密(Electron safeStorage);零遥测;不出网到任何非厂商域名 |
| N4 | 健壮性 | 单厂商接口故障不影响其他厂商;坏配置文件不崩溃,UI 提示;keep-last-good |
| N5 | 节流 | 默认 60s 轮询,可调(30s–30min);请求超时 15s;指数退避 |

---

## 3. 技术选型

### 3.1 结论

**Electron + React 18 + TypeScript + electron-vite**,打包用 electron-builder。业务逻辑(厂商引擎、调度器)全部在主进程(Node.js),渲染进程只做 UI,通过 contextBridge 通信。

### 3.2 理由

1. **零原生工具链**:Node 生态即可开发、可打包,不依赖 MSVC/Xcode 本地安装,贡献者上手成本低(这是本项目的决定性因素);
2. 同栈先例:Clawd on Desk(Electron)已验证透明悬浮窗、拖放缩放、主题包整条链路;CC Switch 验证了厂商查询的业务设计(其 Tauri/Rust 实现仅作语义参考,MIT 许可允许);
3. Node 内置能力正好覆盖难点:Node `crypto` 原生支持 HMAC-SHA256(火山 SigV4 签名)、`net`/`fetch` 处理请求、`safeStorage` 加密 Key;
4. React 生态适合本项目的"schema 驱动表单 + JSON 树点选"设置界面与 i18n;
5. electron-builder 一套配置产出三平台安装包,electron-updater 接 GitHub Releases 自动更新。

### 3.3 备选对比(为何不选)

| 方案 | 不选原因 |
|---|---|
| Tauri 2 | 内存/体积显著更优,但本地开发链路依赖 MSVC 等原生工具链,与"零门槛、面向大众"的目标冲突(评估记录见 v1.0) |
| Python + PySide | 打包(PyInstaller)之痛、UI 精致度、分发体积都不适合大众产品 |
| 原生三端 | 成本三倍,单人不现实 |
| 纯 Web/PWA | 无法置顶、无法脱离浏览器常驻,不满足 F3 |

---

## 4. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                 Electron 主进程 (Node.js)                 │
│                                                          │
│  engine/              通用厂商查询引擎(TOML 驱动)        │
│   ├─ loader          vendors/*.toml 加载 + schema 校验    │
│   ├─ executor        请求执行(回退链、超时、退避)         │
│   ├─ extractor       JSON 路径提取 + 变换白名单           │
│   └─ plugins         命名插件注册表(见 §7.4)             │
│                                                          │
│  scheduler            轮询调度(错峰、数据代数、状态机)    │
│  alert                阈值状态机(OK/WARN/CRIT + 迟滞)     │
│  config               vendors/ + accounts.json + display.json │
│  safeStorage          API Key 加密存储                    │
│  tray                 托盘与菜单                          │
│  windows              悬浮窗 + 设置窗(BrowserWindow 管理) │
│                                                          │
│        │ contextBridge IPC(数据代数变化推事件)            │
├────────┼───────────────────────────────────────────────┤
│        ▼         渲染进程 (React, contextIsolation 开启)  │
│  悬浮窗 widget:卡片渲染 / 拖放缩放 / 透明度 / 主题 / 气泡  │
│  设置窗口 settings:厂商管理 / 账户管理 / 显示 / 提醒 / 关于 │
└─────────────────────────────────────────────────────────┘
```

**原则:调度与查询归主进程,渲染进程零网络、零 Node。** 前端通过 `dataGeneration` 计数器(借鉴 ESP32 固件的 data generation 机制)感知数据变化,代数变化即重绘;手动刷新走 IPC invoke。

安全基线:`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、CSP 白名单、所有窗口禁 remote 模块。

---

## 5. 数据模型(归一化)

所有厂商的查询结果归一化为统一结构(语义对齐 ESP32 固件的 `usage_entry_t` 与 CC Switch 的 `UsageData`/`QuotaTier`):

```typescript
type EntryKind = 'balance' | 'quota'

type Status =
  | 'ok' | 'updating'
  | 'no-key' | 'network' | 'http' | 'auth' | 'parse' | 'disabled'

interface QuotaWindow {
  label: string            // "5h" / "wk" / "mo"
  utilization: number      // 0-100
  resetEpoch?: number      // 绝对 UTC 秒;倒计时由前端用 reset-now 计算
}

interface UsageEntry {
  vendorId: string         // "kimi"
  accountId: string        // "kimi-1"
  accountName: string      // 用户起的名
  kind: EntryKind
  status: Status
  value?: number           // 主数值(余额金额 或 套餐已用)
  unit?: string            // "CNY" / "USD" / "%"
  utilization?: number     // 0-100,余额型为 undefined
  message?: string         // 错误/提示文案(已本地化 key)
  queriedAt: number        // epoch 秒
  windows: QuotaWindow[]   // 套餐型:多时间窗口
}
```

**错误双通道语义**(照抄 CC Switch 的成熟设计):

- `瞬时` = 网络不可达/超时/读体中断 → 保留上次成功值(keep-last-good),UI 显示"最后更新于 xx 分钟前";
- `确定性失败` = 空 Key/401/403/响应非法/业务错误码 → 立即显示错误态(如"鉴权失败,请检查 Key");
- 实现细节:先取 `arrayBuffer()` 再解析,把"读体失败"(瞬时)与"JSON 解析失败"(确定性)区分开。

---

## 6. 厂商定义格式(TOML Schema)

一个厂商一个文件,放在配置目录 `vendors/` 下。**Schema 即表单**:设置界面的"添加厂商"表单由本 schema 驱动生成。

```toml
# vendors/kimi.toml
id       = "kimi"
name     = "Kimi For Coding"
kind     = "quota"              # balance | quota
logo     = "kimi"               # 内置 SVG 名,自定义厂商可为文件路径
color    = "#1B0F00"            # 主题色:进度条 / LOGO 兜底 monogram
homepage = "https://platform.moonshot.cn"   # 点击卡片跳转

[auth]
style  = "bearer"               # bearer | raw | header:<name> | plugin:<name>
fields = ["key"]                # 凭证字段声明,设置界面据此渲染表单
                                # 火山方舟为 ["key","secret","region"]

[[request]]                     # 请求链:按序尝试,前一成功即止(回退)
method  = "GET"
url     = "https://api.kimi.com/coding/v1/usages"
timeout_ms = 15000
# raw 样式示例(智谱不加 Bearer): auth.style = "raw"
# 自定义头示例:    auth.style = "header:X-Api-Key"

[check]                         # 业务级成功标志(可选)
path  = "success"
equals = true
error_message_path = "message"  # 失败时从这里取文案

[parse]
kind = "quota"
# 窗口数组型:从数组中提取多个窗口
window_list_path = "data.usage_limits"
[[parse.window_map]]            # 数组元素 → 窗口的映射规则
match_path    = "window"        # 该字段值匹配下列 label 之一
match_values  = ["five_hour", "5h"]
label         = "5h"
used_path     = "usage_percent"
reset_path    = "reset_time"
```

### 6.1 提取与变换规则

- **路径语法**:点路径 + 数组下标 + `[N]`,如 `data.usage_limits[0].reset_time`;支持数组展开 `[*]`(配 `window_map` 逐元素提取);
- **变换白名单**(禁止任意表达式,保证配置可校验):
  - `scale: 0.0001` — 数值缩放(Novita 余额单位为万分之一美元)
  - `computed: "total - used"` — 引用已提取字段做四则(OpenRouter)
  - `percent_from: {used: "...", total: "..."}` — 由已用/总量算利用率
  - `epoch_from: auto` — 秒/毫秒时间戳与 ISO8601 自适应(CC Switch `extract_reset_time` 同款语义)
- **窗口标签归一**:各厂商叫法不同,统一归一为 `5h / wk / mo` 三个标准窗口 + 保留原始 label 备用。

### 6.2 凭证分离

`vendors/*.toml` 是**无密钥**的厂商定义(可随仓库分发、可公开);密钥只存在 `accounts.json`:

```json
{
  "kimi": [{ "id": "kimi-1", "name": "主力号", "key": "<safeStorage 密文引用>" }],
  "volcengine": [{ "id": "volc-1", "name": "火山", "key": "AK...", "secret": "...", "region": "cn-beijing" }]
}
```

Key 的实际存储:经 Electron `safeStorage` 加密后存 `accounts.json`(OS 级 DPAPI/Keychain 后端);safeStorage 不可用时降级明文并在设置界面醒目警示。

---

## 7. 查询引擎与插件

### 7.1 通用执行流程

```
调度器触发 → 取厂商定义+账户凭证 → 按请求链依次:
  构造请求(鉴权头/签名) → fetch(15s 超时,AbortController)
  → HTTP 判定:401/403 → auth 态终止;非 2xx → http 态
  → 读体 → JSON.parse → check 校验 → 路径提取 + 变换
  → 归一化 UsageEntry → 写缓存(带数据代数)
```

### 7.2 请求链(回退)

`[[request]]` 数组按序执行:前一请求成功即止;用于火山的"Agent Plan 探测 → 失败回落 Coding Plan 探测"模式,也可用于厂商接口改版期的双端点过渡。

### 7.3 插件接口

插件接管"鉴权头构造"或"整个请求+解析",契约(TypeScript):

```typescript
interface VendorPlugin {
  id: string
  // 返回附加到请求上的头;返回 undefined 表示不介入鉴权
  authHeaders?(ctx: PluginContext): Promise<Record<string, string>>
  // 完全自管请求与解析时实现;返回 undefined 表示走通用流程
  execute?(ctx: PluginContext): Promise<UsageEntry | undefined>
}

interface PluginContext {
  def: VendorDef        // 厂商 TOML 解析结果
  cred: Credentials     // 该账户的凭证 { key?, secret?, region? }
  req: RequestSpec      // 当前 [[request]] 条目
  fetch: typeof fetch
}
```

### 7.4 内置插件清单

| 插件 | 覆盖厂商 | 说明 |
|---|---|---|
| `volcengine_sigv4` | 火山方舟 | 火山变体 SigV4,移植自作者 ESP32 固件的 mbedTLS HMAC-SHA256 实现(Node `crypto` 原生支持);双 plan 回退在请求链里声明 |
| `oauth_claude` | Claude Pro/Max | 读 safeStorage 加密的 OAuth 凭据、过期检查(二期) |
| `oauth_codex` | Codex/ChatGPT | 同上(二期) |
| `oauth_gemini` | Gemini | OAuth + token 刷新 + project_id(二期) |
| `grok_grpc` | Grok | gRPC-web + protobuf 二进制解析(二期) |

---

## 8. 厂商覆盖矩阵(内置预置,端点均经 CC Switch 源码与作者 ESP32 固件双重验证)

### 8.1 余额型(纯 TOML)

| 厂商 | 端点 | 鉴权 | 解析要点 |
|---|---|---|---|
| DeepSeek | `GET api.deepseek.com/user/balance` | Bearer | `balance_infos[*].total_balance`,币种随 `currency`;`is_available` |
| StepFun | `GET api.stepfun.com/v1/accounts` | Bearer | 账户余额字段 |
| SiliconFlow | `GET api.siliconflow.cn/v1/user/info` | Bearer | `data.balance`;英文站 `.com` 变体 |
| OpenRouter | `GET openrouter.ai/api/v1/credits` | Bearer | `data.total_credits/total_usage`,**计算字段** `remaining = total - usage`,单位 USD |
| Novita AI | `GET api.novita.ai/v3/user/balance` | Bearer | `availableBalance`,**缩放 ×0.0001**(万分之一美元) |

### 8.2 套餐型(纯 TOML)

| 厂商 | 端点 | 鉴权 | 解析要点 |
|---|---|---|---|
| Kimi For Coding | `GET api.kimi.com/coding/v1/usages` | Bearer | 多窗口套餐额度 |
| 智谱 GLM | `GET open.bigmodel.cn/api/monitor/usage/quota/limit` | **裸 Key(不加 Bearer)** | 窗口数组,按窗口字段归类 5h/周/月;英文站 `api.z.ai` 同构 |
| 智谱团队版 | 同上 + `?type=2` | 裸 Key | 与个人版同端点,靠参数区分(对应 CC Switch 显式路由的经验) |
| MiniMax | `GET api.minimaxi.com/v1/api/openplatform/coding_plan/remains` | Bearer | CN 站 `.minimaxi.com` / 国际站 `.minimax.io` |
| ZenMux | `GET {base_url}`(用量端点) | Bearer | `success:true` 业务检查;`data.quota_5_hour.usage_percentage / resets_at` 等 |
| OpenCode Go | `GET opencode.ai/zen/go/v1/usage` | Bearer | `usage.rolling/weekly/monthly.percent` + `resetsAt`;percent=0 时 resetsAt 是占位值,丢弃倒计时 |

### 8.3 插件型

| 厂商 | 方式 | 要点 |
|---|---|---|
| 火山方舟 | `volcengine_sigv4` 插件(M1) | `POST open.volcengineapi.com/?Action=GetAFPUsage&Region=cn-beijing&Version=2024-01-01`,AK/SK 签名;无订阅回落 `GetCodingPlanUsage`;region 从 base_url 推断 |
| Claude Pro/Max | `oauth_claude`(二期) | OAuth 凭据读 safeStorage,用量端点 |
| Codex | `oauth_codex`(二期) | 同上 |
| Gemini | `oauth_gemini`(二期) | token 刷新 + project_id |
| Grok | `grok_grpc`(二期) | gRPC-web + protobuf,手工 varint 解析 |

---

## 9. 悬浮窗交互设计

### 9.1 窗口行为

- 无边框 + 透明 + 置顶(可关)+ 不进任务栏 + 单实例;
- **拖放**:卡片头部按住即拖(`-webkit-app-region: drag`);贴边吸附(8px 磁吸);位置持久化;
- **缩放**:右下角 + 边缘拖拽柄(自绘,CSS 不可拖区);宽度 200–480px,高度自适应;尺寸持久化;
- **点击穿透**:托盘菜单/快捷键切换(`setIgnoreMouseEvents` with forward);穿透模式下窗口对鼠标完全透明,适合全屏工作时挂角落;
- 多显示器:DPI 感知,跨屏拖动正常。

### 9.2 内容布局(单卡片)

```
┌────────────────────────────┐
│ [LOGO] Kimi For Coding   ⟳ │   ← 头部:LOGO + 名称 + 手动刷新(drag 区)
│ ████████████░░░░  72%      │   ← 当前窗口利用率(绿/橙/红)
│ 5h  72% · 重置于 14:32     │   ← 窗口行,多行滚动/翻页
│ wk  31%        mo  12%     │
│ 更新于 1 分钟前             │   ← 状态行(keep-last-good 时提示)
└────────────────────────────┘
```

- 多厂商:卡片轮播(自动翻页间隔可配)或左右滑动;多账户:卡片内分账户小节;
- 错误态:LOGO 变灰 + 状态行显示错误文案(鉴权失败给"去设置"按钮);
- 余额型:大号数字 + 单位,无进度条。

### 9.3 主题系统

- 一个主题 = 一份 CSS 变量集:`--bg`(纯色/渐变/图片)、`--text-primary`、`--text-secondary`、`--accent`、`--warn`、`--danger`、进度条样式、圆角、描边;
- 内置主题:亮色、暗色、玻璃拟态(半透明+模糊)、像素风(呼应桌宠气质);
- 用户主题:`themes/*.css` 丢进目录即被识别热加载;
- **透明度语义(定稿)**:调节的是**卡片背景的 alpha 通道**(CSS 变量 `--bg-alpha`),文字、图标、进度条永远保持 100% 不透明——呈现"文字悬浮在桌面"的效果;整窗 `opacity` 属性禁用;
- **透明度调节**:卡片背景 alpha(0-100%),对比度保护同上。
- **对比度保护**:文字色与背景自动做亮度对比检查,不足时自动描边/加底板。

---

## 10. 阈值提醒

### 10.1 三层提醒

| 层 | 形式 | 说明 |
|---|---|---|
| L1 卡片内 | 进度条变色(绿→70%橙→90%红)+ 边框呼吸光 | 零成本,跟随轮询 |
| L2 气泡 | 悬浮窗角落弹出对话气泡:"Kimi 5h 窗口已用 85%,14:32 重置" | 可点击跳设置;自动收回;同阈值恢复前不重弹 |
| L3 系统通知 | Electron `Notification` API,原生 toast | 可按厂商开关 |

### 10.2 阈值配置(存 display.json)

```json
{
  "alerts": {
    "default": { "warn_pct": 70, "crit_pct": 90, "balance_min": 10.0, "notify": true },
    "overrides": { "deepseek": { "balance_min": 20.0, "notify": false } }
  }
}
```

### 10.3 状态机与迟滞

- 每账户每窗口一个状态机:`OK → WARN → CRIT`,报警阈值 80%、解除阈值 75%(迟滞 5%,防横跳);
- 报警动作每状态只执行一次;解除后允许下次报警;重启后允许重报一次;
- 余额型用绝对值阈值(剩余 ≤ N 元),无迟滞需求。

---

## 11. 设置界面

独立常规窗口(非悬浮窗),从托盘或卡片右键菜单打开。**配置动线对齐 CC Switch:两级页面**——

1. **厂商选择页(默认页)**:全部厂商一屏列出(LOGO/名称/类型/账户数/已配置·未配置徽标),点击任意厂商进入其配置页;另含显示设置(背景不透明度等)、高级入口;
2. **厂商配置页**:按该厂商 `auth.fields` 声明渲染凭证表单(API Key / SecretKey / Region),支持多账户(可添加账户),保存即写回 `accounts.json`(safeStorage 加密)并热重载调度器,立即生效;
3. **厂商编辑器**(schema 驱动表单):基本信息 → 鉴权(风格/字段)→ 请求(URL/方法/超时)→ 解析路径。**测试请求按钮**:真实发一次请求,把响应 JSON 渲染成可点击树,点选字段即自动填入解析路径;测试通过才允许保存;
4. **显示**:背景不透明度、尺寸、背景、主题选择、字体颜色覆盖、轮询间隔、自动翻页;
5. **提醒**:默认阈值 + 每厂商覆盖 + L3 通知开关;
6. **导入**:从 CC Switch 导入(`~/.cc-switch/cc-switch.db` 只读,WAL 模式,仅读取官方平台 Key);
7. **关于**:版本、更新检查、开源致谢。

**启动加载顺序(定稿)**:读 `display.json`(外观)→ `accounts.json`(凭证)+ `vendors/*.toml`(厂商定义)→ 建窗建托盘 → 调度器按错峰节奏首轮查询。无任何配置时不显示空数据,悬浮窗给出"打开设置"引导,未配置厂商在列表页标"未配置",随时可进配置页补配。

高级入口:每个页面提供"在编辑器中打开对应 TOML/JSON"按钮,文件改动被监听(fs.watch),双向热同步(编辑器改动 → 界面即时反映)。

---

## 12. 配置文件总览

```
app.getPath('userData')/
├─ vendors/                      # 厂商定义(无密钥);内置预置首启时复制至此
│   ├─ deepseek.toml  kimi.toml  glm.toml  minimax.toml  ...
│   └─ (用户自定义也可放这里)
├─ accounts.json                 # 账户与凭证(safeStorage 加密)
├─ display.json                  # 悬浮窗外观/位置/尺寸/主题/提醒阈值
└─ themes/                       # 用户主题 *.css
```

---

## 13. 安全与隐私

- API Key 经 Electron `safeStorage` 加密后落盘(DPAPI/Keychain 后端),降级明文必须警示;
- 渲染进程 `sandbox: true` + `contextIsolation: true`,无 Node 能力,无远程内容加载;
- 出网目标仅各厂商官方域名(预置厂商域名白名单硬编码在预置文件里,自定义厂商由用户自己负责);
- 零遥测、零统计、零上报;崩溃日志仅存本地;
- 自动更新走 GitHub Releases HTTPS + electron-updater 签名校验。

---

## 14. 国际化

- i18next,`zh-CN` 与 `en` 双语起步;错误文案主进程产生 message key,渲染进程渲染;
- 日期/倒计时格式随系统 locale。

---

## 15. 分发

- CI:GitHub Actions 三平台矩阵构建(windows-latest / macos-latest / ubuntu-22.04),electron-builder 产物 NSIS(.exe)/ .dmg / .AppImage + .deb;
- 架构:x64 + macOS ARM64(Windows ARM 后续);
- 更新:electron-updater,latest.yml 发布在 Releases;
- 签名:macOS 公证(需 Apple Developer 账号)、Windows 签名(证书到位前 README 说明 SmartScreen 处理办法);
- Homebrew cask / AUR:社区渠道,后续接入。

---

## 16. 里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| **M1 可用** | 引擎 + 12 厂商预置(含火山插件)+ 调度器 + 悬浮窗(拖放/缩放/透明度)+ 托盘 | 五家主力厂商(DeepSeek/Kimi/GLM/MiniMax/火山)数据正确显示 |
| **M2 好用** | 设置界面全套 + JSON 树点选 + 主题系统 + LOGO/字色 + 阈值提醒三层 | 不写任何文件即可完成全部配置;提醒三档可用 |
| **M3 大众化** | 首运行向导 + CC Switch 导入 + i18n + 文档 | 全新机器 10 分钟内完成安装到看到数据 |
| **M4 生态** | OAuth 三插件(Claude/Codex/Gemini)+ Grok + 自动更新 + 签名分发 | 官方订阅用户可用;三平台静默更新 |

---

## 17. 风险与对策

| 风险 | 对策 |
|---|---|
| 厂商接口改版(OpenCode Go 上线当天就改过一次) | 预置文件可与代码分离更新;回退链机制;解析失败显示原始错误而非空白 |
| 厂商无配额 API 或字段变化 | 归一化模型允许部分字段缺失(只有利用率/只有余额),UI 优雅降级 |
| 轮询触发风控 | 默认 60s、错峰、退避;文档建议;余额型厂商可放宽到 5min |
| TOML 写错导致崩溃 | loader 全量 schema 校验,坏文件隔离并 UI 提示行号;永不 crash |
| safeStorage 不可用(如 Linux 无 keyring) | 降级明文存储 + 设置界面醒目警示 |
| Electron 内存基线偏高 | 窗口按需创建;`backgroundThrottling` 保留;空闲时无定时器空转(仅调度器 60s 一次) |
| 中转站用户误以为本项目支持 | README 明确:仅官方平台;自定义厂商能力留给社区 |

---

## 18. 致谢

- [CC Switch](https://github.com/farion1231/cc-switch)(MIT):厂商数据模型、错误双通道语义、厂商清单与端点调研的参考;其 MIT 许可允许必要的实现细节对照。
- [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk)(AGPL-3.0):悬浮窗与主题包交互形态的灵感来源(本项目未复制其代码,仅借鉴交互理念)。
- 作者的 ESP32-S3 固件项目 `llm-usage-display`:五家厂商适配逻辑与归一化数据模型的原型,本项目为其桌面端延伸。
