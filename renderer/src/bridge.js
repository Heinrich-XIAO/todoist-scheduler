const fallback = {
  available: false,
  getLifeBlocks: async () => ({ one_off: [], weekly: [] }),
  saveLifeBlocks: async () => ({ ok: false }),
  getOverlayTask: async () => ({ task: null, mode: "full" }),
  setOverlayMode: async () => ({ ok: false }),
  completeTask: async () => ({ ok: false }),
  snoozeTask: async () => ({ ok: false, snoozeCount: 0 }),
  postponeTask: async () => ({ ok: false, sleep: false }),
  checkJustification: async () => ({ approved: true, message: "" }),
  runSchedulerNow: async () => ({ ok: false }),
  getSchedulerStatus: async () => ({ lastRun: null, nextRun: null, lastError: null }),
  getLegacyDaemonStatus: async () => ({ pids: [] }),
  stopLegacyDaemon: async () => ({ ok: false, pids: [] }),
  getAutostartStatus: async () => ({ installed: false }),
  enableAutostart: async () => ({ installed: false }),
  disableAutostart: async () => ({ installed: false }),
  onOverlayMode: () => {},
};

const current = () => window.todoist || fallback;

const api = {
  isAvailable: () => Boolean(window.todoist),
  getLifeBlocks: () => current().getLifeBlocks(),
  saveLifeBlocks: (data) => current().saveLifeBlocks(data),
  getOverlayTask: () => current().getOverlayTask(),
  setOverlayMode: (mode) => current().setOverlayMode(mode),
  completeTask: (taskId) => current().completeTask(taskId),
  snoozeTask: (payload) => current().snoozeTask(payload),
  postponeTask: (payload) => current().postponeTask(payload),
  checkJustification: (payload) => current().checkJustification(payload),
  runSchedulerNow: () => current().runSchedulerNow(),
  getSchedulerStatus: () => current().getSchedulerStatus(),
  getLegacyDaemonStatus: () => current().getLegacyDaemonStatus(),
  stopLegacyDaemon: () => current().stopLegacyDaemon(),
  getAutostartStatus: () => current().getAutostartStatus(),
  enableAutostart: () => current().enableAutostart(),
  disableAutostart: () => current().disableAutostart(),
  onOverlayMode: (handler) => current().onOverlayMode(handler),
};

export default api;
