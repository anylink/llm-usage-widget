/* 归一化数据模型 + 厂商定义类型(引擎与 UI 共用) */

export type EntryKind = 'balance' | 'quota'

export type EntryStatus =
  | 'ok'
  | 'updating'
  | 'no-key'
  | 'network'
  | 'http'
  | 'auth'
  | 'parse'
  | 'business'
  | 'disabled'

/** 一个账户一次查询的归一化结果 */
export interface QuotaWindow {
  label: string // 归一化窗口名: "5h" | "wk" | "mo"
  utilization: number // 0-100(已用)
  resetEpoch?: number // 绝对 UTC 秒;倒计时由前端用 reset-now 计算
}

export interface UsageEntry {
  vendorId: string
  vendorName: string
  accountId: string
  accountName: string
  kind: EntryKind
  color: string
  status: EntryStatus
  /** 余额型主数值(或套餐型的金额剩余,如有) */
  value?: number
  unit?: string
  utilization?: number // 0-100;余额型为 undefined
  message?: string // 本地化 key 或原始错误文案
  queriedAt: number // epoch 秒
  windows: QuotaWindow[]
}

/* ── 厂商定义(vendors/*.toml → VendorDef,无密钥) ── */

export interface Credentials {
  key?: string
  secret?: string
  region?: string
}

export interface RequestSpec {
  method: 'GET' | 'POST'
  url: string
  timeoutMs?: number
  body?: string
}

export interface CheckSpec {
  path: string
  equals?: unknown
  errorMessagePath?: string
}

export interface MatchSpec {
  path: string
  equals?: unknown
  in?: unknown[]
}

export interface WindowSpec {
  label: '5h' | 'wk' | 'mo' | string
  /** 多元素列表模式:本窗口从哪个元素取(match 命中的第一个) */
  match?: MatchSpec
  /** 窗口存在条件(如 MiniMax 周桶要求 current_weekly_status == 1) */
  condition?: MatchSpec
  /** 直接百分比路径,可带 scale(如 ZenMux 0-1 需 ×100) */
  percent?: { path: string; scale?: number }
  /** 取补:percent = 100 - value(MiniMax 给的是剩余百分比) */
  complement?: string
  /** 计算:utilization = (total - minus) / total * 100(Kimi) */
  percentFrom?: { total: string; minus: string }
  /** 通用四则计算,fields 中的路径取值后按 expr 求值 */
  computed?: { fields: Record<string, string>; expr: string }
  /** 兜底窗口:未被任何 match 命中的元素按声明顺序填入(GLM 老套餐无 unit) */
  fallback?: boolean
  reset?: string // 重置时间路径(秒/毫秒/ISO 自适应)
}

export interface ParseSpec {
  /** 元素列表路径;缺省时以响应根为唯一元素 */
  listPath?: string
  listMatch?: MatchSpec
  // ── balance 型 ──
  value?: { path: string; scale?: number }
  computedValue?: { fields: Record<string, string>; expr: string }
  unit?: string | { path: string }
  // ── quota 型 ──
  windows?: WindowSpec[]
}

export interface AuthSpec {
  style: 'bearer' | 'raw' | 'header' | 'plugin'
  /** style = "header" 时的自定义头名 */
  headerName?: string
  /** style = "plugin" 时的插件 id */
  plugin?: string
  /** 该厂商需要的凭证字段,设置界面据此渲染表单 */
  fields: string[]
}

export interface VendorDef {
  id: string
  name: string
  kind: EntryKind
  logo?: string
  color?: string
  homepage?: string
  defaultIntervalMs?: number
  /** 凭证字段的填写提示(设置页渲染在输入框下) */
  fieldHints?: Record<string, string>
  auth: AuthSpec
  requests: RequestSpec[]
  check?: CheckSpec
  parse: ParseSpec
}

export interface AccountInfo {
  vendorId: string
  vendorName: string
  color: string
  accountId: string
  accountName: string
  /** 凭证是否已配置(不回传真值) */
  hasCredential: boolean
  enabled: boolean
}

/** 引擎内部的账户最小表示 */
export interface AccountLike {
  id: string
  name: string
}

/* ── 配置与快照(主进程存储格式,UI 共用) ── */

export interface WindowState {
  x?: number
  y?: number
  width: number
  height?: number
}

export type WidgetMode = 'carousel' | 'list'

export interface DisplayConfig {
  /** 背景不透明度(仅卡片背景,文字/图标永远不透明,保持悬浮感) */
  bgOpacity: number
  /** 悬浮窗展示形式:轮播(仅已配置厂商,空时显示示例)或列表(全部已配置) */
  mode: WidgetMode
  theme: string
  pollIntervalMs: number
  autoCycleMs: number // 卡片自动翻页间隔,0 = 关闭
  alwaysOnTop: boolean
  clickThrough: boolean
  /** 锁定位置:禁止拖动(工具条可解锁) */
  locked: boolean
  /** 收起卡片内容,仅显示顶部工具条 */
  collapsed: boolean
  widget: WindowState
  alerts: {
    warnPct: number
    critPct: number
    balanceMin: number
    /** L2 悬浮窗气泡 */
    bubble: boolean
    /** L3 系统通知 */
    notify: boolean
  }
}

/** 一次阈值告警事件(主进程评估后推给气泡/系统通知) */
export interface AlertEvent {
  accountId: string
  vendorId: string
  /** 通知标题:厂商名(多账户时附账户名) */
  title: string
  /** 正文(主进程已拼好,含窗口/百分比/重置时间或余额) */
  message: string
  level: 'warn' | 'crit'
  kind: EntryKind
  color: string
  at: number // epoch 秒
}

export interface SchedulerSnapshot {
  dataGen: number
  entries: UsageEntry[]
  vendorErrors: { file: string; message: string }[]
}
