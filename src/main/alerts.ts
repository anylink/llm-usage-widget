/* 阈值提醒状态机:进度条变色(L1)之上的 L2 气泡 / L3 系统通知事件源。
   纯逻辑、零 electron 依赖,便于单测。去重语义:同一阈值恢复前不重弹(DESIGN.md §10)。
   文案经注入的 t() 本地化(主进程 i18n 实例)。 */
import type { AlertEvent, DisplayConfig, UsageEntry } from '@shared/types'

type AlertsConfig = DisplayConfig['alerts']
/** i18next 翻译函数形状 */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

/** 恢复迟滞:已触发 warn 后需跌回 warnPct-5 以下才算完全恢复,防止在阈值附近反复提醒 */
const HYSTERESIS_PCT = 5

interface AccountAlertState {
  /** 0=正常 1=已触发预警 2=已触发告警 */
  level: 0 | 1 | 2
  /** 触发时的重置时间;变化即视为新周期,清零允许重新提醒 */
  resetEpoch?: number
}

export class AlertManager {
  private state = new Map<string, AccountAlertState>()
  private t: TranslateFn

  constructor(t: TranslateFn) {
    this.t = t
  }

  /** 每次调度器刷新后评估;返回本轮新产生的告警事件(升级才产生,静默降级不产生) */
  evaluate(entries: UsageEntry[], cfg: AlertsConfig): AlertEvent[] {
    const events: AlertEvent[] = []
    for (const e of entries) {
      if (e.status !== 'ok') continue
      // 每厂商覆盖(设计 §10.2):未给出的字段回落全局默认
      const ov = cfg.overrides?.[e.vendorId] ?? {}
      const eff = {
        warnPct: ov.warnPct ?? cfg.warnPct,
        critPct: ov.critPct ?? cfg.critPct,
        balanceMin: ov.balanceMin ?? cfg.balanceMin
      }
      const st = this.state.get(e.accountId) ?? { level: 0 as const }

      if (e.kind === 'quota') {
        // 与 UI 主进度条一致:取首个窗口
        const w = e.windows[0]
        if (!w) continue
        // 套餐重置(重置时间变化)= 新周期,清零后重新按阈值提醒
        if (w.resetEpoch && st.resetEpoch && st.resetEpoch !== w.resetEpoch) st.level = 0
        if (w.resetEpoch) st.resetEpoch = w.resetEpoch

        const up = w.utilization >= eff.critPct ? 2 : w.utilization >= eff.warnPct ? 1 : 0
        const down =
          w.utilization >= eff.critPct ? 2 : w.utilization >= eff.warnPct - HYSTERESIS_PCT ? 1 : 0
        if (up > st.level) {
          st.level = up as 1 | 2
          events.push(this.event(e, up === 2 ? 'crit' : 'warn', w.utilization, w.resetEpoch, eff))
        } else if (down === 0 && st.level > 0) {
          // 部分回落(crit→warn 区间)静默保留已触发标记,完全恢复才清零
          st.level = 0
        }
      } else {
        const low = e.value !== undefined && e.value < eff.balanceMin
        if (low && e.value !== undefined && st.level === 0) {
          st.level = 1
          events.push(this.event(e, 'warn', e.value, undefined, eff))
        } else if (!low && st.level > 0) {
          st.level = 0
        }
      }
      this.state.set(e.accountId, st)
    }

    // 已删除的账户不再保留状态
    const live = new Set(entries.map((e) => e.accountId))
    for (const id of this.state.keys()) {
      if (!live.has(id)) this.state.delete(id)
    }
    return events
  }

  private event(
    e: UsageEntry,
    level: 'warn' | 'crit',
    value: number,
    resetEpoch: number | undefined,
    eff: { warnPct: number; critPct: number; balanceMin: number }
  ): AlertEvent {
    const label = e.windows[0]?.label ?? ''
    return {
      accountId: e.accountId,
      vendorId: e.vendorId,
      title: e.accountName && e.accountName !== e.vendorName ? `${e.vendorName} · ${e.accountName}` : e.vendorName,
      message:
        e.kind === 'quota'
          ? resetEpoch
            ? this.t('alerts.quotaMsg', { label, pct: value, time: fmtReset(resetEpoch) })
            : this.t('alerts.quotaMsgNoReset', { label, pct: value })
          : this.t('alerts.balanceMsg', { value, unit: e.unit ?? '', min: eff.balanceMin }),
      level,
      kind: e.kind,
      color: e.color,
      at: Math.floor(Date.now() / 1000)
    }
  }
}

/** 重置时间 → 本地 HH:mm(设计示例:"14:32 重置") */
function fmtReset(resetEpoch: number): string {
  const d = new Date(resetEpoch * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
