import {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
  shell,
  globalShortcut,
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import dotenv from "dotenv";
import { execFileSync, execFile } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname);

dotenv.config({ path: path.join(repoRoot, ".env.local") });

const APP_NAME = "Todoist Scheduler";
app.setName(APP_NAME);

const IS_E2E = process.env.E2E_TEST === "1";

// Disable network service sandbox to prevent crashes
app.commandLine.appendSwitch("disable-features", "NetworkService,NetworkServiceSandbox");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-software-rasterizer");

const DATA_DIR =
  process.env.TODOIST_SCHEDULER_DATA_DIR || path.join(repoRoot, "data");
const LOG_DIR = path.join(DATA_DIR, "logs");

const TODOIST_KEY = process.env.TODOIST_KEY || "";
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || "";
const OPENROUTER_PROXY =
  process.env.OPENROUTER_PROXY || "https://openrouter.ai/api/v1";

const INTERVAL_MINUTES = 5;
const SLEEP_HOUR = 20;
const SLEEP_MINUTE = 45;
const WEEKDAY_START_HOUR = 16;
const WEEKDAY_START_MINUTE = 15;
const WEEKEND_START_HOUR = 9;

const NOTIFICATION_WINDOW_MINUTES = 2;
const NOTIFICATION_COOLDOWN_MINUTES = 5;
const QUEUE_SUGGESTION_COOLDOWN_MINUTES = 10;
const CHECK_INTERVAL_MS = 10_000;
const SCHEDULER_INTERVAL_MS = 300_000;

const COMPUTER_KEYWORDS = [
  "email",
  "message",
  "slack",
  "discord",
  "code",
  "program",
  "develop",
  "write",
  "document",
  "spreadsheet",
  "excel",
  "word",
  "powerpoint",
  "research",
  "search",
  "browse",
  "website",
  "web",
  "online",
  "internet",
  "file",
  "folder",
  "organize",
  "backup",
  "sync",
  "update",
  "install",
  "configure",
  "setup",
  "settings",
  "account",
  "login",
  "password",
  "review",
  "edit",
  "create",
  "design",
  "figma",
  "render",
  "compile",
  "build",
  "deploy",
  "git",
  "github",
  "terminal",
  "command",
  "script",
  "database",
  "sql",
  "api",
  "zoom",
  "meeting",
  "call",
  "conference",
  "teams",
  "meet",
  "calendar",
  "schedule",
  "plan",
  "todoist",
  "notion",
  "obsidian",
  "read",
  "article",
  "pdf",
  "paper",
  "ebook",
  "watch",
  "video",
  "tutorial",
  "course",
  "learn",
  "study",
];

const OFFLINE_KEYWORDS = [
  "grocery",
  "shopping",
  "store",
  "mall",
  "buy",
  "purchase",
  "clean",
  "wash",
  "laundry",
  "dishes",
  "vacuum",
  "sweep",
  "cook",
  "meal",
  "food",
  "kitchen",
  "recipe",
  "exercise",
  "gym",
  "workout",
  "run",
  "walk",
  "jog",
  "phone",
  "visit",
  "in-person",
  "drive",
  "car",
  "gas",
  "oil",
  "repair",
  "mechanic",
  "bank",
  "atm",
  "post office",
  "mail",
  "letter",
  "package",
  "doctor",
  "dentist",
  "appointment",
  "health",
  "medical",
  "house",
  "home",
  "paint",
  "yard",
  "garden",
  "pet",
  "dog",
  "cat",
  "vet",
  "feed",
  "trash",
  "garbage",
  "recycling",
];

let mainWindow = null;
let overlayWindow = null;
let quickWindow = null;
let overlayTask = null;
let overlayMode = "full";
let overlayCornerAnchor = null;
let nextTaskWindow = null;
let nextTaskWindowReady = false;
let nextTaskPopupPayload = null;
let nextTaskAutoStartTimer = null;
const OVERLAY_CORNER_SNAP_PX = 5;
let schedulerInstance = null;
let schedulerStatus = { lastRun: null, nextRun: null, lastError: null };
let notificationCount = 0;
let lastNotificationAt = null;
let tray = null;
let activeSessions = new Map();
let overlaySizeInterval = null;
let lastQueueSuggestionAt = 0;
let lastQueueSuggestionTaskId = null;

let lastNotificationTime = {};
let activeOverlays = new Set();

ensureDir(DATA_DIR);
ensureDir(LOG_DIR);

const persistedStatus = loadSchedulerStatus();
schedulerStatus = {
  lastRun: persistedStatus.lastRun || null,
  nextRun: persistedStatus.nextRun || null,
  lastError: persistedStatus.lastError || null,
};
notificationCount = Number(persistedStatus.notificationCount || 0);
lastNotificationAt = persistedStatus.lastNotificationAt || null;

const logFile = path.join(LOG_DIR, "electron.log");
function log(message) {
  const line = `[${new Date().toISOString()}] ${message}${os.EOL}`;
  fs.appendFileSync(logFile, line);
}

log("Electron main starting");

process.on("uncaughtException", (err) => {
  log(`Uncaught exception: ${err?.stack || err}`);
});

process.on("unhandledRejection", (err) => {
  log(`Unhandled rejection: ${err?.stack || err}`);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log("Another instance is already running. Exiting.");
  app.quit();
}

app.on("second-instance", () => {
  log("Second instance detected.");
});

const ELECTRON_DEV_PLIST = "com.user.todoist-electron-dev.plist";

function electronLaunchAgentPath() {
  return path.join(os.homedir(), "Library/LaunchAgents", ELECTRON_DEV_PLIST);
}

function findBunPath() {
  try {
    return execFileSync("which", ["bun"], { encoding: "utf-8" }).trim();
  } catch (err) {
    const fallback = [
      "/opt/homebrew/bin/bun",
      "/usr/local/bin/bun",
      path.join(os.homedir(), ".bun/bin/bun"),
    ];
    for (const candidate of fallback) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return "bun";
  }
}

function buildAutostartPlist() {
  const bunPath = findBunPath();
  const workdir = repoRoot;
  const stdoutPath = path.join(LOG_DIR, "electron-dev.log");
  const stderrPath = path.join(LOG_DIR, "electron-dev.error.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.todoist-electron-dev</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bunPath}</string>
    <string>run</string>
    <string>dev</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${workdir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${stdoutPath}</string>
  <key>StandardErrorPath</key>
  <string>${stderrPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>`;
}

function enableAutostart() {
  const plistPath = electronLaunchAgentPath();
  fs.writeFileSync(plistPath, buildAutostartPlist());
  runLaunchctl(["bootstrap", `gui/${process.getuid()}`, plistPath]);
  runLaunchctl([
    "enable",
    `gui/${process.getuid()}/com.user.todoist-electron-dev`,
  ]);
  runLaunchctl([
    "kickstart",
    "-k",
    `gui/${process.getuid()}/com.user.todoist-electron-dev`,
  ]);
}

function disableAutostart() {
  const plistPath = electronLaunchAgentPath();
  runLaunchctl(["bootout", `gui/${process.getuid()}`, plistPath]);
  try {
    if (fs.existsSync(plistPath)) {
      fs.unlinkSync(plistPath);
    }
  } catch (err) {
    log(`Failed to remove autostart plist: ${err}`);
  }
}

function autostartStatus() {
  const plistPath = electronLaunchAgentPath();
  return { installed: fs.existsSync(plistPath) };
}

function runLaunchctl(args) {
  try {
    execFileSync("launchctl", args, {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch (err) {
    log(`launchctl ${args.join(" ")} failed: ${err}`);
    return false;
  }
}

function findLegacyDaemonPids() {
  try {
    const output = execFileSync("pgrep", ["-f", "src.cli_notifier"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\s+/)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
  } catch (err) {
    return [];
  }
}

function stopLegacyDaemon() {
  const plistPath = path.join(
    os.homedir(),
    "Library/LaunchAgents/com.user.todoist-notifier.plist"
  );
  runLaunchctl(["bootout", `gui/${process.getuid()}`, plistPath]);
  try {
    execFileSync("pkill", ["-f", "src.cli_notifier"]);
  } catch (err) {
    // ok if nothing to kill
  }
}

function getAppUrl() {
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }
  return `file://${path.join(__dirname, "dist/renderer/index.html")}`;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    backgroundColor: "#0b0b0b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  mainWindow.loadURL(getAppUrl());
  if (!IS_E2E) {
    mainWindow.on("close", (event) => {
      if (app.isQuiting) return;
      event.preventDefault();
      mainWindow.hide();
    });
  }
}

function createQuickWindow() {
  if (quickWindow) return;
  quickWindow = new BrowserWindow({
    width: 520,
    height: 200,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    frame: false,
    backgroundColor: "#0b0b0b",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      devTools: false,
    },
  });
  quickWindow.setMenuBarVisibility(false);
  quickWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  quickWindow.loadURL(`${getAppUrl()}?page=quick`);
  quickWindow.on("blur", () => {
    quickWindow?.hide();
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  overlayWindow.setMenuBarVisibility(false);
  // Keep the overlay visible across macOS Spaces/desktops.
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.on("show", () => log("Overlay window show"));
  overlayWindow.on("hide", () => log("Overlay window hide"));
  overlayWindow.on("close", () => log("Overlay window close"));
  overlayWindow.on("closed", () => log("Overlay window closed"));
  overlayWindow.on("unresponsive", () => log("Overlay window unresponsive"));
  overlayWindow.webContents.on("render-process-gone", (_event, details) => {
    log(`Overlay render process gone: ${details?.reason || "unknown"}`);
  });
  overlayWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    log(`Overlay did-fail-load (${code}): ${desc} ${url || ""}`.trim());
  });
  overlayWindow.loadURL(`${getAppUrl()}?page=overlay`);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
    overlayTask = null;
    overlayMode = "full";
    if (overlaySizeInterval) {
      clearInterval(overlaySizeInterval);
      overlaySizeInterval = null;
    }
  });
}

function createTray() {
  if (tray) return;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#0b0b0b" />
      <path d="M18 34h28" stroke="#2b5dff" stroke-width="6" stroke-linecap="round" />
      <path d="M24 22h16" stroke="#f0b24a" stroke-width="6" stroke-linecap="round" />
      <path d="M24 46h16" stroke="#f0b24a" stroke-width="6" stroke-linecap="round" />
    </svg>
  `;
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  );
  image.setTemplateImage(true);
  tray = new Tray(image);
  const menu = Menu.buildFromTemplate([
    {
      label: "Open Todoist Scheduler",
      click: () => {
        if (!mainWindow) createMainWindow();
        mainWindow.show();
      },
    },
    {
      label: "Run Scheduler Now",
      click: () => {
        if (schedulerInstance) {
          schedulerInstance.run().catch((err) => log(`Scheduler error: ${err}`));
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("Todoist Scheduler");
  tray.setContextMenu(menu);
}

function ensureOverlayWindow() {
  if (!overlayWindow) {
    createOverlayWindow();
  }
}

function isOverlayWindowActive() {
  if (!overlayWindow) return false;
  if (overlayWindow.isDestroyed()) return false;
  if (!overlayWindow.isVisible()) return false;
  if (overlayWindow.isMinimized()) return false;
  return true;
}

function resetOverlay(reason) {
  if (reason) log(`Overlay reset: ${reason}`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  overlayWindow = null;
  overlayTask = null;
  overlayMode = "full";
  overlayCornerAnchor = null;
  closeNextTaskWindow();
}

function describeOverlayWindow() {
  if (!overlayWindow) return "none";
  try {
    const bounds = overlayWindow.getBounds();
    return JSON.stringify({
      visible: overlayWindow.isVisible(),
      minimized: overlayWindow.isMinimized(),
      focused: overlayWindow.isFocused(),
      destroyed: overlayWindow.isDestroyed(),
      fullscreen: overlayWindow.isFullScreen(),
      bounds,
    });
  } catch (err) {
    return "unknown";
  }
}

function broadcastOverlayCornerAnchor() {
  if (!overlayWindow) return;
  overlayWindow.webContents.send(
    "overlay-corner-anchor",
    overlayMode === "corner" ? overlayCornerAnchor : null
  );
}

function applyCornerBounds() {
  if (!overlayWindow) return;
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setResizable(false);
  overlayWindow.setMinimumSize(320, 70);
  overlayWindow.setMaximumSize(320, 70);
  overlayWindow.setSize(320, 70);
  const { width, height } = overlayWindow.getBounds();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const x = Math.round((display.workAreaSize.width - width) / 2);
  const y = Math.round(display.workAreaSize.height - height - 40);
  overlayWindow.setPosition(x, y, false);
  overlayCornerAnchor = { x, y, width, height };
  broadcastOverlayCornerAnchor();
}

function setOverlayMode(mode) {
  overlayMode = mode;
  if (!overlayWindow) return;
  if (overlayTask && activeSessions.has(overlayTask.id)) {
    const current = activeSessions.get(overlayTask.id);
    activeSessions.set(overlayTask.id, { ...current, mode });
  }
  if (mode === "corner") {
    overlayWindow.setBackgroundColor("#00000000");
    if (overlayWindow.isFullScreen()) {
      overlayWindow.once("leave-full-screen", applyCornerBounds);
      overlayWindow.setFullScreen(false);
    } else {
      applyCornerBounds();
    }
  } else if (mode === "completion") {
    overlayWindow.setBackgroundColor("#0b0b0b");
    overlayWindow.setResizable(false);
    overlayWindow.setSize(400, 250);
    overlayWindow.center();
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
  } else {
    overlayWindow.setBackgroundColor("#0b0b0b");
    overlayWindow.setResizable(true);
    overlayWindow.setMinimumSize(0, 0);
    overlayWindow.setMaximumSize(10000, 10000);
    overlayWindow.setFullScreen(false);
    overlayWindow.setSize(600, 400);
    overlayWindow.center();
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
  }
  overlayWindow.webContents.send("overlay-mode", mode);
  broadcastOverlayCornerAnchor();
}

function createNextTaskWindow() {
  nextTaskWindowReady = false;
  const win = new BrowserWindow({
    width: 560,
    height: 420,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(`${getAppUrl()}?page=next-task-popup`);
  win.once("ready-to-show", () => {
    win.show();
  });
  win.on("closed", () => {
    nextTaskWindow = null;
    nextTaskWindowReady = false;
    nextTaskPopupPayload = null;
  });
  win.webContents.on("did-finish-load", () => {
    nextTaskWindowReady = true;
    if (nextTaskPopupPayload) {
      win.webContents.send("next-task-popup-data", nextTaskPopupPayload);
    }
  });
  nextTaskWindow = win;
  return win;
}

function clearNextTaskAutoStartTimer() {
  if (nextTaskAutoStartTimer) {
    clearTimeout(nextTaskAutoStartTimer);
    nextTaskAutoStartTimer = null;
  }
}

async function startQueueTaskInternal(payload) {
  try {
    const taskId = payload?.taskId;
    const taskName = payload?.taskName?.trim();
    const description = payload?.description?.trim() || "";
    const requestedMode = payload?.mode || "corner";
    if (!taskId || !taskName) {
      log("start-queue-task: missing task id or name");
      return { ok: false, reason: "missing-task" };
    }
    if ((overlayWindow && !isOverlayWindowActive()) || (overlayTask && !isOverlayWindowActive())) {
      resetOverlay("stale overlay state");
    } else if (overlayWindow && !overlayTask) {
      resetOverlay("overlay window without task");
    }
    if (overlayWindow || overlayTask) {
      if (overlayTask?.id !== taskId) {
        log(
          `start-queue-task: overlay active for another task (current=${overlayTask?.id || "none"} requested=${taskId}) window=${describeOverlayWindow()}`
        );
        return { ok: false, reason: "overlay-active" };
      }
    }
    let estimateMinutes = null;
    if (Number.isFinite(payload?.estimatedMinutes)) {
      estimateMinutes = Number(payload.estimatedMinutes);
    }
    if (!estimateMinutes || estimateMinutes <= 0) {
      const estimate = await estimateDuration(taskName, description);
      estimateMinutes = estimate.minutes || 30;
    }
    overlayTask = {
      id: taskId,
      content: taskName,
      description,
      estimatedMinutes: estimateMinutes,
      snoozeCount: 0,
      autoStart: true,
    };
    overlayMode = requestedMode;
    ensureOverlayWindow();
    setOverlayMode(overlayMode);
    startSession(taskId, taskName, overlayMode);
    logUsage("queue_task_start", { task_id: taskId, task_name: taskName, mode: overlayMode });
    return { ok: true };
  } catch (err) {
    log(`start-queue-task failed: ${err}`);
    return { ok: false, reason: "error", error: String(err) };
  }
}

function sendNextTaskPopupPayload(payload) {
  nextTaskPopupPayload = payload;
  if (!nextTaskWindow || nextTaskWindow.isDestroyed()) {
    createNextTaskWindow();
  }
  if (nextTaskWindow && nextTaskWindowReady) {
    nextTaskWindow.webContents.send("next-task-popup-data", payload);
    nextTaskWindow.focus();
  }
}

function scheduleNextTaskAutoStart(payload) {
  clearNextTaskAutoStartTimer();
  const countdownSeconds = Number(payload?.countdownSeconds) || 0;
  if (!payload?.task || countdownSeconds <= 0) return;
  const deadlineAt = Date.now() + countdownSeconds * 1000;
  nextTaskPopupPayload = { ...payload, deadlineAt };
  nextTaskAutoStartTimer = setTimeout(async () => {
    const startPayload = {
      taskId: payload.task.id,
      taskName: payload.task.content,
      description: payload.task.description || "",
      mode: "corner",
      estimatedMinutes: payload.task.estimatedMinutes,
    };
    await startQueueTaskInternal(startPayload);
    closeNextTaskWindow();
  }, countdownSeconds * 1000);
  sendNextTaskPopupPayload(nextTaskPopupPayload);
}

function closeNextTaskWindow() {
  if (nextTaskWindow && !nextTaskWindow.isDestroyed()) {
    nextTaskWindow.close();
  }
  nextTaskWindow = null;
  nextTaskWindowReady = false;
  nextTaskPopupPayload = null;
  clearNextTaskAutoStartTimer();
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function nowDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function startTimeFor(date) {
  if (isWeekend(date)) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), WEEKEND_START_HOUR, 0, 0);
  }
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    WEEKDAY_START_HOUR,
    WEEKDAY_START_MINUTE,
    0
  );
}

function sleepTimeFor(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), SLEEP_HOUR, SLEEP_MINUTE, 0);
}

function roundToInterval(date) {
  const minutes = date.getMinutes();
  const rounded = Math.ceil(minutes / INTERVAL_MINUTES) * INTERVAL_MINUTES;
  const d = new Date(date);
  d.setMinutes(rounded, 0, 0);
  return d;
}

function slotKey(date) {
  return date.getTime();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    log(`Failed to read ${filePath}: ${err}`);
  }
  return fallback;
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    log(`Failed to write ${filePath}: ${err}`);
  }
}

function overlayStatePath() {
  return path.join(DATA_DIR, "overlay_state.json");
}

function lifeBlocksPath() {
  return path.join(DATA_DIR, "life_blocks.json");
}

function cachePath() {
  return path.join(DATA_DIR, "computer_task_cache.json");
}

function timeStatsPath() {
  return path.join(DATA_DIR, "task_time.json");
}

function queueCachePath() {
  return path.join(DATA_DIR, "task_queue_cache.json");
}

function schedulerStatusPath() {
  return path.join(DATA_DIR, "scheduler_status.json");
}

function analyticsPath() {
  return path.join(DATA_DIR, "task_analytics.json");
}

function usagePath() {
  return path.join(DATA_DIR, "usage.json");
}

function loadOverlayState() {
  return readJson(overlayStatePath(), { active_tasks: {}, completed_tasks: [] });
}

function saveOverlayState(state) {
  writeJson(overlayStatePath(), state);
}

function loadLifeBlocks() {
  return readJson(lifeBlocksPath(), { one_off: [], weekly: [] });
}

function saveLifeBlocks(state) {
  writeJson(lifeBlocksPath(), state);
}

function loadCache() {
  return readJson(cachePath(), {});
}

function saveCache(cache) {
  writeJson(cachePath(), cache);
}

function loadTimeStats() {
  return readJson(timeStatsPath(), { tasks: {}, daily: {}, sessions: [] });
}

function saveTimeStats(stats) {
  writeJson(timeStatsPath(), stats);
}

function loadQueueCache() {
  return readJson(queueCachePath(), { updatedAt: null, tasks: [] });
}

function saveQueueCache(tasks) {
  writeJson(queueCachePath(), {
    updatedAt: new Date().toISOString(),
    tasks,
  });
}

function loadSchedulerStatus() {
  return readJson(schedulerStatusPath(), {
    lastRun: null,
    nextRun: null,
    lastError: null,
    notificationCount: 0,
    lastNotificationAt: null,
  });
}

function saveSchedulerStatus() {
  writeJson(schedulerStatusPath(), {
    ...schedulerStatus,
    notificationCount,
    lastNotificationAt,
  });
}

function loadAnalytics() {
  return readJson(analyticsPath(), {
    tasks: {},
    estimates: {},
    daily_stats: {},
  });
}

function saveAnalytics(data) {
  writeJson(analyticsPath(), data);
}

function recordTaskCompletion(taskId, taskName, estimatedMinutes, actualMinutes, completed = true) {
  if (!taskId || !Number.isFinite(estimatedMinutes) || !Number.isFinite(actualMinutes)) return;
  const data = loadAnalytics();
  const today = new Date().toISOString().slice(0, 10);
  const record = {
    timestamp: new Date().toISOString(),
    task_name: taskName || "",
    estimated_minutes: Math.round(estimatedMinutes),
    actual_minutes: Math.round(actualMinutes * 10) / 10,
    completed,
  };

  data.tasks = data.tasks || {};
  data.estimates = data.estimates || {};
  data.daily_stats = data.daily_stats || {};

  data.tasks[taskId] = data.tasks[taskId] || [];
  data.tasks[taskId].push(record);

  if (taskName) {
    data.estimates[taskName] = data.estimates[taskName] || { estimated: [], actual: [] };
    data.estimates[taskName].estimated.push(record.estimated_minutes);
    data.estimates[taskName].actual.push(record.actual_minutes);
  }

  data.daily_stats[today] = data.daily_stats[today] || {
    tasks_completed: 0,
    tasks_partial: 0,
    total_time_minutes: 0,
    accuracy_sum: 0,
    accuracy_count: 0,
  };
  const daily = data.daily_stats[today];
  if (completed) daily.tasks_completed += 1;
  else daily.tasks_partial += 1;
  daily.total_time_minutes += record.actual_minutes;
  if (record.estimated_minutes > 0) {
    const accuracy = Math.min(record.estimated_minutes, record.actual_minutes) /
      Math.max(record.estimated_minutes, record.actual_minutes);
    daily.accuracy_sum += accuracy;
    daily.accuracy_count += 1;
  }

  saveAnalytics(data);
}

function loadUsage() {
  return readJson(usagePath(), { version: 1, events: [] });
}

function saveUsage(usage) {
  writeJson(usagePath(), usage);
}

function logUsage(type, data = {}) {
  const usage = loadUsage();
  usage.events.push({
    type,
    at: new Date().toISOString(),
    ...data,
  });
  if (usage.events.length > 2000) {
    usage.events = usage.events.slice(-2000);
  }
  saveUsage(usage);
}

function dateKeyFor(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function parseDateKey(key) {
  const [year, month, day] = String(key)
    .split("-")
    .map((v) => Number(v));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(year, month - 1, day).getTime();
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sumDaily(stats, sinceMs) {
  const since = startOfDay(sinceMs);
  let total = 0;
  for (const [key, day] of Object.entries(stats.daily || {})) {
    const dayMs = parseDateKey(key);
    if (!Number.isFinite(dayMs)) continue;
    if (dayMs < since) continue;
    total += Number(day.total_seconds || 0);
  }
  return total;
}

function countEvents(events, sinceMs) {
  const counts = {};
  for (const event of events || []) {
    const ts = Date.parse(event.at);
    if (sinceMs && Number.isFinite(ts) && ts < sinceMs) continue;
    counts[event.type] = (counts[event.type] || 0) + 1;
  }
  return counts;
}

function topTasks(stats, limit = 5) {
  const entries = Object.entries(stats.tasks || {}).map(([taskId, data]) => ({
    task_id: taskId,
    task_name: data.task_name || "",
    total_seconds: Number(data.total_seconds || 0),
  }));
  entries.sort((a, b) => b.total_seconds - a.total_seconds);
  return entries.slice(0, limit);
}

function buildUsageDashboard() {
  const stats = loadTimeStats();
  const usage = loadUsage();
  const now = Date.now();
  const seven = now - 7 * 24 * 60 * 60 * 1000;
  const thirty = now - 30 * 24 * 60 * 60 * 1000;
  return {
    time: {
      today_seconds: sumDaily(stats, now),
      last7_seconds: sumDaily(stats, seven),
      last30_seconds: sumDaily(stats, thirty),
    },
    counts: {
      all_time: countEvents(usage.events),
      last7: countEvents(usage.events, seven),
      last30: countEvents(usage.events, thirty),
    },
    top_tasks: topTasks(stats, 5),
    recent_events: (usage.events || []).slice(-50).reverse(),
  };
}

function addDaily(stats, dateKey, taskId, seconds) {
  if (!stats.daily[dateKey]) {
    stats.daily[dateKey] = { total_seconds: 0, tasks: {} };
  }
  stats.daily[dateKey].total_seconds += seconds;
  stats.daily[dateKey].tasks[taskId] =
    (stats.daily[dateKey].tasks[taskId] || 0) + seconds;
}

function recordSession(taskId, startMs, endMs, mode, taskName) {
  if (endMs <= startMs) return;
  const stats = loadTimeStats();
  const totalSeconds = Math.floor((endMs - startMs) / 1000);

  stats.tasks[taskId] = stats.tasks[taskId] || {
    total_seconds: 0,
    task_name: taskName || "",
    last_updated: null,
  };
  stats.tasks[taskId].total_seconds += totalSeconds;
  if (taskName) stats.tasks[taskId].task_name = taskName;
  stats.tasks[taskId].last_updated = new Date(endMs).toISOString();

  let cursor = startMs;
  while (cursor < endMs) {
    const endOfDay = new Date(cursor);
    endOfDay.setHours(23, 59, 59, 999);
    const sliceEnd = Math.min(endMs, endOfDay.getTime() + 1);
    const sliceSeconds = Math.floor((sliceEnd - cursor) / 1000);
    addDaily(stats, dateKeyFor(cursor), taskId, sliceSeconds);
    cursor = sliceEnd;
  }

  stats.sessions.push({
    task_id: taskId,
    task_name: taskName || "",
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    seconds: totalSeconds,
    mode,
  });

  saveTimeStats(stats);
  logUsage("session_stop", {
    task_id: taskId,
    task_name: taskName || "",
    mode,
    seconds: totalSeconds,
  });
}

function startSession(taskId, taskName, mode) {
  if (!taskId) return;
  if (activeSessions.has(taskId)) return;
  activeSessions.set(taskId, {
    start: Date.now(),
    taskName: taskName || "",
    mode: mode || "full",
  });
  playSpotify();
  logUsage("session_start", { task_id: taskId, task_name: taskName || "", mode: mode || "full" });
}

function getActiveSessionSeconds(taskId) {
  const active = activeSessions.get(taskId);
  if (!active?.start) return null;
  return Math.max(0, Math.floor((Date.now() - active.start) / 1000));
}

function stopSession(taskId, fallbackSeconds, modeOverride) {
  if (!taskId) return;
  const active = activeSessions.get(taskId);
  let startMs = active?.start;
  const endMs = Date.now();
  if (!startMs && fallbackSeconds && fallbackSeconds > 0) {
    startMs = endMs - fallbackSeconds * 1000;
  }
  if (!startMs) return;
  const mode = modeOverride || active?.mode || "full";
  const taskName = active?.taskName || "";
  recordSession(taskId, startMs, endMs, mode, taskName);
  activeSessions.delete(taskId);
}

async function todoistFetch(pathname, options = {}) {
  if (!TODOIST_KEY) {
    throw new Error("Missing TODOIST_KEY");
  }
  const res = await fetch(`https://api.todoist.com/api/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TODOIST_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    log(
      `Todoist error ${res.status}: url=${res.url} method=${options.method || "GET"} body=${options.body || ""} response=${text}`
    );
    throw new Error(`Todoist error ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchTasks() {
  const tasks = [];
  let cursor = null;
  do {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const res = await todoistFetch(`/tasks?${params.toString()}`);
    if (Array.isArray(res)) {
      tasks.push(...res);
      cursor = null;
    } else {
      const page = res?.results || [];
      tasks.push(...page);
      cursor = res?.next_cursor || null;
    }
  } while (cursor);
  return tasks;
}

function isDateOnly(task) {
  if (!task.due || !task.due.date || task.due.datetime) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(task.due.date);
}

function getTaskDate(task) {
  if (task.due?.datetime) {
    return new Date(task.due.datetime);
  }
  if (task.due?.date) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(task.due.date)) {
      return new Date(`${task.due.date}T00:00:00`);
    }
    return new Date(task.due.date);
  }
  return null;
}

function isTaskCompleted(task) {
  return task.is_completed || task.completed_at || task.checked;
}

function hasDontChangeTime(task) {
  const labels = task.labels || [];
  return labels.includes("dontchangetime") || labels.includes("#dontchangetime");
}

function normalizeManualDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const rounded = Math.round(minutes / INTERVAL_MINUTES) * INTERVAL_MINUTES;
  const quantized = rounded || minutes;
  return Math.max(1, quantized);
}

function parseDuration(description) {
  // Try JSON format first
  try {
    const parsed = JSON.parse(description || "");
    if (parsed.duration) {
      const match = /(\d{1,3})m/.exec(parsed.duration);
      if (match) {
        const minutes = parseInt(match[1], 10);
        return normalizeManualDuration(minutes);
      }
    }
  } catch {
    // Not JSON, fall back to old format
  }

  // Old plain text format
  const match = /(?:^|\s)(\d{1,3})m\b/.exec(description || "");
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  return normalizeManualDuration(minutes);
}

function getTaskDurationEstimate(task) {
  const parsed = parseDuration(task.description || "");
  if (parsed) return parsed;
  return estimateDurationHeuristic(task.content || "", task.description || "");
}

function parseFixedLength(description) {
  try {
    const parsed = JSON.parse(description || "");
    return parsed.fixed;
  } catch {
    return undefined;
  }
}

const QUICK_KEYWORDS = [
  "check",
  "quick",
  "brief",
  "short",
  "email",
  "text",
  "call",
  "review",
  "confirm",
  "verify",
  "remind",
  "note",
  "list",
];

const MEDIUM_KEYWORDS = [
  "read",
  "watch",
  "install",
  "setup",
  "configure",
  "update",
  "change",
  "cancel",
  "make",
  "create",
  "write",
];

const LONG_KEYWORDS = [
  "build",
  "develop",
  "implement",
  "research",
  "study",
  "learn",
  "clean",
  "organize",
  "project",
  "essay",
];

function estimateDurationHeuristic(task, description) {
  const text = `${task} ${description}`.toLowerCase();
  if (QUICK_KEYWORDS.some((kw) => text.includes(kw))) return 10;
  if (MEDIUM_KEYWORDS.some((kw) => text.includes(kw))) return 25;
  if (LONG_KEYWORDS.some((kw) => text.includes(kw))) return 45;
  return 30;
}

function addDurationToDescription(description, minutes, isFixed = false) {
  // Check if description is already in JSON format with fixed field
  try {
    const parsed = JSON.parse(description || "");
    if (parsed.duration !== undefined) {
      parsed.duration = `${minutes}m`;
      parsed.fixed = isFixed;
      return JSON.stringify(parsed);
    }
  } catch {
    // Not JSON, proceed to create new JSON
  }

  // Create new JSON format
  return JSON.stringify({ duration: `${minutes}m`, fixed: isFixed });
}

async function estimateDuration(task, description) {
  const parsed = parseDuration(description);
  const fixed = parseFixedLength(description);

  if (parsed && fixed !== undefined) {
    return { minutes: parsed, isFixed: fixed, userSpecified: true };
  }

  if (parsed) {
    // Has duration but no fixed classification, need to classify
    const isFixed = await isFixedLengthTask(task, description);
    return { minutes: parsed, isFixed, userSpecified: true };
  }

  const ai = await estimateMinutes(task, description);
  if (ai) {
    const isFixed = await isFixedLengthTask(task, description);
    return { minutes: ai, isFixed, userSpecified: false };
  }

  return { minutes: estimateDurationHeuristic(task, description), isFixed: false, userSpecified: false };
}

async function estimateMinutes(task, description) {
  if (!OPENROUTER_KEY) return null;
  const prompt =
    `Task: ${task}\n` +
    `Description: ${description}\n\n` +
    "Estimate how many minutes this task takes. Reply with ONLY a number.";
  const content = await openrouterChat(
    "You estimate task duration. Reply only with a number.",
    prompt,
    8,
    "latency"
  );
  if (!content) return null;
  const match = content.match(/\d+/);
  if (!match) return null;
  const value = parseInt(match[0], 10);
  if (!Number.isFinite(value)) return null;
  return Math.max(5, Math.min(240, value));
}

async function estimatePriority(task, description) {
  if (!OPENROUTER_KEY) return null;
  const prompt =
    `Task: ${task}\n` +
    `Description: ${description}\n\n` +
    "Decide if this task is urgent or time-sensitive. Reply with ONLY one number: 4 for urgent, 2 for normal.";
  const content = await openrouterChat(
    "You assign Todoist priorities. Prioritize school projects. Reply only with 4 or 2.",
    prompt,
    6,
    "latency"
  );
  if (!content) return null;
  const match = content.match(/\d+/);
  if (!match) return null;
  const value = parseInt(match[0], 10);
  if (value === 2 || value === 4) return value;
  return null;
}

async function isDailyActivity(task, description) {
  if (!OPENROUTER_KEY) return false;
  const prompt =
    `Task: ${task}\n` +
    `Description: ${description}\n\n` +
    "Is this a routine daily activity that should be done every day (like exercise, reading, meditation, etc.)? Reply with ONLY YES or NO.";
  const content = await openrouterChat(
    "You determine if tasks are daily activities. Reply only YES or NO.",
    prompt,
    6,
    "latency"
  );
  if (!content) return false;
  return content.toUpperCase().includes("YES") && !content.toUpperCase().includes("NO");
}

async function isFixedLengthTask(task, description) {
  if (!OPENROUTER_KEY) return false;
  const prompt =
    `Task: ${task}\n` +
    `Description: ${description}\n\n` +
    "Classify this task as 'fixed' or 'variable' length.\n" +
    "FIXED: Clear endpoints like meetings, calls, appointments, exams, watching specific movies, completing forms\n" +
    "VARIABLE: Variable duration like studying, coding practice, open-ended writing, reading book chapters, research, skill practice\n\n" +
    "Reply with ONLY one word: FIXED or VARIABLE.";
  const content = await openrouterChat(
    "You classify task duration type. Reply only FIXED or VARIABLE.",
    prompt,
    6,
    "latency"
  );
  if (!content) return false;
  const upper = content.toUpperCase().trim();
  const isFixed = upper === "FIXED" || (upper.includes("FIXED") && !upper.includes("VARIABLE"));
  log(`isFixedLengthTask: task="${task}" classification=${isFixed ? "FIXED" : "VARIABLE"} (response: "${content}")`);
  return isFixed;
}

async function parseNaturalLanguageDate(text) {
  if (!OPENROUTER_KEY || !text) {
    log(`parseNaturalLanguageDate: skipped (OPENROUTER_KEY=${OPENROUTER_KEY ? "set" : "missing"}, text=${text ? "present" : "empty"}`);
    return null;
  }

  const now = new Date();
  const currentDateStr = now.toISOString().slice(0, 10);
  const currentTimeStr = now.toTimeString().slice(0, 5);

  log(
    `parseNaturalLanguageDate: input="${text}" currentDate=${currentDateStr} currentTime=${currentTimeStr}`
  );

  const dowNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDow = dowNames[now.getDay()];
  const prompt =
    `Current day: ${currentDow}\n` +
    `Current date: ${currentDateStr}\n` +
    `Current time: ${currentTimeStr}\n\n` +
    `Parse this text and extract a specific date/time: "${text}"\n\n` +
    `Rules:\n` +
    `- Days: "saturday", "tomorrow", "monday", "sunday", etc. -> Find the NEXT occurrence of that day\n` +
    `- Times: always use start times: 16:15 (4:15 PM) for weekdays Mon-Fri, 09:00 (9:00 AM) for weekends Sat-Sun\n` +
    `- Examples:\n` +
    `  * "saturday" -> next Saturday at 09:00\n` +
    `  * "tomorrow" -> tomorrow at 16:15 (or 09:00 if tomorrow is weekend)\n` +
    `  * "monday" -> next Monday at 16:15\n` +
    `  * "sunday" -> next Sunday at 09:00\n` +
    `  * "3pm" -> today if time is later, otherwise tomorrow (use appropriate start time)\n` +
    `- NEVER return 00:00:00 or date-only. Always include the time.\n` +
    `- Reply ONLY with ISO 8601 datetime (e.g., 2024-01-15T16:15:00) or 'NONE' if no date\n`;

  const content = await openrouterChat("", prompt, 1000, "latency");

  if (!content) {
    log("parseNaturalLanguageDate: empty response from OpenRouter");
    return null;
  }

  const cleaned = content.trim().toUpperCase();
  if (cleaned === "NONE" || cleaned.includes("NONE")) {
    log(`parseNaturalLanguageDate: OpenRouter returned NONE (raw="${content}")`);
    return null;
  }

  const isoMatch = content.match(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:\d{2})?/);
  if (isoMatch) {
    const value = isoMatch[0];
    log(`parseNaturalLanguageDate: parsed ISO="${value}" from raw="${content}"`);
    return value;
  }

  log(`parseNaturalLanguageDate: no ISO match in response="${content}"`);
  return null;
}

async function openrouterChat(system, prompt, maxTokens, sortBy = "latency") {
  try {
    const startTime = Date.now();
    const res = await fetch(`${OPENROUTER_PROXY.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://todoist-scheduler.local",
        "X-Title": "Todoist Scheduler",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0,
        provider: {
          "name": "OpenAI",
          "allow_fallbacks": false,
        },
      }),
    });
    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    if (!res.ok) {
      const text = await res.text();
      log(
        `OpenRouter error ${res.status}: url=${res.url} latency=${latencyMs}ms response=${text}`
      );
      return null;
    }
    const data = await res.json();

let responseText = data?.choices?.[0]?.message?.content || "";
  
  if (!responseText) {
    const fullDataStr = JSON.stringify(data?.choices?.[0]?.message || {});
    const isoMatches = fullDataStr.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    if (isoMatches) {
      const iso = isoMatches[0];
      responseText = `${iso}:00`;
      log(`parseNaturalLanguageDate: extracted ISO from reasoning field -> "${responseText}"`);
    }
  }
  
  const tokenCount = data?.usage?.completion_tokens || 0;
  const throughput = tokenCount > 0 ? (tokenCount / (latencyMs / 1000)).toFixed(2) : 0;

  log(`OpenRouter timing: latency=${latencyMs}ms tokens=${tokenCount} throughput=${throughput}tok/s sort=${sortBy}`);

  if (!responseText) {
    log(`OpenRouter response missing content: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return responseText || null;
  } catch (err) {
    log(`OpenRouter request failed: ${err}`);
    return null;
  }
}

function speakTask(message) {
  if (!message) return;
  const firstLine = String(message).split("\n")[0];
  if (!firstLine) return;
  const text = `Todo: ${firstLine}`;
  execFile("say", [text], () => {});
}

function playSpotify() {
  try {
    execFileSync("osascript", ["-e", 'tell application "Spotify" to play'], {
      stdio: "ignore",
    });
  } catch (err) {
    try {
      execFileSync("osascript", ["-e", 'tell application "Spotify" to activate'], {
        stdio: "ignore",
      });
      execFileSync("osascript", ["-e", 'tell application "Spotify" to play'], {
        stdio: "ignore",
      });
    } catch (inner) {
      // ignore
    }
  }
}

function safeParseJsonArray(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    // fallthrough
  }
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    return null;
  }
  return null;
}

async function aiOrderQueue(tasks) {
  if (!OPENROUTER_KEY) return null;
  const payload = tasks.map((task) => ({
    id: task.id,
    content: task.content,
    description: task.description || "",
    due: task.due ? task.due.toISOString() : null,
    priority: task.priority || 1,
    duration_minutes: task.duration_minutes || null,
    has_fixed_duration: Boolean(task.duration_minutes),
  }));
  const prompt =
    "Order these tasks for a single day. " +
    "Return ONLY a JSON array of task ids in the recommended order. " +
    "Put fixed-duration tasks earlier in the day and variable tasks later. " +
    "Respect due times and priority where possible.\n\n" +
    JSON.stringify(payload);
  const content = await openrouterChat(
    "You order tasks. Reply only with JSON array of ids.",
    prompt,
    200,
    "throughput"
  );
  const ids = safeParseJsonArray(content);
  if (!ids || ids.length === 0) return null;
  return ids.map((id) => String(id));
}

function priorityRank(priority) {
  const value = Number(priority || 1);
  return Number.isFinite(value) ? value : 1;
}

function sortFixedTasks(tasks, rankMap) {
  return [...tasks].sort((a, b) => {
    const durationDiff = (a.duration_minutes || 0) - (b.duration_minutes || 0);
    if (durationDiff !== 0) return durationDiff;
    const rankDiff = (rankMap?.get(a.id) ?? 1e9) - (rankMap?.get(b.id) ?? 1e9);
    if (rankDiff !== 0) return rankDiff;
    const dueDiff = a.due.getTime() - b.due.getTime();
    if (dueDiff !== 0) return dueDiff;
    return priorityRank(b.priority) - priorityRank(a.priority);
  });
}

function sortVariableTasks(tasks, rankMap) {
  return [...tasks].sort((a, b) => {
    const rankDiff = (rankMap?.get(a.id) ?? 1e9) - (rankMap?.get(b.id) ?? 1e9);
    if (rankDiff !== 0) return rankDiff;
    const dueDiff = a.due.getTime() - b.due.getTime();
    if (dueDiff !== 0) return dueDiff;
    return priorityRank(b.priority) - priorityRank(a.priority);
  });
}

function isFixedTask(task) {
  const fixed = parseFixedLength(task.description || "");
  // Fall back to old behavior if JSON not available
  if (fixed !== undefined) {
    return fixed;
  }
  return Number.isFinite(task.duration_minutes) && task.duration_minutes > 0;
}

function splitByDay(tasks) {
  const now = new Date();
  const today = nowDate();
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const overdue = [];
  const todayTasks = [];
  const upcoming = [];
  tasks.forEach((task) => {
    const dueMs = task.due.getTime();
    if (dueMs < now.getTime()) {
      overdue.push(task);
      return;
    }
    if (dueMs >= today.getTime() && dueMs < todayEnd.getTime()) {
      todayTasks.push(task);
    } else {
      upcoming.push(task);
    }
  });
  return { overdue, today: todayTasks, upcoming };
}

function buildQueueCandidates(tasks, options = {}) {
  const { debug = false, context = "unknown" } = options;
  const total = tasks.length;
  const incomplete = tasks.filter((task) => !isTaskCompleted(task));
  const withDue = incomplete.filter((task) => task.due?.date || task.due?.datetime);
  const mapped = withDue.map((task) => {
    let due = getTaskDate(task);
    if (due && Number.isNaN(due.getTime())) {
      log(
        `buildQueueCandidates: invalid due for taskId=${task.id} due=${JSON.stringify(task.due)}`
      );
      due = null;
    }
    if (due && isDateOnly(task)) {
      due = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59);
    }
    const duration = parseDuration(task.description || "");
    return {
      id: task.id,
      content: task.content,
      description: task.description || "",
      due,
      is_recurring: task.due?.is_recurring || false,
      priority: task.priority,
      duration_minutes: duration,
    };
  });
  const valid = mapped.filter((task) => Boolean(task.due));
  if (debug) {
    const sample = valid.slice(0, 5).map((task) => ({
      id: task.id,
      due: task.due ? task.due.toISOString() : null,
    }));
    log(
      `queue_debug(${context}): total=${total} incomplete=${incomplete.length} with_due=${withDue.length} valid_due=${valid.length} sample=${JSON.stringify(sample)}`
    );
  }
  return valid;
}

async function orderQueueTasks(tasks, options = {}) {
  if (tasks.length === 0) return [];
  const { debug = false, context = "unknown" } = options;
  const aiOrder = await aiOrderQueue(tasks);
  const rankMap = new Map();
  if (aiOrder) {
    aiOrder.forEach((id, index) => rankMap.set(id, index));
  }
  const orderSource = aiOrder ? "ai" : "fallback";
  logUsage("queue_order", { source: orderSource, count: tasks.length });

  const { overdue, today, upcoming } = splitByDay(tasks);
  const sortGroup = (group) => {
    const fixed = group.filter(isFixedTask);
    const variable = group.filter((task) => !isFixedTask(task));
    if (aiOrder) {
      return [...sortFixedTasks(fixed, rankMap), ...sortVariableTasks(variable, rankMap)];
    }
    const fixedFallback = [...fixed].sort((a, b) => {
      const dueDiff = a.due.getTime() - b.due.getTime();
      if (dueDiff !== 0) return dueDiff;
      const durationDiff = (a.duration_minutes || 0) - (b.duration_minutes || 0);
      if (durationDiff !== 0) return durationDiff;
      return priorityRank(b.priority) - priorityRank(a.priority);
    });
    const variableFallback = [...variable].sort((a, b) => {
      const dueDiff = a.due.getTime() - b.due.getTime();
      if (dueDiff !== 0) return dueDiff;
      return priorityRank(b.priority) - priorityRank(a.priority);
    });
    return [...fixedFallback, ...variableFallback];
  };

  const ordered = [...sortGroup(overdue), ...sortGroup(today), ...sortGroup(upcoming)];
  if (debug) {
    log(
      `queue_debug(${context}): order_source=${orderSource} overdue=${overdue.length} today=${today.length} upcoming=${upcoming.length} ordered=${ordered.length}`
    );
  }
  return ordered;
}

function serializeQueueTasks(tasks) {
  return tasks.map((task) => {
    let dueIso = null;
    if (task.due && !Number.isNaN(task.due.getTime())) {
      dueIso = task.due.toISOString();
    } else if (task.due) {
      log(`serializeQueueTasks: invalid due for taskId=${task.id}`);
    }
    return {
      ...task,
      due: dueIso,
    };
  });
}

function normalizeDay(day) {
  return String(day || "").trim().toLowerCase().slice(0, 3);
}

function weekdaySlug(date) {
  return date.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase().slice(0, 3);
}

function parseTime(value) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(value));
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseDate(value) {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function expandBlock(date, start, end) {
  if (end <= start) return [];
  const slots = [];
  let current = new Date(date.getFullYear(), date.getMonth(), date.getDate(), start.hour, start.minute, 0);
  const endDt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), end.hour, end.minute, 0);
  while (current < endDt) {
    slots.push(new Date(current));
    current = new Date(current.getTime() + INTERVAL_MINUTES * 60_000);
  }
  return slots;
}

function blockedSlotsForDate(date, state) {
  const blocks = state || loadLifeBlocks();
  const slots = new Set();
  for (const block of blocks.one_off || []) {
    const blockDate = parseDate(block.date);
    if (!blockDate || blockDate.getTime() !== date.getTime()) continue;
    const start = parseTime(block.start);
    const end = parseTime(block.end);
    if (!start || !end) continue;
    for (const slot of expandBlock(date, start, end)) {
      slots.add(slotKey(slot));
    }
  }

  const todaySlug = weekdaySlug(date);
  for (const block of blocks.weekly || []) {
    const days = (block.days || []).map(normalizeDay);
    if (!days.includes(todaySlug)) continue;
    const start = parseTime(block.start);
    const end = parseTime(block.end);
    if (!start || !end) continue;
    for (const slot of expandBlock(date, start, end)) {
      slots.add(slotKey(slot));
    }
  }

  return slots;
}

function lifeBlockRangesForDate(date, state) {
  const blocks = state || loadLifeBlocks();
  const ranges = [];
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daySlug = weekdaySlug(normalized);

  for (const block of blocks.one_off || []) {
    const blockDate = parseDate(block.date);
    if (!blockDate || blockDate.getTime() !== normalized.getTime()) continue;
    const start = parseTime(block.start);
    const end = parseTime(block.end);
    if (!start || !end) continue;
    const startDt = new Date(normalized);
    startDt.setHours(start.hour, start.minute, 0, 0);
    const endDt = new Date(normalized);
    endDt.setHours(end.hour, end.minute, 0, 0);
    if (endDt <= startDt) continue;
    ranges.push({ start: startDt, end: endDt });
  }

  for (const block of blocks.weekly || []) {
    const days = (block.days || []).map(normalizeDay);
    if (!days.includes(daySlug)) continue;
    const start = parseTime(block.start);
    const end = parseTime(block.end);
    if (!start || !end) continue;
    const startDt = new Date(normalized);
    startDt.setHours(start.hour, start.minute, 0, 0);
    const endDt = new Date(normalized);
    endDt.setHours(end.hour, end.minute, 0, 0);
    if (endDt <= startDt) continue;
    ranges.push({ start: startDt, end: endDt });
  }

  return ranges;
}

class Scheduler {
  constructor() {
    this.tasks = [];
    this.today = nowDate();
    this.blockedSlots = new Set();
    this.recurringSlots = new Set();
    this.lifeBlockCache = new Map();
    this.lifeBlockState = null;
    this.lifeBlockRangesCache = new Map();
  }

  async fetchTasks() {
    this.tasks = await fetchTasks();
    this.tasks = this.tasks.filter((task) => {
      const labels = task.labels || [];
      return !labels.includes("#testnotification");
    });
  }

  async applyAutoPriorities() {
    for (const task of this.tasks) {
      if (task.priority !== 1) continue;
      const newPriority = await estimatePriority(task.content || "", task.description || "");
      if (!newPriority) continue;
      await todoistFetch(`/tasks/${task.id}`, {
        method: "POST",
        body: JSON.stringify({ priority: newPriority }),
      });
      task.priority = newPriority;
    }
  }

  isTimeBlocked(date) {
    if (this.blockedSlots.has(slotKey(date))) return true;
    const life = this.getLifeBlocksForDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    if (life.has(slotKey(date))) return true;
    const start = startTimeFor(date);
    const sleep = sleepTimeFor(date);
    if (date < start || date >= sleep) return true;
    return false;
  }

  buildBlockedTimes() {
    this.blockedSlots = new Set();
    this.recurringSlots = new Set();
    this.lifeBlockCache = new Map();
    const state = this.lifeBlockState || loadLifeBlocks();
    for (const slot of blockedSlotsForDate(this.today, state)) {
      this.blockedSlots.add(slot);
    }

    for (const task of this.tasks) {
      if (isTaskCompleted(task) || hasDontChangeTime(task)) continue;
      if (!task.due || !task.due.date) continue;
      const due = getTaskDate(task);
      if (!due || !isSameDay(due, this.today)) continue;
      const duration =
        parseDuration(task.description || "") ||
        estimateDurationHeuristic(task.content || "", task.description || "");
      const numBlocks = Math.max(1, Math.ceil(duration / INTERVAL_MINUTES));
      for (let i = 0; i < numBlocks; i += 1) {
        const blockTime = new Date(due.getTime() + i * INTERVAL_MINUTES * 60_000);
        this.blockedSlots.add(slotKey(blockTime));
        if (task.due.is_recurring) {
          this.recurringSlots.add(slotKey(blockTime));
        }
      }
    }
  }

  getLifeBlocksForDate(date) {
    const key = date.getTime();
    if (this.lifeBlockCache.has(key)) return this.lifeBlockCache.get(key);
    const state = this.lifeBlockState || loadLifeBlocks();
    const slots = blockedSlotsForDate(date, state);
    this.lifeBlockCache.set(key, slots);
    return slots;
  }

  getLifeBlockRanges(date) {
    const key = startOfDay(date.getTime());
    if (this.lifeBlockRangesCache.has(key)) return this.lifeBlockRangesCache.get(key);
    const ranges = lifeBlockRangesForDate(date, this.lifeBlockState);
    this.lifeBlockRangesCache.set(key, ranges);
    return ranges;
  }

  isTaskBlockedByLifeBlock(task) {
    if (!task.due || !task.due.datetime) return false;
    const due = getTaskDate(task);
    if (!due) return false;
    const ranges = this.getLifeBlockRanges(due);
    if (ranges.length === 0) return false;
    const durationMinutes = getTaskDurationEstimate(task);
    const numBlocks = Math.max(1, Math.ceil(durationMinutes / INTERVAL_MINUTES));
    for (let i = 0; i < numBlocks; i += 1) {
      const slot = new Date(due.getTime() + i * INTERVAL_MINUTES * 60_000);
      for (const range of ranges) {
        if (slot >= range.start && slot < range.end) {
          return true;
        }
      }
    }
    return false;
  }

  async rescheduleOverdueRecurring() {
    const overdue = this.tasks.filter((task) => {
      if (isTaskCompleted(task) || hasDontChangeTime(task)) return false;
      if (!task.due || !task.due.is_recurring) return false;
      const dueDate = getTaskDate(task);
      if (!dueDate) return false;
      return dueDate < this.today;
    });

    for (const task of overdue) {
      await todoistFetch(`/tasks/${task.id}`, {
        method: "POST",
        body: JSON.stringify({ due_string: task.due.string }),
      });
    }
    return overdue.length;
  }

  isSlotAvailable(start, numBlocks) {
    for (let i = 0; i < numBlocks; i += 1) {
      const check = new Date(start.getTime() + i * INTERVAL_MINUTES * 60_000);
      if (this.isTimeBlocked(check)) return false;
      if (this.recurringSlots.has(slotKey(check))) return false;
    }
    return true;
  }

  findAvailableSlot(start, numBlocks) {
    let time = new Date(start);
    for (let i = 0; i < 10000; i += 1) {
      if (this.isSlotAvailable(time, numBlocks)) return time;
      time = new Date(time.getTime() + INTERVAL_MINUTES * 60_000);
    }
    throw new Error("Could not find available time slot");
  }

  findAvailableSlotForDate(start, numBlocks, targetDate) {
    let time = new Date(start);
    for (let i = 0; i < 10000; i += 1) {
      const dateKey = new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
      if (dateKey !== targetDate.getTime()) return null;
      if (this.isSlotAvailable(time, numBlocks)) return time;
      time = new Date(time.getTime() + INTERVAL_MINUTES * 60_000);
    }
    return null;
  }

  blockTimeSlots(start, numBlocks) {
    for (let i = 0; i < numBlocks; i += 1) {
      const blockTime = new Date(start.getTime() + i * INTERVAL_MINUTES * 60_000);
      this.blockedSlots.add(slotKey(blockTime));
    }
  }

  isCurrentSlotValid(task, duration) {
    if (!task.due || !task.due.date) return false;
    const taskDue = getTaskDate(task);
    if (!taskDue || taskDue < this.today) return false;
    const numBlocks = Math.max(1, Math.ceil(duration / INTERVAL_MINUTES));
    for (let i = 0; i < numBlocks; i += 1) {
      const check = new Date(taskDue.getTime() + i * INTERVAL_MINUTES * 60_000);
      if (check >= sleepTimeFor(check) || check < startTimeFor(check)) return false;
      if (this.recurringSlots.has(slotKey(check))) return false;
    }
    return true;
  }

  getBadTasks() {
    const bad = [];
    for (const task of this.tasks) {
      if (isTaskCompleted(task) || hasDontChangeTime(task)) continue;
      if (!task.due) {
        bad.push(task);
        continue;
      }
      if (task.due.is_recurring) continue;
      const taskDue = getTaskDate(task);
      if (!taskDue) {
        bad.push(task);
      } else if (taskDue < this.today) {
        bad.push(task);
      } else if (isSameDay(taskDue, this.today)) {
        if (this.isTaskBlockedByLifeBlock(task)) {
          bad.push(task);
          continue;
        }
        const duration = parseDuration(task.description || "");
        if (duration && this.isCurrentSlotValid(task, duration)) {
          continue;
        }
        if (duration) bad.push(task);
      }
    }
    return bad;
  }

  findGaps(startTime) {
    const endOfDay = sleepTimeFor(this.today);
    const blocked = [...this.blockedSlots]
      .map((ts) => new Date(ts))
      .filter((t) => t.getTime() >= startTime.getTime() && t.getTime() < endOfDay.getTime())
      .sort((a, b) => a - b);

    if (blocked.length === 0) {
      return [[startTime, endOfDay]];
    }

    const gaps = [];
    if (blocked[0] > startTime) {
      gaps.push([startTime, blocked[0]]);
    }

    for (let i = 0; i < blocked.length - 1; i += 1) {
      let currentEnd = blocked[i];
      const nextStart = blocked[i + 1];
      while (this.blockedSlots.has(slotKey(new Date(currentEnd.getTime() + INTERVAL_MINUTES * 60_000)))) {
        currentEnd = new Date(currentEnd.getTime() + INTERVAL_MINUTES * 60_000);
      }
      if (nextStart > new Date(currentEnd.getTime() + INTERVAL_MINUTES * 60_000)) {
        gaps.push([new Date(currentEnd.getTime() + INTERVAL_MINUTES * 60_000), nextStart]);
      }
    }

    let last = blocked[blocked.length - 1];
    while (this.blockedSlots.has(slotKey(new Date(last.getTime() + INTERVAL_MINUTES * 60_000)))) {
      last = new Date(last.getTime() + INTERVAL_MINUTES * 60_000);
    }
    if (new Date(last.getTime() + INTERVAL_MINUTES * 60_000) < endOfDay) {
      gaps.push([new Date(last.getTime() + INTERVAL_MINUTES * 60_000), endOfDay]);
    }
    return gaps;
  }

  findGapForTask(gaps, numBlocks) {
    const required = numBlocks * INTERVAL_MINUTES;
    for (const [gapStart, gapEnd] of gaps) {
      const duration = (gapEnd - gapStart) / 60_000;
      if (duration < required) continue;
      let ok = true;
      for (let i = 0; i < numBlocks; i += 1) {
        const check = new Date(gapStart.getTime() + i * INTERVAL_MINUTES * 60_000);
        if (this.recurringSlots.has(slotKey(check)) || this.isTimeBlocked(check)) {
          ok = false;
          break;
        }
      }
      if (ok) return gapStart;
    }
    return null;
  }

  async scheduleNonRecurringTasks() {
    const badTasks = this.getBadTasks();
    badTasks.sort((a, b) => (b.priority || 1) - (a.priority || 1));

    const now = new Date();
    const minStart = new Date(now.getTime() + 60 * 60_000);
    const minStartRounded = roundToInterval(minStart);
    const nowRounded = roundToInterval(now);
    const startTime = minStartRounded > nowRounded ? minStartRounded : nowRounded;

    const gaps = this.findGaps(startTime);

    for (const task of badTasks) {
      const desc = task.description || "";
      const { minutes, isFixed, userSpecified } = await estimateDuration(task.content || "", desc);
      const numBlocks = Math.max(1, Math.ceil(minutes / INTERVAL_MINUTES));

      let timeSlot = null;
      if (isDateOnly(task)) {
        let targetDate = new Date(task.due.date + "T00:00:00");
        if (!isSameDay(targetDate, this.today)) {
          targetDate = new Date(this.today.getTime());
        }
        timeSlot = this.findGapForTask(gaps, numBlocks);
        if (!timeSlot) {
          timeSlot = this.findAvailableSlotForDate(startTime, numBlocks, targetDate);
        }
        if (!timeSlot) continue;
      } else {
        timeSlot = this.findGapForTask(gaps, numBlocks);
        if (!timeSlot) {
          timeSlot = this.findAvailableSlot(startTime, numBlocks);
        }
      }

      const payload = { due_datetime: timeSlot.toISOString() };
      if (!userSpecified) {
        payload.description = addDurationToDescription(desc, minutes, isFixed);
      }
      await todoistFetch(`/tasks/${task.id}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      this.blockTimeSlots(timeSlot, numBlocks);
    }
  }

  async run() {
    this.today = nowDate();
    this.lifeBlockState = loadLifeBlocks();
    this.lifeBlockRangesCache = new Map();
    await this.fetchTasks();
    await this.applyAutoPriorities();
    this.buildBlockedTimes();
    const rescheduled = await this.rescheduleOverdueRecurring();
    if (rescheduled > 0) {
      await this.fetchTasks();
      this.buildBlockedTimes();
    }
    await this.scheduleNonRecurringTasks();
  }
}

async function classifyComputerTask(taskText, description) {
  const fullText = `${taskText} ${description}`.trim();
  const cache = loadCache();
  const key = taskHash(fullText);
  if (cache[key] !== undefined) return cache[key];

  const lower = fullText.toLowerCase();
  if (COMPUTER_KEYWORDS.some((kw) => lower.includes(kw))) {
    cache[key] = true;
    saveCache(cache);
    return true;
  }
  if (OFFLINE_KEYWORDS.some((kw) => lower.includes(kw))) {
    cache[key] = false;
    saveCache(cache);
    return false;
  }

  const result = await classifyWithAI(fullText);
  cache[key] = result;
  saveCache(cache);
  return result;
}

async function classifyWithAI(taskText) {
  if (!OPENROUTER_KEY) return true;
  const prompt =
    "Is this task done primarily on a computer/phone/digital device, or is it a physical/offline task?\n\n" +
    `Task: "${taskText}"\n\n` +
    'Answer with just ONE word: "COMPUTER" or "OFFLINE".';
  const content = await openrouterChat("Reply only COMPUTER or OFFLINE.", prompt, 10, "latency");
  if (!content) return true;
  const upper = content.toUpperCase();
  return upper.includes("COMPUTER");
}

async function isSleepReason(reason) {
  if (!OPENROUTER_KEY) return isSleepFallback(reason);
  const prompt = `Reason: ${reason}\n\nReply YES if sleep-related, otherwise NO.`;
  const content = await openrouterChat("Reply only YES or NO.", prompt, 6, "latency");
  if (!content) return isSleepFallback(reason);
  const upper = content.toUpperCase();
  return upper.includes("YES") && !upper.includes("NO");
}

function isSleepFallback(reason) {
  const text = reason.toLowerCase();
  return ["sleep", "nap", "tired", "exhausted", "bed", "rest", "asleep", "sleeping"].some((w) =>
    text.includes(w)
  );
}

function nextStartTimestamp() {
  const now = new Date();
  let candidate = startTimeFor(now);
  if (candidate <= now) {
    candidate = startTimeFor(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  }
  return candidate.getTime();
}

function taskHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

async function checkJustification(task, description, justification) {
  if (!OPENROUTER_KEY) return { approved: true, message: "No AI available - snooze approved" };
  const prompt =
    `Task: ${task}\n` +
    `Description: ${description}\n` +
    `User justification: ${justification}\n\n` +
    "Is this a reasonable justification? Reply with ONLY YES or NO.";
  const content = await openrouterChat(
    "You are a productivity assistant. Reply only YES or NO.",
    prompt,
    8,
    "latency"
  );
  if (!content) return { approved: true, message: "AI check failed - snooze approved" };
  const upper = content.toUpperCase();
  const approved = upper.includes("YES") && !upper.includes("NO");
  return {
    approved,
    message: approved ? "AI approved your justification" : "AI rejected: time to start the task",
  };
}

async function notifyTask(task) {
  let priorityText = "";
  if (task.priority === 4) priorityText = " [P1 - Urgent!]";
  else if (task.priority === 3) priorityText = " [P2 - High]";
  else if (task.priority === 2) priorityText = " [P3 - Medium]";

  new Notification({
    title: `Task Due${priorityText}`,
    body: task.description
      ? `${task.content}\n${task.description.slice(0, 100)}`
      : task.content,
  }).show();
  notificationCount += 1;
  lastNotificationAt = new Date().toISOString();
  saveSchedulerStatus();
  speakTask(task.description ? `${task.content}\n${task.description}` : task.content);
  logUsage("notification", {
    task_id: task.id,
    task_name: task.content || "",
    priority: task.priority,
  });
}

async function checkAndNotify() {
  const now = new Date();
  const today = nowDate();
  const state = loadOverlayState();

  if (state.sleep_until && Date.now() < Number(state.sleep_until)) {
    return;
  }
  if (state.sleep_until && Date.now() >= Number(state.sleep_until)) {
    delete state.sleep_until;
    saveOverlayState(state);
  }

  let tasks = [];
  try {
    tasks = await fetchTasks();
  } catch (err) {
    log(`Failed to fetch tasks: ${err}`);
    return;
  }

  for (const task of tasks) {
    if (isTaskCompleted(task)) continue;
    if (!task.due || !task.due.date) continue;

    const taskState = state.active_tasks?.[task.id];
    if (taskState?.snoozed && Date.now() < Number(taskState.snooze_until || 0)) {
      continue;
    }

    const dueDate = getTaskDate(task);
    if (dueDate && now.getTime() - dueDate.getTime() > 5 * 60 * 60_000) {
      const hoursOverdue = Math.round((now.getTime() - dueDate.getTime()) / 60 / 60_000);
      const isDaily = await isDailyActivity(task.content || "", task.description || "");
      
      log(`[OVERDUE_DEBUG] Task: "${task.content}" | ${hoursOverdue}h overdue | isDaily: ${isDaily} | ` +
          `OPENROUTER_KEY: ${OPENROUTER_KEY ? "set" : "missing"} | ` +
          `Content: "${task.content || "empty"}" | Description: "${task.description || "empty"}"`);
      
      if (isDaily) {
        try {
          await todoistFetch(`/tasks/${task.id}/close`, { method: "POST" });
          logUsage("task_auto_complete_overdue", {
            task_id: task.id,
            task_name: task.content || "",
            daily_activity: true,
          });
        } catch (err) {
          log(`Auto-complete overdue task failed: ${err}`);
        }
      } else {
        log(`Skipping auto-complete for non-daily activity: ${task.content}`);
      }
      continue;
    }
    if (!dueDate || !isSameDay(dueDate, today)) continue;

    const minutesUntil = (dueDate.getTime() - now.getTime()) / 60_000;
    if (minutesUntil < -NOTIFICATION_WINDOW_MINUTES || minutesUntil > NOTIFICATION_WINDOW_MINUTES) {
      continue;
    }

    const lastNotified = lastNotificationTime[task.id];
    if (lastNotified && (now.getTime() - lastNotified) / 60_000 < NOTIFICATION_COOLDOWN_MINUTES) {
      continue;
    }

    await notifyTask(task);
    lastNotificationTime[task.id] = now.getTime();

    const isComputer = await classifyComputerTask(task.content || "", task.description || "");
    if (isComputer && !activeOverlays.has(task.id)) {
      const due = getTaskDate(task);
      if (due && (due >= sleepTimeFor(due) || due < startTimeFor(due))) {
        continue;
      }
      if (overlayWindow) return;
      activeOverlays.add(task.id);
      logUsage("overlay_show", { task_id: task.id, task_name: task.content || "" });
      const duration = await estimateDuration(task.content || "", task.description || "");
      overlayTask = {
        id: task.id,
        content: task.content,
        description: task.description || "",
        estimatedMinutes: duration.minutes || 30,
        snoozeCount: 0,
      };
      overlayMode = "full";
      ensureOverlayWindow();
      setOverlayMode("full");
    }
  }
}

async function checkSnoozedTasks() {
  const state = loadOverlayState();
  const now = Date.now();
  if (state.sleep_until && now < Number(state.sleep_until)) {
    return;
  }
  if (state.sleep_until && now >= Number(state.sleep_until)) {
    delete state.sleep_until;
    saveOverlayState(state);
  }
  const active = state.active_tasks || {};
  for (const [taskId, taskData] of Object.entries(active)) {
    if (!taskData.snoozed) continue;
    if (now < Number(taskData.snooze_until || 0)) continue;
    if (overlayWindow) return;
    activeOverlays.add(taskId);
    overlayTask = {
      id: taskId,
      content: taskData.task_name,
      description: taskData.description || "",
      estimatedMinutes: taskData.estimated_duration || 30,
      snoozeCount: taskData.snooze_count || 0,
    };
    overlayMode = taskData.mode || "full";
    ensureOverlayWindow();
    setOverlayMode(overlayMode);
    break;
  }
}

async function checkQueueSuggestion() {
  if (overlayWindow || overlayTask) return;
  const state = loadOverlayState();
  const now = Date.now();
  if (state.sleep_until && now < Number(state.sleep_until)) return;
  if (
    lastQueueSuggestionAt &&
    now - lastQueueSuggestionAt < QUEUE_SUGGESTION_COOLDOWN_MINUTES * 60_000
  ) {
    return;
  }

  let tasks = [];
  try {
    tasks = await fetchTasks();
  } catch (err) {
    log(`Queue suggestion fetch failed: ${err}`);
    return;
  }

  const queueCandidates = buildQueueCandidates(tasks);
  if (queueCandidates.length === 0) return;
  const ordered = await orderQueueTasks(queueCandidates);
  saveQueueCache(serializeQueueTasks(ordered));
  const nextTask = ordered[0];
  if (!nextTask) return;
  if (overlayWindow || overlayTask) return;
  if (
    lastQueueSuggestionTaskId === nextTask.id &&
    lastQueueSuggestionAt &&
    now - lastQueueSuggestionAt < QUEUE_SUGGESTION_COOLDOWN_MINUTES * 60_000
  ) {
    return;
  }

  lastQueueSuggestionAt = now;
  lastQueueSuggestionTaskId = nextTask.id;
  logUsage("queue_suggestion_show", { task_id: nextTask.id, task_name: nextTask.content || "" });

  const duration = await estimateDuration(nextTask.content || "", nextTask.description || "");
  overlayTask = {
    id: nextTask.id,
    content: nextTask.content,
    description: nextTask.description || "",
    estimatedMinutes: duration.minutes || 30,
    snoozeCount: 0,
    suggested: true,
  };
  overlayMode = "full";
  ensureOverlayWindow();
  setOverlayMode("full");
}

function startLoops() {
  const scheduler = new Scheduler();
  schedulerInstance = scheduler;

  const runScheduler = async () => {
    try {
      await scheduler.run();
      schedulerStatus.lastRun = new Date().toISOString();
      schedulerStatus.lastError = null;
      saveSchedulerStatus();
      logUsage("scheduler_run_auto", { ok: true });
    } catch (err) {
      schedulerStatus.lastError = String(err);
      log(`Scheduler error: ${err}`);
      saveSchedulerStatus();
      logUsage("scheduler_run_auto", { ok: false, error: String(err) });
    } finally {
      schedulerStatus.nextRun = new Date(
        Date.now() + SCHEDULER_INTERVAL_MS
      ).toISOString();
      saveSchedulerStatus();
    }
  };

  runScheduler();
  setInterval(runScheduler, SCHEDULER_INTERVAL_MS);

  setInterval(() => {
    checkAndNotify().catch((err) => log(`Notifier error: ${err}`));
    checkSnoozedTasks().catch((err) => log(`Snooze check error: ${err}`));
    checkQueueSuggestion().catch((err) => log(`Queue suggestion error: ${err}`));
  }, CHECK_INTERVAL_MS);
}

ipcMain.handle("get-life-blocks", () => loadLifeBlocks());
ipcMain.handle("save-life-blocks", async (_event, data) => {
  saveLifeBlocks(data);
  logUsage("life_blocks_save", {
    weekly: (data.weekly || []).length,
    one_off: (data.one_off || []).length,
  });

  if (!schedulerInstance) {
    schedulerInstance = new Scheduler();
  }

  try {
    await schedulerInstance.run();
    schedulerStatus.lastRun = new Date().toISOString();
    schedulerStatus.lastError = null;
    saveSchedulerStatus();
    logUsage("life_blocks_scheduler_run", { ok: true });
  } catch (err) {
    log(`Scheduler run after life block save failed: ${err}`);
    schedulerStatus.lastError = String(err);
    saveSchedulerStatus();
    logUsage("life_blocks_scheduler_run", { ok: false, error: String(err) });
  }

  return { ok: true };
});

ipcMain.handle("get-overlay-task", () => {
  const taskId = overlayTask?.id;
  return {
    task: overlayTask,
    mode: overlayMode,
    elapsedSeconds: taskId ? getActiveSessionSeconds(taskId) : null,
    sessionActive: taskId ? activeSessions.has(taskId) : false,
  };
});

ipcMain.handle("set-overlay-mode", (_event, mode) => {
  setOverlayMode(mode);
  logUsage("overlay_mode", { mode });
  return { ok: true };
});

ipcMain.handle("start-quick-task", async (_event, payload) => {
  const taskName = payload?.taskName?.trim();
  const description = payload?.description?.trim() || "";
  const replaceTaskId = payload?.replaceTaskId;
  if (!taskName) return { ok: false };
  let estimateMinutes = null;
  if (Number.isFinite(payload?.estimatedMinutes)) {
    estimateMinutes = Number(payload.estimatedMinutes);
  }
  if (!estimateMinutes || estimateMinutes <= 0) {
    const estimate = await estimateDuration(taskName, description);
    estimateMinutes = estimate.minutes || 30;
  }
  if (replaceTaskId) {
    const state = loadOverlayState();
    if (state.active_tasks?.[replaceTaskId]) delete state.active_tasks[replaceTaskId];
    saveOverlayState(state);
    activeOverlays.delete(replaceTaskId);
  }
  overlayTask = {
    id: `quick-${Date.now()}`,
    content: taskName,
    description,
    estimatedMinutes: estimateMinutes,
    snoozeCount: 0,
    local: true,
  };
  overlayMode = "full";
  ensureOverlayWindow();
  setOverlayMode("full");
  if (quickWindow) {
    quickWindow.close();
  }
  logUsage("quick_task_start", {
    task_name: taskName,
    estimated_minutes: estimateMinutes,
    replaced_task_id: replaceTaskId || "",
  });
  return { ok: true, taskId: overlayTask.id, estimatedMinutes: overlayTask.estimatedMinutes };
});

ipcMain.handle("close-quick-window", () => {
  if (quickWindow) quickWindow.hide();
  return { ok: true };
});

ipcMain.handle("complete-task", async (_event, taskId) => {
  const sessionSeconds = getActiveSessionSeconds(taskId);
  const analyticsTaskName = overlayTask?.id === taskId ? overlayTask.content : "";
  const analyticsEstimate = overlayTask?.id === taskId ? overlayTask.estimatedMinutes : null;
  stopSession(taskId, null, overlayMode);
  logUsage("task_complete", { task_id: taskId, mode: overlayMode });
  let ok = true;
  let error = null;
  const isLocal = overlayTask?.id === taskId && overlayTask?.local;
  if (!isLocal) {
    try {
      await todoistFetch(`/tasks/${taskId}/close`, { method: "POST" });
    } catch (err) {
      log(`Complete task failed: ${err}`);
      ok = false;
      error = String(err);
    }
  }
  if (ok && Number.isFinite(analyticsEstimate) && Number.isFinite(sessionSeconds)) {
    recordTaskCompletion(
      taskId,
      analyticsTaskName,
      analyticsEstimate,
      sessionSeconds / 60,
      true
    );
  }
  const state = loadOverlayState();
  if (state.active_tasks?.[taskId]) delete state.active_tasks[taskId];
  saveOverlayState(state);
  activeOverlays.delete(taskId);
  overlayTask = null;
  if (overlayWindow && overlayMode === "corner") {
    setOverlayMode("completion");
  } else if (overlayWindow) {
    overlayWindow.close();
  }
  return { ok, error };
});

ipcMain.handle("snooze-task", (_event, payload) => {
  const { taskId, taskName, description, mode, elapsedSeconds, estimatedMinutes } = payload;
  stopSession(taskId, elapsedSeconds, mode);
  logUsage("task_snooze", {
    task_id: taskId,
    task_name: taskName || "",
    mode,
    estimated_minutes: estimatedMinutes || 0,
  });
  const state = loadOverlayState();
  state.active_tasks = state.active_tasks || {};
  const prev = state.active_tasks[taskId] || {};
  const snoozeCount = (prev.snooze_count || 0) + 1;
  state.active_tasks[taskId] = {
    task_name: taskName,
    description,
    elapsed_seconds: elapsedSeconds,
    mode,
    last_updated: Date.now(),
    estimated_duration: estimatedMinutes,
    snooze_count: snoozeCount,
    snooze_until: Date.now() + 5 * 60_000,
    snoozed: true,
  };
  saveOverlayState(state);
  activeOverlays.delete(taskId);
  overlayTask = null;
  if (overlayWindow) overlayWindow.close();
  return { ok: true, snoozeCount };
});

ipcMain.handle("defer-task", (_event, payload) => {
  const { taskId, taskName, description, mode, elapsedSeconds, estimatedMinutes } = payload;
  stopSession(taskId, elapsedSeconds, mode);
  logUsage("task_defer", {
    task_id: taskId,
    task_name: taskName || "",
    mode,
    estimated_minutes: estimatedMinutes || 0,
  });
  const state = loadOverlayState();
  state.active_tasks = state.active_tasks || {};
  const prev = state.active_tasks[taskId] || {};
  const snoozeCount = prev.snooze_count || 0;
  state.active_tasks[taskId] = {
    task_name: taskName,
    description,
    elapsed_seconds: elapsedSeconds,
    mode,
    last_updated: Date.now(),
    estimated_duration: estimatedMinutes,
    snooze_count: snoozeCount,
    snooze_until: Date.now() + 5 * 60_000,
    snoozed: true,
  };
  state.sleep_until = Date.now() + 5 * 60_000;
  saveOverlayState(state);
  activeOverlays.delete(taskId);
  overlayTask = null;
  if (overlayWindow) overlayWindow.close();
  return { ok: true, snoozeCount };
});

ipcMain.handle("set-task-duration", async (_event, payload = {}) => {
  const { taskId, minutes, description = "", taskName = "" } = payload || {};
  const normalized = normalizeManualDuration(Number(minutes));
  if (!taskId || !Number.isFinite(normalized) || normalized <= 0) {
    return { ok: false, error: "Invalid duration" };
  }
  try {
    const updatedDescription = addDurationToDescription(description, normalized, true);
    await todoistFetch(`/tasks/${taskId}`, {
      method: "POST",
      body: JSON.stringify({ description: updatedDescription }),
    });
    logUsage("task_duration_manual", {
      task_id: taskId,
      task_name: taskName || "",
      minutes: normalized,
      source: "queue",
    });
    return { ok: true };
  } catch (err) {
    log(`set-task-duration: ${err}`);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("postpone-task", async (_event, payload) => {
  const { taskId, taskName, description, mode, elapsedSeconds, estimatedMinutes, reason } = payload;
  log(
    `postpone-task: start taskId=${taskId} taskName="${taskName || ""}" mode=${mode} reason="${reason || ""}"`
  );
  stopSession(taskId, elapsedSeconds, mode);
  
  // Run sleep detection + date parsing in parallel to reduce UI wait.
  const sleepPromise = isSleepReason(reason);
  const datePromise = reason ? parseNaturalLanguageDate(reason) : Promise.resolve(null);
  const [isSleep, parsedDate] = await Promise.all([sleepPromise, datePromise]);
  log(`postpone-task: isSleep=${isSleep}`);
  
  // Only honor a parsed date if it's not sleep-related.
  let customDueDateTime = null;
  if (!isSleep) {
    customDueDateTime = parsedDate;
    if (customDueDateTime) {
      log(`AI parsed date from "${reason}": ${customDueDateTime}`);
    } else {
      log(`postpone-task: no AI date parsed from reason="${reason}"`);
    }
  }
  
  // If no valid date parsed and not sleep mode, return error
  if (!customDueDateTime && !isSleep) {
    log(`postpone-task: no valid date parsed and not sleep mode`);
    return { ok: false, error: "Please specify when to postpone (e.g., 'tomorrow', '3pm')" };
  }

  // If AI parsed a date or sleep mode, update Todoist or overlay state
  if (customDueDateTime) {
    try {
      const labels = ["dontchangetime"];
      log(
        `postpone-task: updating Todoist due_datetime=${customDueDateTime} labels=${JSON.stringify(labels)}`
      );
      await todoistFetch(`/tasks/${taskId}`, {
        method: "POST",
        body: JSON.stringify({
          due_datetime: customDueDateTime,
          labels: labels,
        }),
      });
      log(`postpone-task: Todoist update success for taskId=${taskId}`);
      logUsage("task_postpone_custom_time", {
        task_id: taskId,
        task_name: taskName || "",
        reason: reason,
        parsed_date: customDueDateTime,
      });
      
      const state = loadOverlayState();
      if (state.active_tasks?.[taskId]) delete state.active_tasks[taskId];
      saveOverlayState(state);
      
      activeOverlays.delete(taskId);
      overlayTask = null;
      if (overlayWindow) overlayWindow.close();
      
      return { ok: true, sleep: false, customPostponed: true, parsedDate: customDueDateTime };
    } catch (err) {
      log(`Failed to postpone task to custom time: ${err}`);
      return { ok: false, error: String(err) };
    }
  }
  
  logUsage("task_postpone", {
    task_id: taskId,
    task_name: taskName || "",
    mode,
    estimated_minutes: estimatedMinutes || 0,
  });
  
  const snoozeUntil = nextStartTimestamp();
  const state = loadOverlayState();
  state.sleep_until = snoozeUntil;
  state.active_tasks = state.active_tasks || {};
  if (state.active_tasks[taskId]) {
    delete state.active_tasks[taskId];
  }
  saveOverlayState(state);
  log(
    `postpone-task: sleep mode until ${new Date(snoozeUntil).toISOString()}`
  );

  activeOverlays.delete(taskId);
  overlayTask = null;
  if (overlayWindow) overlayWindow.close();

  return { ok: true, sleep: true, customPostponed: false };
});

ipcMain.handle("start-task-session", (_event, payload) => {
  const { taskId, taskName, mode } = payload;
  startSession(taskId, taskName, mode);
  return { ok: true };
});

ipcMain.handle("stop-task-session", (_event, payload) => {
  const { taskId, elapsedSeconds, mode } = payload;
  stopSession(taskId, elapsedSeconds, mode);
  return { ok: true };
});

ipcMain.handle("snap-overlay", () => {
  if (!overlayWindow || overlayMode !== "corner") return { ok: false };
  // No-op: keep the user's dragged position.
  return { ok: true };
});

ipcMain.handle("overlay-set-position", (_event, payload) => {
  if (!overlayWindow || overlayMode !== "corner") return { ok: false };
  const x = Number(payload?.x);
  const y = Number(payload?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false };
  log(`overlay-set-position: x=${x} y=${y} bounds=${JSON.stringify(overlayWindow.getBounds())}`);
  overlayWindow.setPosition(Math.round(x), Math.round(y), false);
  log(`overlay-set-position: done bounds=${JSON.stringify(overlayWindow.getBounds())}`);
  return { ok: true };
});

ipcMain.handle("overlay-move-by", (_event, payload) => {
  if (!overlayWindow || overlayMode !== "corner") {
    log(`overlay-move-by: ignored overlayWindow=${Boolean(overlayWindow)} mode=${overlayMode}`);
    return { ok: false };
  }
  const dx = Number(payload?.dx);
  const dy = Number(payload?.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    log(`overlay-move-by: invalid payload=${JSON.stringify(payload)}`);
    return { ok: false };
  }
  const bounds = overlayWindow.getBounds();
  log(
    `overlay-move-by: dx=${dx} dy=${dy} bounds=${JSON.stringify(bounds)} visible=${overlayWindow.isVisible()} focused=${overlayWindow.isFocused()}`
  );
  let nextX = Math.round(bounds.x + dx);
  let nextY = Math.round(bounds.y + dy);
  if (overlayCornerAnchor) {
    const nearX = Math.abs(nextX - overlayCornerAnchor.x) <= OVERLAY_CORNER_SNAP_PX;
    const nearY = Math.abs(nextY - overlayCornerAnchor.y) <= OVERLAY_CORNER_SNAP_PX;
    if (nearX && nearY) {
      nextX = overlayCornerAnchor.x;
      nextY = overlayCornerAnchor.y;
    }
  }
  overlayWindow.setPosition(nextX, nextY, false);
  log(`overlay-move-by: done bounds=${JSON.stringify(overlayWindow.getBounds())}`);
  return { ok: true };
});

ipcMain.handle("overlay-open-next-task-popup", (_, payload) => {
  try {
    if (!payload?.task) {
      clearNextTaskAutoStartTimer();
      sendNextTaskPopupPayload({ empty: true });
      return { ok: true, empty: true };
    }
    scheduleNextTaskAutoStart(payload);
    logUsage("next_task_popup_open", {
      task_id: payload.task.id,
      mode: overlayMode,
    });
    return { ok: true };
  } catch (err) {
    log(`Failed to open next task popup: ${err}`);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("overlay-close-next-task-popup", () => {
  closeNextTaskWindow();
  return { ok: true };
});

ipcMain.handle("next-task-popup-action", async (_event, payload) => {
  if (payload?.action === "start" && nextTaskPopupPayload?.task) {
    clearNextTaskAutoStartTimer();
    const task = nextTaskPopupPayload.task;
    await startQueueTaskInternal({
      taskId: task.id,
      taskName: task.content,
      description: task.description || "",
      mode: "corner",
      estimatedMinutes: task.estimatedMinutes,
    });
    closeNextTaskWindow();
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay-next-task-popup-action", payload);
  }
  logUsage("next_task_popup_action", { action: payload?.action });
  return { ok: true };
});

ipcMain.handle("overlay-corner-completion-popup", (_event, payload) => {
  if (typeof Notification.isSupported === "function" && !Notification.isSupported()) {
    return { ok: false, reason: "notifications-unsupported" };
  }
  const taskName = (payload?.taskName || "").trim();
  if (!taskName) return { ok: false, reason: "missing-task" };
  const elapsedSeconds = Number(payload?.elapsedSeconds) || 0;
  const estimatedMinutes = Number(payload?.estimatedMinutes) || 0;
  const formatDuration = (seconds) => {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins > 0) {
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    return `${secs}s`;
  };
  const details = [];
  if (estimatedMinutes > 0) details.push(`Goal ${estimatedMinutes}m`);
  if (elapsedSeconds > 0) details.push(`Elapsed ${formatDuration(elapsedSeconds)}`);
  const body = details.length
    ? `${taskName} · ${details.join(" · ")}`
    : taskName;
  new Notification({
    title: "Corner timer complete",
    body,
  }).show();
  logUsage("overlay_corner_popup", {
    task_name: taskName,
    elapsed_seconds: elapsedSeconds,
    estimated_minutes: estimatedMinutes,
  });
  return { ok: true };
});

ipcMain.handle("check-justification", async (_event, payload) => {
  const { taskName, description, justification } = payload;
  return checkJustification(taskName, description, justification);
});

ipcMain.handle("run-scheduler-now", async () => {
  try {
    if (!schedulerInstance) {
      schedulerInstance = new Scheduler();
    }
    await schedulerInstance.run();
    schedulerStatus.lastRun = new Date().toISOString();
    saveSchedulerStatus();
    logUsage("scheduler_run_manual", { ok: true });
    return { ok: true };
  } catch (err) {
    log(`Scheduler manual run failed: ${err}`);
    schedulerStatus.lastError = String(err);
    saveSchedulerStatus();
    logUsage("scheduler_run_manual", { ok: false, error: String(err) });
    return { ok: false };
  }
});

ipcMain.handle("get-usage-dashboard", () => buildUsageDashboard());

ipcMain.handle("get-scheduler-status", () => {
  return {
    ...schedulerStatus,
    notificationCount,
    lastNotificationAt,
  };
});

ipcMain.handle("open-task-in-todoist", (_event, taskId) => {
  if (!taskId) return { ok: false };
  const url = `https://todoist.com/showTask?id=${taskId}`;
  shell.openExternal(url);
  logUsage("task_open_todoist", { task_id: taskId });
  return { ok: true };
});

ipcMain.handle("start-queue-task", async (_event, payload) => {
  return startQueueTaskInternal(payload);
});

ipcMain.handle("get-task-queue", async () => {
  try {
    const tasks = await fetchTasks();
    log(`queue_debug(ipc): fetched_tasks=${tasks.length}`);
    const queueCandidates = buildQueueCandidates(tasks, { debug: true, context: "ipc" });
    const ordered = await orderQueueTasks(queueCandidates, { debug: true, context: "ipc" });
    const queue = serializeQueueTasks(ordered);
    saveQueueCache(queue);
    log(`queue_debug(ipc): serialized=${queue.length}`);
    return { ok: true, tasks: queue };
  } catch (err) {
    log(`Failed to fetch task queue: ${err}`);
    return { ok: false, tasks: [] };
  }
});

ipcMain.handle("get-task-queue-cache", () => {
  const cache = loadQueueCache();
  if (!cache?.tasks?.length) {
    return { ok: false, tasks: [], cachedAt: cache?.updatedAt || null };
  }
  return { ok: true, tasks: cache.tasks, cachedAt: cache.updatedAt };
});

ipcMain.handle("legacy-daemon-status", () => {
  return { pids: findLegacyDaemonPids() };
});

ipcMain.handle("stop-legacy-daemon", () => {
  stopLegacyDaemon();
  logUsage("legacy_daemon_stop", { ok: true });
  return { ok: true, pids: findLegacyDaemonPids() };
});

ipcMain.handle("autostart-status", () => autostartStatus());
ipcMain.handle("autostart-enable", () => {
  enableAutostart();
  logUsage("autostart_enable", { ok: true });
  return autostartStatus();
});
ipcMain.handle("autostart-disable", () => {
  disableAutostart();
  logUsage("autostart_disable", { ok: true });
  return autostartStatus();
});

app.whenReady().then(() => {
  if (!IS_E2E) {
    stopLegacyDaemon();
    // Respect the user's autostart toggle; don't auto-enable on launch.
  }
  createMainWindow();
  if (!IS_E2E) {
    createTray();
    const registered = globalShortcut.register("Control+Space", () => {
      if (!quickWindow) createQuickWindow();
      if (quickWindow) {
        const { x, y } = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint({ x, y });
        const workArea = display.workArea;
        const windowWidth = 520;
        const windowHeight = 200;
        quickWindow.setBounds({
          x: Math.floor(workArea.x + (workArea.width - windowWidth) / 2),
          y: Math.floor(workArea.y + (workArea.height - windowHeight) / 2),
          width: windowWidth,
          height: windowHeight
        });
        quickWindow.show();
        quickWindow.focus();
      }
    });
    if (!registered) {
      log("Failed to register Control+Space global shortcut");
    }
    startLoops();
  }
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  for (const taskId of activeSessions.keys()) {
    stopSession(taskId, null, overlayMode);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWindow) {
    createMainWindow();
  }
  mainWindow.show();
});
