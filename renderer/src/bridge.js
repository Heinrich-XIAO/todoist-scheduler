const fallback = {
  available: false,
  getLifeBlocks: async () => ({ one_off: [], weekly: [] }),
  saveLifeBlocks: async () => ({ ok: false }),
  getOverlayTask: async () => ({ task: null, mode: "full" }),
  setOverlayMode: async () => ({ ok: false }),
  completeTask: async () => ({ ok: false }),
  snoozeTask: async () => ({ ok: false, snoozeCount: 0 }),
  deferTask: async () => ({ ok: false, snoozeCount: 0 }),
  postponeTask: async () => ({ ok: false, sleep: false }),
  checkJustification: async () => ({ approved: true, message: "" }),
  runSchedulerNow: async () => ({ ok: false }),
  getSchedulerStatus: async () => ({ lastRun: null, nextRun: null, lastError: null }),
  getLegacyDaemonStatus: async () => ({ pids: [] }),
  stopLegacyDaemon: async () => ({ ok: false, pids: [] }),
  getAutostartStatus: async () => ({ installed: false }),
  enableAutostart: async () => ({ installed: false }),
  disableAutostart: async () => ({ installed: false }),
  startTaskSession: async () => ({ ok: false }),
  stopTaskSession: async () => ({ ok: false }),
  snapOverlay: async () => ({ ok: false }),
  setOverlayPosition: async () => ({ ok: false }),
  moveOverlayBy: async () => ({ ok: false }),
  getUsageDashboard: async () => ({ ok: false, time: {}, counts: {}, top_tasks: [], recent_events: [] }),
  getTaskQueueCache: async () => ({ ok: false, tasks: [], cachedAt: null }),
  getTaskQueue: async () => ({ ok: false, tasks: [] }),
  openTodoistTask: async () => ({ ok: false }),
  startQueueTask: async () => ({ ok: false }),
  startQuickTask: async () => ({ ok: false }),
  closeQuickWindow: async () => ({ ok: false }),
  showCornerCompletionPopup: async () => ({ ok: false }),
  onOverlayMode: () => {},
  onOverlayCornerAnchor: () => {},
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
  deferTask: (payload) => current().deferTask(payload),
  postponeTask: (payload) => current().postponeTask(payload),
  checkJustification: (payload) => current().checkJustification(payload),
  runSchedulerNow: () => current().runSchedulerNow(),
  getSchedulerStatus: () => current().getSchedulerStatus(),
  getLegacyDaemonStatus: () => current().getLegacyDaemonStatus(),
  stopLegacyDaemon: () => current().stopLegacyDaemon(),
  getAutostartStatus: () => current().getAutostartStatus(),
  enableAutostart: () => current().enableAutostart(),
  disableAutostart: () => current().disableAutostart(),
  startTaskSession: (payload) => current().startTaskSession(payload),
  stopTaskSession: (payload) => current().stopTaskSession(payload),
  snapOverlay: () => current().snapOverlay(),
  setOverlayPosition: (payload) => current().setOverlayPosition(payload),
  moveOverlayBy: (payload) => {
    console.log("[Overlay][drag] moveOverlayBy", payload);
    const fn = current().moveOverlayBy;
    if (typeof fn !== "function") {
      console.log("[Overlay][drag] moveOverlayBy missing on bridge");
      return { ok: false, reason: "missing-bridge" };
    }
    return fn(payload);
  },
  showCornerCompletionPopup: (payload) => current().showCornerCompletionPopup(payload),
  getUsageDashboard: () => current().getUsageDashboard(),
  getTaskQueueCache: () => current().getTaskQueueCache(),
  getTaskQueue: () => current().getTaskQueue(),
  openTodoistTask: (taskId) => current().openTodoistTask(taskId),
  startQueueTask: (payload) => current().startQueueTask(payload),
  startQuickTask: (payload) => current().startQuickTask(payload),
  closeQuickWindow: () => current().closeQuickWindow(),
  onOverlayMode: (handler) => current().onOverlayMode(handler),
  onOverlayCornerAnchor: (handler) => current().onOverlayCornerAnchor(handler),
};

export default api;
