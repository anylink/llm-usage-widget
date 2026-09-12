/* AlertManager 状态机单测:node scripts/test-alerts.ts(Node 24 原生跑 TS,零依赖断言) */
import assert from 'node:assert'
import { AlertManager } from '../src/main/alerts.ts'
import type { UsageEntry } from '../src/shared/types.ts'

const CFG = { warnPct: 70, critPct: 90, balanceMin: 10, bubble: true, notify: true }
const T = (key: string, params?: Record<string, string | number>): string => {
  const zh: Record<string, string> = {
    'alerts.quotaMsg': `${params?.label} 窗口已用 ${params?.pct}%,${params?.time}重置`,
    'alerts.quotaMsgNoReset': `${params?.label} 窗口已用 ${params?.pct}%`,
    'alerts.balanceMsg': `余额仅剩 ${params?.value} ${params?.unit},低于下限 ${params?.min}`
  }
  return zh[key] ?? key
}

let n = 0
function quotaEntry(util: number, resetEpoch?: number): UsageEntry {
  return {
    vendorId: 'kimi',
    vendorName: 'Kimi',
    accountId: 'kimi-1',
    accountName: 'Kimi',
    kind: 'quota',
    color: '#000',
    status: 'ok',
    queriedAt: 0,
    windows: [{ label: '5h', utilization: util, resetEpoch }]
  }
}
function balanceEntry(value: number): UsageEntry {
  return {
    vendorId: 'ds',
    vendorName: 'DeepSeek',
    accountId: 'ds-1',
    accountName: 'DeepSeek',
    kind: 'balance',
    color: '#000',
    status: 'ok',
    queriedAt: 0,
    value,
    unit: 'CNY',
    windows: []
  }
}
function levels(entries: UsageEntry[], m = new AlertManager(T)): string[] {
  return m.evaluate(entries, CFG).map((e) => `${e.vendorId}:${e.level}`)
}

/* 套餐型:升级触发与去重 */
{
  const m = new AlertManager(T)
  assert.deepEqual(levels([quotaEntry(50)], m), [], '低于阈值不触发')
  assert.deepEqual(levels([quotaEntry(75)], m), ['kimi:warn'], '越过预警触发 warn')
  assert.deepEqual(levels([quotaEntry(80)], m), [], '同阈值内不重弹')
  assert.deepEqual(levels([quotaEntry(95)], m), ['kimi:crit'], '升级为 crit')
  assert.deepEqual(levels([quotaEntry(80)], m), [], 'crit 回落 warn 静默,不重弹')
  assert.deepEqual(levels([quotaEntry(92)], m), [], '未完全恢复前不重弹 crit')
  assert.deepEqual(levels([quotaEntry(60)], m), [], '跌破 warn-5 → 完全恢复,静默清零')
  assert.deepEqual(levels([quotaEntry(75)], m), ['kimi:warn'], '恢复后再次越过重新触发')
  console.log('✓ 套餐型 升级触发/去重/迟滞恢复')
}

/* 套餐型:迟滞边界(70 预警线,65 恢复线) */
{
  const m = new AlertManager(T)
  assert.deepEqual(levels([quotaEntry(72)], m), ['kimi:warn'])
  assert.deepEqual(levels([quotaEntry(68)], m), [], '68 ≥ 65(warn-5):保持已触发,不重弹')
  assert.deepEqual(levels([quotaEntry(71)], m), [], '')
  assert.deepEqual(levels([quotaEntry(64)], m), [], '64 < 65:清零')
  assert.deepEqual(levels([quotaEntry(71)], m), ['kimi:warn'], '完全恢复后可再次触发')
  console.log('✓ 套餐型 恢复迟滞带(warnPct-5)')
}

/* 套餐型:新周期(重置时间变化)重新提醒 */
{
  const m = new AlertManager(T)
  assert.deepEqual(levels([quotaEntry(80, 1000)], m), ['kimi:warn'])
  assert.deepEqual(levels([quotaEntry(80, 1000)], m), [], '同周期不重弹')
  assert.deepEqual(levels([quotaEntry(80, 2000)], m), ['kimi:warn'], '重置时间变化=新周期,重新触发')
  console.log('✓ 套餐型 新周期重置')
}

/* 余额型:低余额触发一次,恢复后可再触发 */
{
  const m = new AlertManager(T)
  assert.deepEqual(levels([balanceEntry(5)], m), ['ds:warn'], '低于下限触发')
  assert.deepEqual(levels([balanceEntry(5)], m), [], '持续低余额不重弹')
  assert.deepEqual(levels([balanceEntry(15)], m), [], '恢复静默清零')
  assert.deepEqual(levels([balanceEntry(8)], m), ['ds:warn'], '再次低于重新触发')
  console.log('✓ 余额型 触发/去重/恢复')
}

/* 非 ok 状态与多账户隔离 */
{
  const m = new AlertManager(T)
  const err = { ...quotaEntry(95), status: 'auth' as const }
  assert.deepEqual(levels([err], m), [], '查询失败不触发')
  const other = { ...quotaEntry(95), accountId: 'kimi-2' }
  assert.deepEqual(levels([quotaEntry(75), other], m), ['kimi:warn', 'kimi:crit'], '多账户独立评估;95 首次直发 crit 不再发 warn')
  assert.deepEqual(levels([other], m), [], 'kimi-1 消失;kimi-2 已触发不重弹')
  assert.deepEqual(levels([quotaEntry(75), other], m), ['kimi:warn'], 'kimi-1 状态已清理→重现即重新触发;kimi-2 仍不重弹')
  console.log('✓ 非 ok 忽略 / 多账户隔离 / 状态清理')
}

/* 事件内容 */
{
  const m = new AlertManager(T)
  const [ev] = m.evaluate([quotaEntry(85, 7200)], CFG)
  const d = new Date(7200 * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  assert.equal(ev.title, 'Kimi')
  assert.equal(ev.message, `5h 窗口已用 85%,${hh}:${mm}重置`)
  assert.equal(ev.level, 'warn')
  const [bv] = m.evaluate([balanceEntry(3.5)], CFG)
  assert.equal(bv.title, 'DeepSeek')
  assert.equal(bv.message, '余额仅剩 3.5 CNY,低于下限 10')
  console.log('✓ 事件文案(title/message,经注入的 t())')
}

/* resolveLocale:语言偏好解析 */
{
  const { resolveLocale } = await import('../src/shared/i18n.ts')
  assert.equal(resolveLocale('en', 'zh-CN'), 'en', '显式偏好优先于系统')
  assert.equal(resolveLocale('auto', 'zh-CN'), 'zh-CN', 'auto 跟随系统中文')
  assert.equal(resolveLocale('auto', 'zh_TW'), 'zh-CN', 'zh 变体归 zh-CN')
  assert.equal(resolveLocale('auto', 'ja-JP'), 'en', '非中文回英文')
  console.log('✓ resolveLocale(显式优先/auto 跟随系统/回退)')
}

console.log('\n全部通过')
