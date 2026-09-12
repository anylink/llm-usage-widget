/* 通用厂商查询执行器:请求链 → 双通道错误分类 → 归一化提取 */
import type {
  AccountLike,
  MatchSpec,
  ParseSpec,
  UsageEntry,
  VendorDef,
  QuotaWindow,
  WindowSpec
} from '@shared/types'
import { getPath, asNumber, toEpochSeconds, evalComputed } from './extractor'

export type FailKind = 'network' | 'http' | 'auth' | 'parse' | 'business' | 'no-key'

export interface AuthResult {
  headers: Record<string, string>
}

export interface PluginContext {
  def: VendorDef
  account: AccountLike
  cred: Record<string, string>
  fetch: typeof fetch
}

export interface VendorPlugin {
  id: string
  /** 返回附加到每个请求上的鉴权头;不介入鉴权则不实现 */
  authHeaders?(ctx: PluginContext): Promise<AuthResult>
  /** 完全自管请求+解析;返回 undefined 表示走通用流程 */
  execute?(ctx: PluginContext): Promise<UsageEntry | undefined>
}

export type ResolveHeaderFn = (def: VendorDef, account: AccountLike, cred: Record<string, string>) => Promise<Record<string, string>>

const DEFAULT_TIMEOUT_MS = 15000

export function baseEntry(def: VendorDef, account: AccountLike): UsageEntry {
  return {
    vendorId: def.id,
    vendorName: def.name,
    accountId: account.id,
    accountName: account.name,
    kind: def.kind,
    color: def.color ?? '#4d6bfe',
    status: 'updating',
    queriedAt: Math.floor(Date.now() / 1000),
    windows: []
  }
}

function matchOk(m: MatchSpec | undefined, el: unknown): boolean {
  if (!m) return true
  const v = getPath(el, m.path)
  if (m.in) return m.in.some((x) => String(x) === String(v))
  if ('equals' in m) return String(v) === String(m.equals)
  return false
}

/** 从单个元素(或响应根)提取一个窗口;字段缺失返回 undefined(优雅降级) */
function extractWindow(spec: WindowSpec, el: unknown): QuotaWindow | undefined {
  if (spec.condition && !matchOk(spec.condition, el)) return undefined

  let utilization: number | undefined
  if (spec.percent) {
    const n = asNumber(getPath(el, spec.percent.path))
    if (n !== undefined) utilization = spec.percent.scale ? n * spec.percent.scale : n
  } else if (spec.complement) {
    const n = asNumber(getPath(el, spec.complement))
    if (n !== undefined) utilization = 100 - n
  } else if (spec.percentFrom) {
    const total = asNumber(getPath(el, spec.percentFrom.total))
    const minus = asNumber(getPath(el, spec.percentFrom.minus))
    if (total !== undefined && minus !== undefined && total > 0) {
      utilization = ((total - minus) / total) * 100
    }
  } else if (spec.computed) {
    utilization = evalComputed(spec.computed, el)
  }
  if (utilization === undefined) return undefined

  const resetEpoch = spec.reset ? toEpochSeconds(getPath(el, spec.reset)) : undefined
  return {
    label: spec.label,
    utilization: Math.max(0, Math.min(100, Math.round(utilization * 10) / 10)),
    resetEpoch
  }
}

function extractQuota(def: VendorDef, root: unknown): UsageEntry {
  const entry = baseEntry(def, { id: '', name: '' })
  const parse: ParseSpec = def.parse
  const windows: QuotaWindow[] = []

  // 元素集合:listPath(+listMatch)选中若干元素,否则根为唯一元素
  let elements: unknown[]
  if (parse.listPath) {
    const list = getPath(root, parse.listPath)
    elements = Array.isArray(list) ? list : []
    if (parse.listMatch) elements = elements.filter((el) => matchOk(parse.listMatch, el))
  } else {
    elements = [root]
  }

  // 声明顺序处理窗口:match 模式逐元素取第一个命中;非 match 模式取唯一/首元素
  const used = new Set<number>()
  for (const ws of parse.windows ?? []) {
    let win: QuotaWindow | undefined
    if (ws.match) {
      const idx = elements.findIndex((el, i) => !used.has(i) && matchOk(ws.match, el))
      if (idx >= 0) {
        win = extractWindow(ws, elements[idx])
        if (win) used.add(idx)
      }
    } else if (elements.length > 0) {
      const idx = elements.findIndex((_, i) => !used.has(i))
      win = extractWindow(ws, elements[Math.max(0, idx)])
      if (win && elements.length === 1) used.add(0)
    }
    if (win) windows.push(win)
  }
  // fallback 窗口:未被 match 命中的元素按声明顺序填入(GLM 老套餐无 unit)
  const fallbackSpecs = (parse.windows ?? []).filter((w) => w.fallback)
  const unused = elements.filter((_, i) => !used.has(i))
  for (let k = 0; k < fallbackSpecs.length && k < unused.length; k++) {
    const win = extractWindow(fallbackSpecs[k], unused[k])
    if (win) windows.push(win)
  }

  entry.windows = windows
  if (windows.length === 0) {
    entry.status = 'parse'
    entry.message = 'error.parseEmpty'
  } else {
    entry.status = 'ok'
    entry.utilization = windows[0].utilization
  }
  return entry
}

function extractBalance(def: VendorDef, root: unknown): UsageEntry {
  const entry = baseEntry(def, { id: '', name: '' })
  const parse: ParseSpec = def.parse

  let value: number | undefined
  if (parse.computedValue) {
    value = evalComputed(parse.computedValue, root)
  } else if (parse.value) {
    const n = asNumber(getPath(root, parse.value.path))
    if (n !== undefined) value = parse.value.scale ? n * parse.value.scale : n
  }
  if (value === undefined) {
    entry.status = 'parse'
    entry.message = 'error.parseEmpty'
    return entry
  }
  let unit = 'USD'
  if (typeof parse.unit === 'string') unit = parse.unit
  else if (parse.unit) {
    const u = getPath(root, parse.unit.path)
    if (typeof u === 'string') unit = u
  }
  entry.value = Math.round(value * 100) / 100
  entry.unit = unit
  entry.status = 'ok'
  return entry
}

/** 解析响应体。返回完整 UsageEntry(status=ok)或确定性失败条目 */
export function parseResponse(def: VendorDef, bodyText: string): UsageEntry {
  let root: unknown
  try {
    root = JSON.parse(bodyText)
  } catch {
    const e = baseEntry(def, { id: '', name: '' })
    e.status = 'parse'
    e.message = 'error.parseJson'
    return e
  }

  if (def.check) {
    const actual = getPath(root, def.check.path)
    if (String(actual) !== String(def.check.equals)) {
      const e = baseEntry(def, { id: '', name: '' })
      e.status = 'business'
      e.message = def.check.errorMessagePath
        ? String(getPath(root, def.check.errorMessagePath) ?? 'error.business')
        : 'error.business'
      return e
    }
  }

  return def.kind === 'balance' ? extractBalance(def, root) : extractQuota(def, root)
}

export interface ExecOutcome {
  entry: UsageEntry
  /** true = 瞬时失败(keep-last-good);false = 确定性结果 */
  transient: boolean
}

/**
 * 查询一个账户:按请求链依次尝试。
 * - 网络失败(瞬时)→ 立即返回 transient(调度器 keep-last-good)
 * - 鉴权失败 → 终止请求链
 * - 其他确定性失败 → 尝试下一请求;全失败则返回最后错误
 */
export async function executeVendor(
  def: VendorDef,
  account: AccountLike,
  cred: Record<string, string>,
  plugins: Map<string, VendorPlugin>
): Promise<ExecOutcome> {
  if (!cred.key && !cred.secret) {
    const e = baseEntry(def, account)
    e.status = 'no-key'
    e.message = 'error.noKey'
    return { entry: e, transient: false }
  }

  const plugin = def.auth.style === 'plugin' && def.auth.plugin ? plugins.get(def.auth.plugin) : undefined

  // 插件完全自管请求与解析(如火山 SigV4 双 plan 探测)
  if (plugin?.execute) {
    const done = await plugin.execute({ def, account, cred, fetch })
    if (done) {
      return {
        entry: { ...done, vendorId: def.id, vendorName: def.name, accountId: account.id, accountName: account.name, color: def.color ?? '#4d6bfe' },
        transient: done.status === 'network'
      }
    }
  }

  let last: UsageEntry | undefined

  for (const req of def.requests) {
    const entry = baseEntry(def, account)
    let headers: Record<string, string> = { Accept: 'application/json' }
    try {
      if (plugin?.authHeaders) {
        const r = await plugin.authHeaders({ def, account, cred, fetch })
        Object.assign(headers, r.headers)
      } else if (def.auth.style === 'bearer') {
        headers['Authorization'] = `Bearer ${cred.key}`
      } else if (def.auth.style === 'raw') {
        headers[def.auth.headerName ?? 'Authorization'] = cred.key ?? ''
      } else if (def.auth.style === 'header') {
        headers[def.auth.headerName ?? 'X-Api-Key'] = cred.key ?? ''
      }
    } catch (err) {
      entry.status = 'auth'
      entry.message = String(err instanceof Error ? err.message : err)
      return { entry, transient: false }
    }

    let resp: Response
    try {
      const timeout = req.timeoutMs ?? DEFAULT_TIMEOUT_MS
      resp = await fetch(req.url, {
        method: req.method,
        headers,
        body: req.body,
        signal: AbortSignal.timeout(timeout)
      })
    } catch {
      return { entry: { ...entry, status: 'network', message: 'error.network' }, transient: true }
    }

    if (resp.status === 401 || resp.status === 403) {
      entry.status = 'auth'
      entry.message = 'error.auth'
      return { entry, transient: false }
    }

    let bodyText: string
    try {
      bodyText = await resp.text()
    } catch {
      return { entry: { ...entry, status: 'network', message: 'error.network' }, transient: true }
    }

    if (!resp.ok) {
      last = { ...entry, status: 'http', message: `HTTP ${resp.status}` }
      continue
    }

    const parsed = parseResponse(def, bodyText)
    const done = { ...parsed, vendorId: def.id, vendorName: def.name, accountId: account.id, accountName: account.name, color: def.color ?? '#4d6bfe' }
    if (done.status === 'ok') return { entry: done, transient: false }
    last = done
    // 确定性失败 → 尝试请求链的下一环(回退)
  }

  return { entry: last ?? { ...baseEntry(def, account), status: 'http', message: 'error.empty' }, transient: false }
}
