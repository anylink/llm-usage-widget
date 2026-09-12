/* 阈值提醒状态机:进度条变色(L1)之上的 L2 气泡 / L3 系统通知事件源。
   纯逻辑、零 electron 依赖,便于单测。去重语义:同一阈值恢复前不重弹(DESIGN.md §10)。 */
import type { AlertEvent, DisplayConfig, UsageEntry } from '@shared/types'

type AlertsConfig = DisplayConfig['alerts']

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

  /** 每次调度器刷新后评估;返回本轮新产生的告警事件(升级才产生,静默降级不产生) */
  evaluate(entries: UsageEntry[], cfg: AlertsConfig): AlertEvent[] {
    const events: AlertEvent[] = []
    for (const e of entries) {
      if (e.status !== 'ok') continue
      const st = this.state.get(e.accountId) ?? { level: 0 as const }

      if (e.kind === 'quota') {
        // 与 UI 主进度条一致:取首个窗口
        const w = e.windows[0]
        if (!w) continue
        // 套餐重置(重置时间变化)= 新周期,清零后重新按阈值提醒
        if (w.resetEpoch && st.resetEpoch && st.resetEpoch !== w.resetEpoch) st.level = 0
        if (w.resetEpoch) st.resetEpoch = w.resetEpoch

        const up = w.utilization >= cfg.critPct ? 2 : w.utilization >= cfg.warnPct ? 1 : 0
        const down = w.utilization >= cfg.critPct ? 2 : w.utilization >= cfg.warnPct - HYSTERESIS_PCT ? 1 : 0
        if (up > st.level) {
          st.level = up as 1 | 2
          events.push(this.event(e, up === 2 ? 'crit' : 'warn', w.utilization, w.resetEpoch, cfg))
        } else if (down === 0 && st.level > 0) {
          // 部分回落(crit→warn 区间)静默保留已触发标记,完全恢复才清零
          st.level = 0
        }
      } else {
        const low = e.value !== undefined && e.value < cfg.balanceMin
        if (low && e.value !== undefined && st.level === 0) {
          st.level = 1
          events.push(this.event(e, 'warn', e.value, undefined, cfg))
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
    cfg: AlertsConfig
  ): AlertEvent {
    return {
      accountId: e.accountId,
      vendorId: e.vendorId,
      title: e.accountName && e.accountName !== e.vendorName ? `${e.vendorName} · ${e.accountName}` : e.vendorName,
      message:
        e.kind === 'quota'
          ? `${e.windows[0]?.label ?? ''} 窗口已用 ${value}%` + (resetEpoch ? `,${fmtReset(resetEpoch)}重置` : '')
          : `余额仅剩 ${value} ${e.unit ?? ''},低于下限 ${cfg.balanceMin}`,
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
