/* 轮询调度器:错峰轮询 + keep-last-good + 数据代数(借鉴 ESP32 固件 scheduler.c 的 data_gen) */
import type { SchedulerSnapshot, UsageEntry, VendorDef } from '@shared/types'
import { executeVendor, type VendorPlugin } from './engine/executor'
import type { AccountsFile, DisplayConfig } from './config'
import { decryptAccounts } from './config'

type NotifyFn = (snapshot: SchedulerSnapshot) => void

const BALANCE_INTERVAL_MS = 300_000 // 余额型默认 5 分钟
const MAX_BACKOFF_MS = 600_000

interface Job {
  vendorId: string
  accountId: string
  intervalMs: number
  timer?: NodeJS.Timeout
  backoff: number
  inFlight: boolean
}

export class Scheduler {
  private vendors: VendorDef[] = []
  private vendorErrors: { file: string; message: string }[] = []
  private accounts: AccountsFile = {}
  private display: DisplayConfig
  private plugins: Map<string, VendorPlugin>
  private jobs = new Map<string, Job>() // key = accountId
  private creds: Record<string, { id: string; name: string; key?: string; secret?: string; region?: string }[]> = {}
  private lastGood = new Map<string, UsageEntry>()
  private dataGen = 0
  private notify: NotifyFn
  private staggerIdx = 0

  constructor(plugins: Map<string, VendorPlugin>, display: DisplayConfig, notify: NotifyFn) {
    this.plugins = plugins
    this.display = display
    this.notify = notify
  }

  /** 供 IPC 读快照 */
  snapshot(): SchedulerSnapshot {
    const entries = [...this.lastGood.values()].sort((a, b) => {
      const va = this.vendors.findIndex((v) => v.id === a.vendorId)
      const vb = this.vendors.findIndex((v) => v.id === b.vendorId)
      return (va < 0 ? 999 : va) - (vb < 0 ? 999 : vb)
    })
    return { dataGen: this.dataGen, entries, vendorErrors: this.vendorErrors }
  }

  /** 重载厂商定义与账户后重建任务(供应商文件热重载/账户变更时调用) */
  reload(vendors: VendorDef[], vendorErrors: { file: string; message: string }[], accounts: AccountsFile): void {
    this.vendors = vendors
    this.vendorErrors = vendorErrors
    this.accounts = accounts
    this.creds = decryptAccounts()
    for (const job of this.jobs.values()) clearTimeout(job.timer)
    this.jobs.clear()
    this.staggerIdx = 0

    for (const def of vendors) {
      const list = accounts[def.id] ?? []
      for (const acc of list) {
        const intervalMs =
          def.defaultIntervalMs ?? (def.kind === 'balance' ? BALANCE_INTERVAL_MS : this.display.pollIntervalMs)
        const job: Job = {
          vendorId: def.id,
          accountId: acc.id,
          intervalMs,
          backoff: 0,
          inFlight: false
        }
        this.jobs.set(acc.id, job)
        // 错峰:每任务依次延后 2s 启动,避免开局并发打爆
        const delay = 1_000 + this.staggerIdx++ * 2_000
        job.timer = setTimeout(() => this.runJob(job), delay)
      }
    }
    this.emit()
  }

  setDisplay(display: DisplayConfig): void {
    this.display = display
  }

  /** 手动刷新全部(托盘/卡片按钮) */
  refreshAll(): void {
    for (const job of this.jobs.values()) {
      clearTimeout(job.timer)
      this.runJob(job)
    }
  }

  private scheduleNext(job: Job, ok: boolean): void {
    clearTimeout(job.timer)
    // 瞬时失败退避:2^n 倍,封顶 10 分钟;成功则回常态
    if (ok) job.backoff = 0
    else job.backoff = Math.min(job.backoff + 1, 5)
    const factor = job.backoff > 0 ? Math.pow(2, job.backoff) : 1
    const delay = Math.min(job.intervalMs * factor, MAX_BACKOFF_MS)
    job.timer = setTimeout(() => this.runJob(job), delay)
  }

  private async runJob(job: Job): Promise<void> {
    if (job.inFlight) return
    job.inFlight = true
    try {
      const def = this.vendors.find((v) => v.id === job.vendorId)
      const acc = (this.accounts[job.vendorId] ?? []).find((a) => a.id === job.accountId)
      if (!def || !acc) return
      const cred = this.creds[job.vendorId]?.find((a) => a.id === job.accountId) ?? {}
      const { entry, transient } = await executeVendor(def, { id: acc.id, name: acc.name }, cred, this.plugins)
      if (transient) {
        // keep-last-good:保留上次成功值,但刷新 queriedAt 前先确认确实存在旧值
        const old = this.lastGood.get(job.accountId)
        if (old) this.lastGood.set(job.accountId, old)
        else this.lastGood.set(job.accountId, entry)
      } else if (entry.status === 'ok') {
        this.lastGood.set(job.accountId, entry)
      } else {
        this.lastGood.set(job.accountId, entry)
      }
      this.scheduleNext(job, !transient && entry.status === 'ok')
      this.emit()
    } finally {
      job.inFlight = false
    }
  }

  private emit(): void {
    this.dataGen++
    this.notify(this.snapshot())
  }

  dispose(): void {
    for (const job of this.jobs.values()) clearTimeout(job.timer)
    this.jobs.clear()
  }
}
