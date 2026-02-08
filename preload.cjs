const { contextBridge, ipcRenderer } = require("electron");

const isE2E = process.env.E2E_TEST === "1";

if (isE2E) {
  const makeIsoOffset = (minutes) =>
    new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const todayAnchor = new Date();
  todayAnchor.setHours(10, 0, 0, 0);
  const yesterdayAnchor = new Date(todayAnchor);
  yesterdayAnchor.setDate(todayAnchor.getDate() - 1);
  const tomorrowAnchor = new Date(todayAnchor);
  tomorrowAnchor.setDate(todayAnchor.getDate() + 1);

  let lifeBlocks = {
    one_off: [
      { date: "2025-01-10", start: "09:00", end: "10:00", label: "Focus" },
    ],
    weekly: [
      { days: ["mon", "wed"], start: "14:00", end: "15:30", label: "Deep work" },
    ],
  };
  const overlayTask = {
    id: "overlay-1",
    content: "Focus sprint",
    description: "Work through the scheduling roadmap.",
    estimatedMinutes: 45,
    snoozeCount: 0,
    suggested: true,
  };
  let overlayMode = "full";
  let overlayHandler = null;
  let snoozeCount = 0;
  let autostartInstalled = false;
  let legacyPids = [4321];

  const queueTasks = [
    {
      id: "overdue-1",
      content: "Overdue Task",
      description: "Fix scheduler regression",
      due: yesterdayAnchor.toISOString(),
      priority: 4,
      is_recurring: false,
    },
    {
      id: "today-1",
      content: "Today Task",
      description: "Draft weekly update",
      due: todayAnchor.toISOString(),
      priority: 3,
      is_recurring: true,
    },
    {
      id: "upcoming-1",
      content: "Upcoming Task",
      description: "Plan next sprint",
      due: tomorrowAnchor.toISOString(),
      priority: 2,
      is_recurring: false,
    },
  ];

  const usageDashboard = {
    time: { today_seconds: 3600, last7_seconds: 7200, last30_seconds: 14400 },
    counts: { all_time: { scheduler_run_auto: 3, task_complete: 2 } },
    top_tasks: [
      { task_id: "task-deep-work", task_name: "Deep work", total_seconds: 3600 },
    ],
    recent_events: [
      { type: "session_start", at: makeIsoOffset(-30), task_name: "Deep work" },
      { type: "scheduler_run_auto", at: makeIsoOffset(-15), task_name: "" },
    ],
  };
  const mockOverlayCornerAnchor = { x: 600, y: 900, width: 320, height: 70 };

  contextBridge.exposeInMainWorld("todoist", {
    getLifeBlocks: async () => lifeBlocks,
    saveLifeBlocks: async (data) => {
      lifeBlocks = data;
      return { ok: true };
    },
    getOverlayTask: async () => ({
      task: overlayTask,
      mode: overlayMode,
      elapsedSeconds: 90,
      sessionActive: false,
    }),
    setOverlayMode: async (mode) => {
      overlayMode = mode;
      if (overlayHandler) overlayHandler(mode);
      return { ok: true };
    },
    completeTask: async () => ({ ok: true }),
    snoozeTask: async () => {
      snoozeCount += 1;
      return { ok: true, snoozeCount };
    },
    deferTask: async () => ({ ok: true }),
    postponeTask: async () => ({
      ok: true,
      customPostponed: true,
      parsedDate: makeIsoOffset(120),
    }),
    checkJustification: async () => ({
      approved: true,
      message: "Approved for tests",
    }),
    runSchedulerNow: async () => ({ ok: true }),
    getSchedulerStatus: async () => ({
      lastRun: makeIsoOffset(-45),
      nextRun: makeIsoOffset(5),
      lastError: null,
    }),
    getLegacyDaemonStatus: async () => ({ pids: legacyPids }),
    stopLegacyDaemon: async () => {
      legacyPids = [];
      return { ok: true, pids: legacyPids };
    },
    getAutostartStatus: async () => ({ installed: autostartInstalled }),
    enableAutostart: async () => {
      autostartInstalled = true;
      return { installed: true };
    },
    disableAutostart: async () => {
      autostartInstalled = false;
      return { installed: false };
    },
    startTaskSession: async () => ({ ok: true }),
    stopTaskSession: async () => ({ ok: true }),
    snapOverlay: async () => ({ ok: true }),
    getUsageDashboard: async () => usageDashboard,
    getTaskQueueCache: async () => ({
      ok: true,
      tasks: queueTasks,
      cachedAt: makeIsoOffset(-10),
    }),
    getTaskQueue: async () => ({ ok: true, tasks: queueTasks }),
    openTodoistTask: async () => ({ ok: true }),
    startQueueTask: async () => ({ ok: true }),
    startQuickTask: async () => ({ ok: true }),
    closeQuickWindow: async () => ({ ok: true }),
    setTaskDuration: async () => ({ ok: true }),
    setOverlayPosition: async () => ({ ok: true }),
    moveOverlayBy: async () => ({ ok: true }),
    showCornerCompletionPopup: async () => ({ ok: true }),
    openNextTaskPopup: async () => ({ ok: true }),
    closeNextTaskPopup: async () => ({ ok: true }),
    onNextTaskPopupAction: () => () => {},
    onNextTaskPopupData: () => () => {},
    sendNextTaskPopupAction: async () => ({ ok: true }),
    onOverlayMode: (handler) => {
      overlayHandler = handler;
    },
    onOverlayCornerAnchor: (handler) => {
      handler(mockOverlayCornerAnchor);
    },
  });
} else {
  contextBridge.exposeInMainWorld("todoist", {
    getLifeBlocks: () => ipcRenderer.invoke("get-life-blocks"),
    saveLifeBlocks: (data) => ipcRenderer.invoke("save-life-blocks", data),
    getOverlayTask: () => ipcRenderer.invoke("get-overlay-task"),
    setOverlayMode: (mode) => ipcRenderer.invoke("set-overlay-mode", mode),
    completeTask: (taskId) => ipcRenderer.invoke("complete-task", taskId),
    snoozeTask: (payload) => ipcRenderer.invoke("snooze-task", payload),
    deferTask: (payload) => ipcRenderer.invoke("defer-task", payload),
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
    getTaskQueueCache: () => ipcRenderer.invoke("get-task-queue-cache"),
    getTaskQueue: () => ipcRenderer.invoke("get-task-queue"),
    openTodoistTask: (taskId) => ipcRenderer.invoke("open-task-in-todoist", taskId),
    startQueueTask: (payload) => ipcRenderer.invoke("start-queue-task", payload),
    startQuickTask: (payload) => ipcRenderer.invoke("start-quick-task", payload),
    closeQuickWindow: () => ipcRenderer.invoke("close-quick-window"),
    setOverlayPosition: (payload) => ipcRenderer.invoke("overlay-set-position", payload),
    moveOverlayBy: (payload) => {
      console.log("[Overlay][drag] ipc invoke overlay-move-by", payload);
      return ipcRenderer.invoke("overlay-move-by", payload);
    },
    showCornerCompletionPopup: (payload) =>
      ipcRenderer.invoke("overlay-corner-completion-popup", payload),
    openNextTaskPopup: (payload) =>
      ipcRenderer.invoke("overlay-open-next-task-popup", payload),
    closeNextTaskPopup: () => ipcRenderer.invoke("overlay-close-next-task-popup"),
    setTaskDuration: (payload) => ipcRenderer.invoke("set-task-duration", payload),
    onNextTaskPopupAction: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on("overlay-next-task-popup-action", listener);
      return () => ipcRenderer.off("overlay-next-task-popup-action", listener);
    },
    onNextTaskPopupData: (handler) => {
      const listener = (_event, data) => handler(data);
      ipcRenderer.on("next-task-popup-data", listener);
      return () => ipcRenderer.off("next-task-popup-data", listener);
    },
    sendNextTaskPopupAction: (payload) => ipcRenderer.invoke("next-task-popup-action", payload),
    onOverlayMode: (handler) =>
      ipcRenderer.on("overlay-mode", (_event, mode) => handler(mode)),
    onOverlayCornerAnchor: (handler) =>
      ipcRenderer.on("overlay-corner-anchor", (_event, anchor) => handler(anchor)),
  });
}
