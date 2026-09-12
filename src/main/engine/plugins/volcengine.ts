/* 火山方舟 SigV4 插件(火山变体,移植自作者 ESP32-S3 固件的 mbedTLS 实现)
 *
 * 与 AWS SigV4 的差异(CC Switch s3.rs 注释同款结论):
 *  1. canonical headers 与 SignedHeaders 用固定顺序 host;x-date;x-content-sha256;content-type(不按字母序)
 *  2. algorithm 串为 HMAC-SHA256(无 AWS4 前缀)、credential scope 终止于 request(非 aws4_request)
 *     、签名密钥 kDate = HMAC(SK, date)(SK 不加 AWS4 前缀)
 *  3. canonical query 仍按 key 字母序;service = "ark",POST 空 body
 */
import crypto from 'node:crypto'
import type { PluginContext, VendorPlugin } from '../executor'
import { baseEntry } from '../executor'
import { getPath, toEpochSeconds, asNumber } from '../extractor'
import type { UsageEntry, QuotaWindow } from '@shared/types'

const HOST = 'open.volcengineapi.com'
const API_VERSION = '2024-01-01'
const SERVICE = 'ark'
const CONTENT_TYPE = 'application/json; charset=utf-8'
const SIGNED_HEADERS = 'host;x-date;x-content-sha256;content-type'

function hmacSha256(key: crypto.BinaryLike, data: crypto.BinaryLike): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest()
}
function sha256Hex(data: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}
/** RFC3986 unreserved 之外全部 %XX 编码 */
function uriEncode(input: string): string {
  return input.replace(/[^A-Za-z0-9\-_.~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
}

function canonicalQuery(action: string, region: string): string {
  const pairs: [string, string][] = [
    ['Action', action],
    ['Region', region],
    ['Version', API_VERSION]
  ]
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return pairs.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&')
}

function sign(
  ak: string,
  sk: string,
  region: string,
  query: string,
  body: Buffer,
  now: Date
): { authorization: string; xDate: string; xContentSha256: string } {
  const xDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') // YYYYMMDDTHHMMSSZ
  const shortDate = xDate.slice(0, 8)
  const xContentSha256 = sha256Hex(body)
  const canonicalHeaders = `host:${HOST}\nx-date:${xDate}\nx-content-sha256:${xContentSha256}\ncontent-type:${CONTENT_TYPE}\n`
  const canonicalRequest = `POST\n/\n${query}\n${canonicalHeaders}\n${SIGNED_HEADERS}\n${xContentSha256}`
  const credentialScope = `${shortDate}/${region}/${SERVICE}/request`
  const stringToSign = `HMAC-SHA256\n${xDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`
  const kDate = hmacSha256(sk, shortDate)
  const kRegion = hmacSha256(kDate, region)
  const kService = hmacSha256(kRegion, SERVICE)
  const kSigning = hmacSha256(kService, 'request')
  const signature = hmacSha256(kSigning, stringToSign).toString('hex')
  const authorization = `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`
  return { authorization, xDate, xContentSha256 }
}

function isAuthErrorCode(code: string): boolean {
  const c = code.toLowerCase()
  return ['auth', 'signature', 'accessdenied', 'denied', 'unauthorized', 'forbidden', 'credential', 'token'].some((k) =>
    c.includes(k)
  )
}

function envelopeError(body: unknown): { code: string; message: string } | undefined {
  const err = getPath(body, 'ResponseMetadata.Error') ?? getPath(body, 'Error')
  if (typeof err !== 'object' || err === null) return undefined
  const code = getPath(err, 'Code')
  const message = getPath(err, 'Message')
  if (typeof code === 'string') {
    return { code, message: typeof message === 'string' ? message : '' }
  }
  return undefined
}

/** 火山 OpenAPI 单次调用;返回解析后的 JSON 根,或分类后的失败 */
async function openApiCall(
  ctx: PluginContext,
  cred: Record<string, string>,
  action: string
): Promise<{ ok: true; body: unknown } | { ok: false; kind: 'network' | 'auth' | 'http'; message: string }> {
  const region = cred.region || 'cn-beijing'
  const query = canonicalQuery(action, region)
  const url = `https://${HOST}/?${query}`
  const body = Buffer.alloc(0)
  const { authorization, xDate, xContentSha256 } = sign(cred.key ?? '', cred.secret ?? '', region, query, body, new Date())

  let resp: Response
  try {
    resp = await ctx.fetch(url, {
      method: 'POST',
      headers: {
        'X-Date': xDate,
        'X-Content-Sha256': xContentSha256,
        'Content-Type': CONTENT_TYPE,
        Authorization: authorization,
        Accept: 'application/json'
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(15000)
    })
  } catch {
    return { ok: false, kind: 'network', message: 'error.network' }
  }

  let text: string
  try {
    text = await resp.text()
  } catch {
    return { ok: false, kind: 'network', message: 'error.network' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, kind: 'http', message: `HTTP ${resp.status}` }
  }

  const envErr = envelopeError(parsed)
  if (!resp.ok) {
    if (envErr && isAuthErrorCode(envErr.code)) {
      return { ok: false, kind: 'auth', message: `error.auth (${envErr.code})` }
    }
    return { ok: false, kind: 'http', message: envErr ? `HTTP ${resp.status} ${envErr.code}` : `HTTP ${resp.status}` }
  }
  if (envErr) {
    if (isAuthErrorCode(envErr.code)) return { ok: false, kind: 'auth', message: `error.auth (${envErr.code})` }
    return { ok: false, kind: 'http', message: `${envErr.code}: ${envErr.message}` }
  }
  return { ok: true, body: parsed }
}

/** Agent Plan:Result.{AFPFiveHour,AFPWeekly,AFPMonthly}.{Quota,Used,ResetTime} */
function parseAfp(body: unknown): QuotaWindow[] {
  const result = getPath(body, 'Result')
  const map: [string, QuotaWindow['label']][] = [
    ['AFPFiveHour', '5h'],
    ['AFPWeekly', 'wk'],
    ['AFPMonthly', 'mo']
  ]
  const wins: QuotaWindow[] = []
  for (const [key, label] of map) {
    const win = getPath(result, key)
    if (typeof win !== 'object' || win === null) continue
    const quota = asNumber(getPath(win, 'Quota')) ?? 0
    if (quota <= 0) continue
    const used = asNumber(getPath(win, 'Used')) ?? 0
    const resetEpoch = toEpochSeconds(getPath(win, 'ResetTime'))
    wins.push({ label, utilization: Math.round((used / quota) * 1000) / 10, resetEpoch })
  }
  return wins
}

/** Coding Plan:Result.QuotaUsage[]/Usages[]/Details[]:{Level, Percent, ResetTime} */
function parseCodingPlan(body: unknown): QuotaWindow[] {
  const result = getPath(body, 'Result')
  const arr =
    (getPath(result, 'QuotaUsage') as unknown) ??
    getPath(result, 'Usages') ??
    getPath(result, 'Details')
  if (!Array.isArray(arr)) return []
  const labelMap: Record<string, QuotaWindow['label']> = {
    session: '5h', '5h': '5h', fivehour: '5h', five_hour: '5h', rolling_5h: '5h',
    weekly: 'wk', week: 'wk', '7d': 'wk',
    monthly: 'mo', month: 'mo'
  }
  const wins: QuotaWindow[] = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const rawLabel =
      (getPath(item, 'Level') as string) ?? getPath(item, 'Type') ?? getPath(item, 'Period') ?? getPath(item, 'Label')
    const label = typeof rawLabel === 'string' ? labelMap[rawLabel.toLowerCase()] : undefined
    if (!label) continue
    const percent =
      asNumber(getPath(item, 'Percent')) ?? asNumber(getPath(item, 'UsedPercent')) ?? asNumber(getPath(item, 'UsagePercent'))
    if (percent === undefined) continue
    const resetEpoch = toEpochSeconds(getPath(item, 'ResetTime') ?? getPath(item, 'ResetTimestamp'))
    wins.push({ label, utilization: Math.round(percent * 10) / 10, resetEpoch })
  }
  return wins
}

export const volcenginePlugin: VendorPlugin = {
  id: 'volcengine_sigv4',
  async execute(ctx: PluginContext): Promise<UsageEntry | undefined> {
    const def = ctx.def
    const entry = baseEntry(def, ctx.account)
    const cred = { key: ctx.cred.key ?? '', secret: ctx.cred.secret ?? '', region: ctx.cred.region || 'cn-beijing' }

    if (!cred.key || !cred.secret) {
      return { ...entry, status: 'no-key', message: 'error.noAkSk' }
    }

    // 双 plan 自动探测:Agent Plan(GetAFPUsage)→ 无订阅回落 Coding Plan(GetCodingPlanUsage)
    const afp = await openApiCall(ctx, cred, 'GetAFPUsage')
    if (afp.ok) {
      const wins = parseAfp(afp.body)
      if (wins.length > 0) {
        return { ...entry, status: 'ok', windows: wins, utilization: wins[0].utilization }
      }
    } else if (afp.kind === 'network') {
      return { ...entry, status: 'network', message: afp.message }
    } else if (afp.kind === 'auth') {
      return { ...entry, status: 'auth', message: afp.message }
    }

    const coding = await openApiCall(ctx, cred, 'GetCodingPlanUsage')
    if (coding.ok) {
      const wins = parseCodingPlan(coding.body)
      if (wins.length > 0) {
        return { ...entry, status: 'ok', windows: wins, utilization: wins[0].utilization }
      }
      return { ...entry, status: 'parse', message: 'error.parseEmpty' }
    }
    return { ...entry, status: coding.kind === 'network' ? 'network' : coding.kind === 'auth' ? 'auth' : 'http', message: coding.message }
  }
}
