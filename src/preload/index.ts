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
  openVendorsDir: (): Promise<boolean> => ipcRenderer.invoke('config:openVendorsDir'),
  getCredential: (vendorId: string, accountId: string): Promise<unknown> =>
    ipcRenderer.invoke('config:getCredential', vendorId, accountId),
  saveCredential: (vendorId: string, account: unknown): Promise<boolean> =>
    ipcRenderer.invoke('config:saveCredential', vendorId, account),
  addAccount: (vendorId: string, name: string): Promise<string> =>
    ipcRenderer.invoke('config:addAccount', vendorId, name),
  openSettings: (): Promise<boolean> => ipcRenderer.invoke('win:openSettings'),
  resizeWidget: (dWidth: number, dHeight: number): Promise<boolean> =>
    ipcRenderer.invoke('win:resizeWidget', dWidth, dHeight),
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
