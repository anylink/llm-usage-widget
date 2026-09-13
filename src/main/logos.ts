/* 厂商 LOGO 解析与上传(设计 F5):用户目录 > 内置目录 > TOML logo 路径;
   均转 dataURL 供沙盒渲染层使用(CSP img-src 已含 data:)。无命中 → 渲染层首字母兜底 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const EXTS = ['svg', 'png', 'jpg', 'jpeg', 'webp'] as const
const MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
}

function userLogosDir(): string {
  return path.join(app.getPath('userData'), 'logos')
}

function builtinLogosDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'logos')
  return path.resolve(__dirname, '../../resources/logos')
}

function fileToDataUrl(p: string): string | null {
  try {
    const ext = path.extname(p).slice(1).toLowerCase()
    const mime = MIME[ext]
    if (!mime) return null
    return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`
  } catch {
    return null
  }
}

/** 供 config:vendorList 使用的"是否已有自定义 LOGO" */
export function hasLogo(vendorId: string): boolean {
  for (const dir of [userLogosDir(), builtinLogosDir()]) {
    for (const ext of EXTS) {
      if (fs.existsSync(path.join(dir, `${vendorId}.${ext}`))) return true
    }
  }
  return false
}

export function resolveLogo(vendorId: string, tomlLogo?: string): string | null {
  for (const dir of [userLogosDir(), builtinLogosDir()]) {
    for (const ext of EXTS) {
      const p = path.join(dir, `${vendorId}.${ext}`)
      if (fs.existsSync(p)) {
        const d = fileToDataUrl(p)
        if (d) return d
      }
    }
  }
  if (tomlLogo) {
    const candidates = path.isAbsolute(tomlLogo)
      ? [tomlLogo]
      : [path.join(userVendorsDir(), tomlLogo), path.join(builtinVendorsDir(), tomlLogo)]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const d = fileToDataUrl(p)
        if (d) return d
      }
    }
  }
  return null
}

function userVendorsDir(): string {
  return path.join(app.getPath('userData'), 'vendors')
}
function builtinVendorsDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'vendors')
  return path.resolve(__dirname, '../../resources/vendors')
}

/** 全部厂商的 LOGO 映射(vendorId → dataURL) */
export function logosPayload(vendors: { id: string; logo?: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of vendors) {
    const d = resolveLogo(v.id, v.logo)
    if (d) out[v.id] = d
  }
  return out
}

/** 上传:renderer 读文件为 dataURL,落盘到 userData/logos/<vendorId>.<ext>(清旧扩展名) */
export function saveLogo(vendorId: string, dataUrl: string): boolean {
  const m = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$/.exec(dataUrl)
  if (!m || !vendorId || !/^[\w-]+$/.test(vendorId)) return false
  const ext = m[1] === 'svg+xml' ? 'svg' : m[1]
  try {
    fs.mkdirSync(userLogosDir(), { recursive: true })
    for (const e of EXTS) {
      const p = path.join(userLogosDir(), `${vendorId}.${e}`)
      if (fs.existsSync(p)) fs.rmSync(p)
    }
    fs.writeFileSync(path.join(userLogosDir(), `${vendorId}.${ext}`), Buffer.from(m[2], 'base64'))
    return true
  } catch {
    return false
  }
}

export function removeLogo(vendorId: string): boolean {
  let removed = false
  for (const e of EXTS) {
    const p = path.join(userLogosDir(), `${vendorId}.${e}`)
    if (fs.existsSync(p)) {
      try {
        fs.rmSync(p)
        removed = true
      } catch {
        /* 忽略单个失败 */
      }
    }
  }
  return removed
}

export function watchLogos(onChange: () => void): void {
  const dir = userLogosDir()
  fs.mkdirSync(dir, { recursive: true })
  try {
    let timer: NodeJS.Timeout | undefined
    fs.watch(dir, () => {
      clearTimeout(timer)
      timer = setTimeout(onChange, 500)
    })
  } catch {
    // 监听失败不致命
  }
}
