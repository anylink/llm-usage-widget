/* CC Switch 导入(设计 F11/§11.6):只读扫描 ~/.cc-switch/cc-switch.db,
   按 base_url 识别官方平台厂商;中转站(new-api 等)明确不导入。
   node:sqlite 不可用时优雅降级。 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface CcSwitchEntry {
  name: string
  baseUrl: string
  vendorId: string | null
  /** 脱敏预览:前 6 位 + 长度 */
  keyPreview: string
  key: string
}

export interface CcSwitchScan {
  available: boolean
  path: string
  entries: CcSwitchEntry[]
  error?: string
}

/** base_url → 内置厂商 id;不匹配(中转站等)返回 null */
const VENDOR_MAP: [RegExp, string][] = [
  [/bigmodel\.cn|z\.ai/i, 'glm'],
  [/moonshot|kimi\.com/i, 'kimi'],
  [/deepseek/i, 'deepseek'],
  [/minimax/i, 'minimax'],
  [/openrouter/i, 'openrouter'],
  [/siliconflow/i, 'siliconflow'],
  [/stepfun/i, 'stepfun'],
  [/novita/i, 'novita'],
  [/zenmux/i, 'zenmux'],
  [/volcengine/i, 'volcengine'],
  [/opencode/i, 'opencode-go']
]

export function ccSwitchDbPath(): string {
  return path.join(os.homedir(), '.cc-switch', 'cc-switch.db')
}

/** 递归找 JSON 里第一个名字像密钥的字符串字段 */
function findKey(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && /key|token/i.test(k) && v.length >= 8) return v
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = findKey(v, depth + 1)
    if (found) return found
  }
  return null
}

function findBaseUrl(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && /base.?url/i.test(k) && /^https?:\/\//.test(v)) return v
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = findBaseUrl(v, depth + 1)
    if (found) return found
  }
  return null
}

export async function scanCcSwitch(): Promise<CcSwitchScan> {
  const dbPath = ccSwitchDbPath()
  if (!fs.existsSync(dbPath)) {
    return { available: false, path: dbPath, entries: [] }
  }
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      // 找像 providers 的表与 JSON 配置列
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      const table = tables.find((t) => /provider/i.test(t.name))
      if (!table) return { available: true, path: dbPath, entries: [] }
      const rows = db.prepare(`SELECT * FROM "${table.name}"`).all() as Record<string, unknown>[]
      const entries: CcSwitchEntry[] = []
      for (const row of rows) {
        // 配置列:第一个可解析为对象的 JSON 字符串列
        let cfg: Record<string, unknown> | null = null
        let name = ''
        for (const [col, raw] of Object.entries(row)) {
          if (/name|title/i.test(col) && typeof raw === 'string') name = raw
          if (cfg) continue
          if (typeof raw === 'string' && raw.trim().startsWith('{')) {
            try {
              cfg = JSON.parse(raw) as Record<string, unknown>
            } catch {
              /* 非 JSON 列 */
            }
          }
        }
        if (!cfg) continue
        const key = findKey(cfg)
        if (!key) continue
        const baseUrl = findBaseUrl(cfg) ?? ''
        const vendorId = baseUrl ? (VENDOR_MAP.find(([re]) => re.test(baseUrl))?.[1] ?? null) : null
        entries.push({
          name: name || 'unnamed',
          baseUrl,
          vendorId,
          keyPreview: `${key.slice(0, 6)}…(${key.length})`,
          key
        })
      }
      return { available: true, path: dbPath, entries }
    } finally {
      db.close()
    }
  } catch (err) {
    return { available: fs.existsSync(dbPath), path: dbPath, entries: [], error: String(err) }
  }
}
