/* 配置存储:display.json(外观/窗口)+ accounts.json(账户,safeStorage 加密) */
import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import type { DisplayConfig, VendorDef } from '@shared/types'

export type { DisplayConfig } from '@shared/types'

export interface StoredAccount {
  id: string
  name: string
  /** 加密前缀 enc:v1:base64(safeStorage);不可用时明文(警示) */
  key?: string
  secret?: string
  region?: string
}

export type AccountsFile = Record<string, StoredAccount[]>

const ENC_PREFIX = 'enc:v1:'

function displayPath(): string {
  return path.join(app.getPath('userData'), 'display.json')
}
function accountsPath(): string {
  return path.join(app.getPath('userData'), 'accounts.json')
}

export function defaultDisplay(): DisplayConfig {
  return {
    bgOpacity: 0.9,
    mode: 'carousel',
    theme: 'dark',
    pollIntervalMs: 60_000,
    autoCycleMs: 8_000,
    alwaysOnTop: true,
    clickThrough: false,
    locked: false,
    collapsed: false,
    widget: { width: 300 },
    alerts: { warnPct: 70, critPct: 90, balanceMin: 10, notify: true }
  }
}

export function loadDisplay(): DisplayConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(displayPath(), 'utf-8')) as Partial<DisplayConfig>
    return { ...defaultDisplay(), ...raw, widget: { ...defaultDisplay().widget, ...raw.widget }, alerts: { ...defaultDisplay().alerts, ...raw.alerts } }
  } catch {
    return defaultDisplay()
  }
}

export function saveDisplay(cfg: DisplayConfig): void {
  fs.writeFileSync(displayPath(), JSON.stringify(cfg, null, 2))
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

function encryptSecret(plain?: string): string | undefined {
  if (!plain) return undefined
  if (plain.startsWith(ENC_PREFIX)) return plain // 已是密文,防双重加密
  if (isEncryptionAvailable()) {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
  }
  return plain // 降级明文;UI 依 isEncryptionAvailable 警示
}

function decryptSecret(stored?: string): string | undefined {
  if (!stored) return undefined
  if (stored.startsWith(ENC_PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'))
    } catch {
      return undefined
    }
  }
  return stored
}

export function loadAccounts(): AccountsFile {
  try {
    return JSON.parse(fs.readFileSync(accountsPath(), 'utf-8')) as AccountsFile
  } catch {
    return {}
  }
}

export function saveAccounts(accounts: AccountsFile): void {
  // key/secret 落盘前统一经 safeStorage 加密(不可用时明文 + UI 警示)
  const sealed: AccountsFile = {}
  for (const [vendorId, list] of Object.entries(accounts)) {
    sealed[vendorId] = list.map((a) => ({ ...a, key: encryptSecret(a.key), secret: encryptSecret(a.secret) }))
  }
  fs.writeFileSync(accountsPath(), JSON.stringify(sealed, null, 2))
}

/** 新增或更新一个账户凭证(设置页保存入口) */
export function upsertAccount(
  vendorId: string,
  account: { id: string; name: string; key?: string; secret?: string; region?: string }
): void {
  const stored = loadAccounts()
  const list = stored[vendorId] ?? []
  const idx = list.findIndex((a) => a.id === account.id)
  if (idx >= 0) list[idx] = { ...list[idx], ...account }
  else list.push(account)
  stored[vendorId] = list
  saveAccounts(stored)
}

/** 为厂商生成下一个账户 id(如 kimi-2) */
export function nextAccountId(vendorId: string): string {
  const list = loadAccounts()[vendorId] ?? []
  let n = 1
  while (list.some((a) => a.id === `${vendorId}-${n}`)) n++
  return `${vendorId}-${n}`
}

/** 读账户(解密后),只回传指定 vendor;附带账户元信息 */
export function decryptAccounts(): Record<string, { id: string; name: string; key?: string; secret?: string; region?: string }[]> {
  const stored = loadAccounts()
  const out: Record<string, { id: string; name: string; key?: string; secret?: string; region?: string }[]> = {}
  for (const [vendorId, list] of Object.entries(stored)) {
    out[vendorId] = list.map((a) => ({
      id: a.id,
      name: a.name,
      key: decryptSecret(a.key),
      secret: decryptSecret(a.secret),
      region: a.region
    }))
  }
  return out
}

/** 首次运行:为每个内置厂商预建一个空账户占位,用户在设置里填 Key */
export function ensureDefaultAccounts(vendors: VendorDef[]): AccountsFile {
  const stored = loadAccounts()
  for (const def of vendors) {
    if (!stored[def.id]) {
      stored[def.id] = [{ id: `${def.id}-1`, name: def.name }]
    }
  }
  saveAccounts(stored)
  return stored
}
