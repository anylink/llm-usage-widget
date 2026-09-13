/* 厂商定义加载:两层注册表(内置只读预置 + 用户目录覆盖)+ schema 校验 + 热重载 */
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

export function validate(def: Partial<VendorDef>, file: string): VendorDef {
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

/** 解析单个 TOML;做键名归一([[request]]→requests 等自然命名映射) */
function parseOne(file: string): { def?: VendorDef; error?: string } {
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = parseToml(raw) as any
    if (obj.request !== undefined) {
      obj.requests = obj.request
      delete obj.request
    }
    if (obj.parse?.window !== undefined) {
      obj.parse.windows = obj.parse.window
      delete obj.parse.window
    }
    if (obj.field_hints !== undefined) {
      obj.fieldHints = obj.field_hints
      delete obj.field_hints
    }
    const def = validate(obj, path.basename(file))
    return { def }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function readDirVendors(dir: string, result: LoadResult): void {
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.toml'))
  } catch {
    return // 目录不存在视为空
  }
  for (const f of files) {
    const { def, error } = parseOne(path.join(dir, f))
    if (def) result.vendors.push(def)
    else if (error) result.errors.push({ file: f, message: error })
  }
}

/**
 * 两层注册表:内置预置(只读,随应用分发)+ 用户 vendors/ 目录覆盖。
 * 用户文件按 def.id 覆盖同名内置厂商;预置升级自动生效,用户自定义永不丢失。
 */
export function loadVendors(): LoadResult {
  const builtin: LoadResult = { vendors: [], errors: [] }
  const user: LoadResult = { vendors: [], errors: [] }
  readDirVendors(builtinVendorsDir(), builtin)
  readDirVendors(userVendorsDir(), user)

  const byId = new Map<string, VendorDef>()
  for (const v of builtin.vendors) byId.set(v.id, v)
  for (const v of user.vendors) byId.set(v.id, v)

  return {
    vendors: [...byId.values()],
    errors: [...builtin.errors, ...user.errors]
  }
}

/** 监听 userData/vendors 变化,防抖后触发重载 */
export function watchVendors(onChange: () => void): void {
  const dir = userVendorsDir()
  fs.mkdirSync(dir, { recursive: true })
  try {
    fs.watch(dir, () => {
      clearTimeout(watchTimer)
      watchTimer = setTimeout(onChange, 500)
    })
  } catch {
    // 监听失败不致命;下次保存配置时会重建目录
  }
}
