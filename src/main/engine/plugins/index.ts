/* 插件注册表 */
import type { VendorPlugin } from '../executor'
import { volcenginePlugin } from './volcengine'

export function createPluginRegistry(): Map<string, VendorPlugin> {
  const map = new Map<string, VendorPlugin>()
  for (const p of [volcenginePlugin]) map.set(p.id, p)
  return map
}
