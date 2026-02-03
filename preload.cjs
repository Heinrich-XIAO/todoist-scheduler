const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("todoist", {
  getLifeBlocks: () => ipcRenderer.invoke("get-life-blocks"),
  saveLifeBlocks: (data) => ipcRenderer.invoke("save-life-blocks", data),
  getOverlayTask: () => ipcRenderer.invoke("get-overlay-task"),
  setOverlayMode: (mode) => ipcRenderer.invoke("set-overlay-mode", mode),
  completeTask: (taskId) => ipcRenderer.invoke("complete-task", taskId),
  snoozeTask: (payload) => ipcRenderer.invoke("snooze-task", payload),
  postponeTask: (payload) => ipcRenderer.invoke("postpone-task", payload),
  checkJustification: (payload) => ipcRenderer.invoke("check-justification", payload),
  runSchedulerNow: () => ipcRenderer.invoke("run-scheduler-now"),
  getSchedulerStatus: () => ipcRenderer.invoke("get-scheduler-status"),
  getLegacyDaemonStatus: () => ipcRenderer.invoke("legacy-daemon-status"),
  stopLegacyDaemon: () => ipcRenderer.invoke("stop-legacy-daemon"),
  getAutostartStatus: () => ipcRenderer.invoke("autostart-status"),
  enableAutostart: () => ipcRenderer.invoke("autostart-enable"),
  disableAutostart: () => ipcRenderer.invoke("autostart-disable"),
  startTaskSession: (payload) => ipcRenderer.invoke("start-task-session", payload),
  stopTaskSession: (payload) => ipcRenderer.invoke("stop-task-session", payload),
  snapOverlay: () => ipcRenderer.invoke("snap-overlay"),
  getUsageDashboard: () => ipcRenderer.invoke("get-usage-dashboard"),
  getTaskQueue: () => ipcRenderer.invoke("get-task-queue"),
  openTodoistTask: (taskId) => ipcRenderer.invoke("open-task-in-todoist", taskId),
  startQuickTask: (payload) => ipcRenderer.invoke("start-quick-task", payload),
  closeQuickWindow: () => ipcRenderer.invoke("close-quick-window"),
  onOverlayMode: (handler) =>
    ipcRenderer.on("overlay-mode", (_event, mode) => handler(mode)),
});
