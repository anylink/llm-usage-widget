/* M1 占位设置页:M2 将替换为 schema 驱动的完整表单 */
import { useEffect, useState } from 'react'

interface VendorRow {
  id: string
  name: string
  kind: string
  color: string
  fields: string[]
}
interface VendorListResp {
  vendors: VendorRow[]
  errors: { file: string; message: string }[]
  accounts: Record<string, { id: string; name: string; hasKey: boolean }[]>
}

export function SettingsStub() {
  const [data, setData] = useState<VendorListResp | null>(null)
  const [version, setVersion] = useState('')
  const [enc, setEnc] = useState(false)
  const [opacity, setOpacity] = useState(0.92)

  useEffect(() => {
    void window.api.getVendorList().then((d) => setData(d as VendorListResp))
    void window.api.getVersion().then(setVersion)
    void window.api.encryptionAvailable().then(setEnc)
    void window.api.getDisplay().then((d) => setOpacity((d as { opacity: number }).opacity))
  }, [])

  const setDisplay = (patch: unknown): void => {
    void window.api.setDisplay(patch)
  }

  return (
    <div className="page">
      <h1>设置 <small>v{version}</small></h1>
      {!enc && (
        <div className="warn">⚠ 系统加密不可用,API Key 将以明文保存在本地!</div>
      )}

      <section>
        <h2>显示</h2>
        <label>
          悬浮窗透明度:{Math.round(opacity * 100)}%
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => {
              const v = Number(e.target.value)
              setOpacity(v)
              setDisplay({ opacity: v })
            }}
          />
        </label>
      </section>

      <section>
        <h2>厂商与账户(编辑 TOML:完整表单将在 M2 提供)</h2>
        {data?.vendors.map((v) => (
          <div className="vendor-row" key={v.id}>
            <span className="mono" style={{ background: v.color }}>
              {v.name.charAt(0)}
            </span>
            <span className="vname">{v.name}</span>
            <span className="vkind">{v.kind === 'quota' ? '套餐' : '余额'}</span>
            <span className="vacc">
              {data.accounts[v.id]?.length ?? 0} 个账户 ·{' '}
              {data.accounts[v.id]?.some((a) => a.hasKey) ? '✅ 已配置' : '❓ 未配置 Key'}
            </span>
          </div>
        ))}
        {data?.errors.map((e) => (
          <div className="warn" key={e.file}>
            {e.file}: {e.message}
          </div>
        ))}
        <button onClick={() => void window.api.openVendorsDir()}>打开厂商配置目录(编辑后自动热重载)</button>
      </section>
    </div>
  )
}
