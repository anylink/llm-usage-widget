/* contextBridge:渲染进程唯一可用的 API 面(无 Node、无 remote) */
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSnapshot: (): Promise<unknown> => ipcRenderer.invoke('usage:snapshot'),
  refresh: (): Promise<boolean> => ipcRenderer.invoke('usage:refresh'),
  onUsageUpdated: (cb: (snapshot: unknown) => void): void => {
    ipcRenderer.on('usage:updated', (_e, snapshot) => cb(snapshot))
  },
  getDisplay: (): Promise<unknown> => ipcRenderer.invoke('config:getDisplay'),
  setDisplay: (patch: unknown): Promise<unknown> => ipcRenderer.invoke('config:setDisplay', patch),
  onDisplayChanged: (cb: (cfg: unknown) => void): void => {
    ipcRenderer.on('display:changed', (_e, cfg) => cb(cfg))
  },
  onAlertBubble: (cb: (ev: unknown) => void): void => {
    ipcRenderer.on('alerts:bubble', (_e, ev) => cb(ev))
  },
  getVendorList: (): Promise<unknown> => ipcRenderer.invoke('config:vendorList'),
  getVendorDef: (id: string): Promise<unknown> => ipcRenderer.invoke('config:getVendorDef', id),
  testVendor: (def: unknown, cred: { key?: string }): Promise<unknown> =>
    ipcRenderer.invoke('vendor:test', def, cred),
  saveVendor: (def: unknown): Promise<{ ok: boolean; file?: string; error?: string }> =>
    ipcRenderer.invoke('vendor:save', def),
  scanCcSwitch: (): Promise<unknown> => ipcRenderer.invoke('ccswitch:scan'),
  importCcSwitch: (items: { vendorId: string; name: string; key: string }[]): Promise<number> =>
    ipcRenderer.invoke('ccswitch:import', items),
  getThemes: (): Promise<unknown> => ipcRenderer.invoke('themes:list'),
  onThemesChanged: (cb: (t: unknown) => void): void => {
    ipcRenderer.on('themes:changed', (_e, t) => cb(t))
  },
  getLogos: (): Promise<unknown> => ipcRenderer.invoke('logos:get'),
  onLogosChanged: (cb: (l: unknown) => void): void => {
    ipcRenderer.on('logos:changed', (_e, l) => cb(l))
  },
  uploadLogo: (vendorId: string, dataUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('logos:upload', vendorId, dataUrl),
  removeLogo: (vendorId: string): Promise<boolean> => ipcRenderer.invoke('logos:remove', vendorId),
  openVendorsDir: (): Promise<boolean> => ipcRenderer.invoke('config:openVendorsDir'),
  getCredential: (vendorId: string, accountId: string): Promise<unknown> =>
    ipcRenderer.invoke('config:getCredential', vendorId, accountId),
  saveCredential: (vendorId: string, account: unknown): Promise<boolean> =>
    ipcRenderer.invoke('config:saveCredential', vendorId, account),
  addAccount: (vendorId: string, name: string): Promise<string> =>
    ipcRenderer.invoke('config:addAccount', vendorId, name),
  deleteAccount: (vendorId: string, accountId: string): Promise<boolean> =>
    ipcRenderer.invoke('config:deleteAccount', vendorId, accountId),
  openSettings: (): Promise<boolean> => ipcRenderer.invoke('win:openSettings'),
  resizeWidget: (d: { dW: number; dH: number; dX: number; dY: number }): Promise<boolean> =>
    ipcRenderer.invoke('win:resizeWidget', d),
  setHeight: (height: number): Promise<boolean> => ipcRenderer.invoke('win:setHeight', height),
  encryptionAvailable: (): Promise<boolean> => ipcRenderer.invoke('env:encryptionAvailable'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  checkUpdate: (): Promise<unknown> => ipcRenderer.invoke('app:checkUpdate'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('app:installUpdate'),
  onUpdateStatus: (cb: (s: unknown) => void): void => {
    ipcRenderer.on('update:status', (_e, s) => cb(s))
  },
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('app:openExternal', url)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
