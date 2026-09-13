/* 厂商编辑器的测试请求:发一次请求,返回归一化结果 + 原始响应体(渲染 JSON 树点选用) */
import type { UsageEntry, VendorDef } from '@shared/types'
import { baseEntry, parseResponse } from './executor'

export interface VendorTestResult {
  entry: UsageEntry
  bodyText?: string
  httpStatus?: number
  error?: string
}

function authHeaders(def: VendorDef, cred: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (def.auth.style === 'bearer') headers['Authorization'] = `Bearer ${cred.key ?? ''}`
  else if (def.auth.style === 'raw') headers[def.auth.headerName ?? 'Authorization'] = cred.key ?? ''
  else if (def.auth.style === 'header') headers[def.auth.headerName ?? 'X-Api-Key'] = cred.key ?? ''
  return headers
}

export async function testVendor(
  def: VendorDef,
  cred: Record<string, string>
): Promise<VendorTestResult> {
  const probe = { id: 'test', name: 'test' }
  const req = def.requests[0]
  if (!req || !req.url) {
    return { entry: { ...baseEntry(def, probe), status: 'parse', message: 'no request url' } }
  }
  try {
    const resp = await fetch(req.url, {
      method: req.method,
      headers: authHeaders(def, cred),
      body: req.body,
      signal: AbortSignal.timeout(req.timeoutMs ?? 15000)
    })
    const bodyText = await resp.text()
    let entry: UsageEntry
    if (resp.status === 401 || resp.status === 403) {
      entry = { ...baseEntry(def, probe), status: 'auth', message: 'error.auth' }
    } else if (!resp.ok) {
      entry = { ...baseEntry(def, probe), status: 'http', message: `HTTP ${resp.status}` }
    } else {
      entry = parseResponse(def, bodyText)
    }
    return { entry, bodyText, httpStatus: resp.status }
  } catch (err) {
    return {
      entry: { ...baseEntry(def, probe), status: 'network', message: 'error.network' },
      error: String(err)
    }
  }
}
