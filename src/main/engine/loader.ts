/* 厂商定义加载:内置预置初始化 + userData/vendors/*.toml 解析校验 + 热重载 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { parse as parseToml } from 'smol-toml'
import type { VendorDef } from '@shared/types'

export interface LoadResult {
  vendors: VendorDef[]
  errors: { file: string; message: string }[]
}

let watchTimer: NodeJS.Timeout | undefined

function builtinVendorsDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'vendors')
  return path.resolve(__dirname, '../../resources/vendors')
}

export function userVendorsDir(): string {
  return path.join(app.getPath('userData'), 'vendors')
}

/** 首次运行:把内置预置复制到 userData(存在同名则不覆盖,保留用户修改) */
export function ensureBuiltinVendors(): void {
  const src = builtinVendorsDir()
  const dst = userVendorsDir()
  fs.mkdirSync(dst, { recursive: true })
  if (!fs.existsSync(src)) return
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith('.toml')) continue
    const target = path.join(dst, f)
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(src, f), target)
  }
}

function validate(def: Partial<VendorDef>, file: string): VendorDef {
  const miss = (k: string): Error => new Error(`${file}: 缺少必填字段 ${k}`)
  if (!def.id) throw miss('id')
  if (!def.name) throw miss('name')
  if (def.kind !== 'balance' && def.kind !== 'quota') throw miss('kind')
  if (!def.auth || !def.auth.style) throw miss('auth.style')
  if (!Array.isArray(def.requests) || def.requests.length === 0) {
    // 插件型厂商允许零请求(插件自管)
    if (!(def.auth.style === 'plugin' && def.auth.plugin)) throw miss('request')
  }
  const isPlugin = def.auth.style === 'plugin' && Boolean(def.auth.plugin)
  for (const r of def.requests ?? []) {
    if (!r.url) throw new Error(`${file}: request 缺少 url`)
    if (r.method && r.method !== 'GET' && r.method !== 'POST') {
      throw new Error(`${file}: request.method 仅支持 GET/POST`)
    }
  }
  if (!isPlugin) {
    if (def.kind === 'balance' && !def.parse?.value && !def.parse?.computedValue) {
      throw new Error(`${file}: balance 型需要 parse.value 或 parse.computedValue`)
    }
    if (def.kind === 'quota' && !def.parse?.windows?.length) {
      throw new Error(`${file}: quota 型需要至少一个 [[parse.window]]`)
    }
  }
  return def as VendorDef
}

function parseOne(file: string): { def?: VendorDef; error?: string } {
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    const obj = parseToml(raw) as unknown as Partial<VendorDef>
    const def = validate(obj, path.basename(file))
    return { def }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function loadVendors(): LoadResult {
  const dir = userVendorsDir()
  const result: LoadResult = { vendors: [], errors: [] }
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.toml'))
  } catch {
    return result
  }
  for (const f of files) {
    const { def, error } = parseOne(path.join(dir, f))
    if (def) result.vendors.push(def)
    else if (error) result.errors.push({ file: f, message: error })
  }
  return result
}

/** 监听 userData/vendors 变化,防抖后触发重载 */
export function watchVendors(onChange: () => void): void {
  const dir = userVendorsDir()
  try {
    fs.watch(dir, () => {
      clearTimeout(watchTimer)
      watchTimer = setTimeout(onChange, 500)
    })
  } catch {
    // 目录不存在等场景静默;下次保存配置时会重建目录
  }
}
