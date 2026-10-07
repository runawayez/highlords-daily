import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("highlords", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  generate: () => ipcRenderer.invoke("daily:generate"),
  openOutput: () => ipcRenderer.invoke("output:open"),
  onLog: (callback) =>
    ipcRenderer.on("daily:log", (_event, line) => callback(line)),
  onStatus: (callback) =>
    ipcRenderer.on("daily:status", (_event, status) => callback(status)),
});
