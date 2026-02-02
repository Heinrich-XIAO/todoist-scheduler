import {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import dotenv from "dotenv";
import { execFileSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname);

dotenv.config({ path: path.join(repoRoot, ".env.local") });

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
let overlayTask = null;
let overlayMode = "full";
let schedulerInstance = null;
let schedulerStatus = { lastRun: null, nextRun: null, lastError: null };
let notificationCount = 0;
let lastNotificationAt = null;
let tray = null;

let lastNotificationTime = {};
let activeOverlays = new Set();

ensureDir(DATA_DIR);
ensureDir(LOG_DIR);

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
  mainWindow.on("close", (event) => {
    if (app.isQuiting) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: "#0b0b0b",
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.loadURL(`${getAppUrl()}#/overlay`);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
    overlayTask = null;
    overlayMode = "full";
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
      label: "Open Control Center",
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

function setOverlayMode(mode) {
  overlayMode = mode;
  if (!overlayWindow) return;
  if (mode === "corner") {
    overlayWindow.setFullScreen(false);
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
    overlayWindow.setSize(320, 90);
    const { width, height } = overlayWindow.getBounds();
    const display = screen.getPrimaryDisplay();
    const x = Math.round((display.workAreaSize.width - width) / 2);
    const y = Math.round(display.workAreaSize.height - height - 40);
    overlayWindow.setPosition(x, y, false);
  } else {
    overlayWindow.setFullScreen(true);
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
  }
  overlayWindow.webContents.send("overlay-mode", mode);
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

async function todoistFetch(pathname, options = {}) {
  if (!TODOIST_KEY) {
    throw new Error("Missing TODOIST_KEY");
  }
  const res = await fetch(`https://api.todoist.com/rest/v2${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TODOIST_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Todoist error ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchTasks() {
  return todoistFetch("/tasks");
}

function isDateOnly(task) {
  return task.due && task.due.date && !task.due.datetime;
}

function getTaskDate(task) {
  if (task.due?.datetime) {
    return new Date(task.due.datetime);
  }
  if (task.due?.date) {
    return new Date(`${task.due.date}T00:00:00`);
  }
  return null;
}

function isTaskCompleted(task) {
  return task.is_completed || task.completed_at;
}

function hasDontChangeTime(task) {
  const labels = task.labels || [];
  return labels.includes("#dontchangetime");
}

function parseDuration(description) {
  const match = /(?:^|\s)(\d{1,3})m\b/.exec(description || "");
  if (!match) return null;
  return parseInt(match[1], 10);
}

function addDurationToDescription(description, minutes) {
  if (!description) return `${minutes}m`;
  if (/\d{1,3}m\b/.test(description)) return description;
  return `${description.trim()} ${minutes}m`;
}

async function estimateDuration(task, description) {
  const parsed = parseDuration(description);
  if (parsed) return { minutes: parsed, userSpecified: true };
  const ai = await estimateMinutes(task, description);
  if (ai) return { minutes: ai, userSpecified: false };
  return { minutes: 10, userSpecified: false };
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
    8
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
    "You assign Todoist priorities. Reply only with 4 or 2.",
    prompt,
    6
  );
  if (!content) return null;
  const match = content.match(/\d+/);
  if (!match) return null;
  const value = parseInt(match[0], 10);
  if (value === 2 || value === 4) return value;
  return null;
}

async function openrouterChat(system, prompt, maxTokens) {
  try {
    const res = await fetch(`${OPENROUTER_PROXY.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://todoist-scheduler.local",
        "X-Title": "Todoist Scheduler",
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2-5",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    return null;
  }
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

function blockedSlotsForDate(date) {
  const state = loadLifeBlocks();
  const slots = new Set();
  for (const block of state.one_off || []) {
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
  for (const block of state.weekly || []) {
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

class Scheduler {
  constructor() {
    this.tasks = [];
    this.today = nowDate();
    this.blockedSlots = new Set();
    this.recurringSlots = new Set();
    this.lifeBlockCache = new Map();
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
    for (const slot of blockedSlotsForDate(this.today)) {
      this.blockedSlots.add(slot);
    }

    for (const task of this.tasks) {
      if (isTaskCompleted(task) || hasDontChangeTime(task)) continue;
      if (!task.due || !task.due.date) continue;
      const due = getTaskDate(task);
      if (!due || !isSameDay(due, this.today)) continue;
      const duration = parseDuration(task.description || "") || 10;
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
    const slots = blockedSlotsForDate(date);
    this.lifeBlockCache.set(key, slots);
    return slots;
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
      const { minutes, userSpecified } = await estimateDuration(task.content || "", desc);
      const numBlocks = Math.max(1, Math.ceil(minutes / INTERVAL_MINUTES));

      let timeSlot = null;
      if (isDateOnly(task)) {
        const targetDate = new Date(task.due.date + "T00:00:00");
        if (!isSameDay(targetDate, this.today)) continue;
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
        payload.description = addDurationToDescription(desc, minutes);
      }
      await todoistFetch(`/tasks/${task.id}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      this.blockTimeSlots(timeSlot, numBlocks);
    }
  }

  async run() {
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
  const content = await openrouterChat("Reply only COMPUTER or OFFLINE.", prompt, 10);
  if (!content) return true;
  const upper = content.toUpperCase();
  return upper.includes("COMPUTER");
}

async function isSleepReason(reason) {
  if (!OPENROUTER_KEY) return isSleepFallback(reason);
  const prompt = `Reason: ${reason}\n\nReply YES if sleep-related, otherwise NO.`;
  const content = await openrouterChat("Reply only YES or NO.", prompt, 6);
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
    8
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
      if (overlayWindow) return;
      activeOverlays.add(task.id);
      overlayTask = {
        id: task.id,
        content: task.content,
        description: task.description || "",
        estimatedMinutes: parseDuration(task.description || "") || 30,
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

function startLoops() {
  const scheduler = new Scheduler();
  schedulerInstance = scheduler;

  const runScheduler = async () => {
    try {
      await scheduler.run();
      schedulerStatus.lastRun = new Date().toISOString();
      schedulerStatus.lastError = null;
    } catch (err) {
      schedulerStatus.lastError = String(err);
      log(`Scheduler error: ${err}`);
    } finally {
      schedulerStatus.nextRun = new Date(
        Date.now() + SCHEDULER_INTERVAL_MS
      ).toISOString();
    }
  };

  runScheduler();
  setInterval(runScheduler, SCHEDULER_INTERVAL_MS);

  setInterval(() => {
    checkAndNotify().catch((err) => log(`Notifier error: ${err}`));
    checkSnoozedTasks().catch((err) => log(`Snooze check error: ${err}`));
  }, CHECK_INTERVAL_MS);
}

ipcMain.handle("get-life-blocks", () => loadLifeBlocks());
ipcMain.handle("save-life-blocks", (_event, data) => {
  saveLifeBlocks(data);
  return { ok: true };
});

ipcMain.handle("get-overlay-task", () => {
  return { task: overlayTask, mode: overlayMode };
});

ipcMain.handle("set-overlay-mode", (_event, mode) => {
  setOverlayMode(mode);
  return { ok: true };
});

ipcMain.handle("complete-task", async (_event, taskId) => {
  try {
    await todoistFetch(`/tasks/${taskId}/close`, { method: "POST" });
  } catch (err) {
    log(`Complete task failed: ${err}`);
  }
  const state = loadOverlayState();
  if (state.active_tasks?.[taskId]) delete state.active_tasks[taskId];
  saveOverlayState(state);
  activeOverlays.delete(taskId);
  overlayTask = null;
  if (overlayWindow) overlayWindow.close();
  return { ok: true };
});

ipcMain.handle("snooze-task", (_event, payload) => {
  const { taskId, taskName, description, mode, elapsedSeconds, estimatedMinutes } = payload;
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

ipcMain.handle("postpone-task", async (_event, payload) => {
  const { taskId, taskName, description, mode, elapsedSeconds, estimatedMinutes, reason } = payload;
  const isSleep = await isSleepReason(reason);
  const state = loadOverlayState();
  state.active_tasks = state.active_tasks || {};
  const snoozeUntil = isSleep ? nextStartTimestamp() : Date.now() + 30 * 60_000;
  state.active_tasks[taskId] = {
    task_name: taskName,
    description,
    elapsed_seconds: elapsedSeconds,
    mode,
    last_updated: Date.now(),
    estimated_duration: estimatedMinutes,
    snooze_count: 0,
    snooze_until: snoozeUntil,
    snoozed: true,
  };
  if (isSleep) {
    state.sleep_until = snoozeUntil;
  }
  saveOverlayState(state);

  activeOverlays.delete(taskId);
  overlayTask = null;
  if (overlayWindow) overlayWindow.close();

  if (!isSleep) {
    setTimeout(() => {
      checkAndNotify().catch((err) => log(`Notifier error: ${err}`));
    }, 1000);
  }
  return { ok: true, sleep: isSleep };
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
    return { ok: true };
  } catch (err) {
    log(`Scheduler manual run failed: ${err}`);
    schedulerStatus.lastError = String(err);
    return { ok: false };
  }
});

ipcMain.handle("get-scheduler-status", () => {
  return {
    ...schedulerStatus,
    notificationCount,
    lastNotificationAt,
  };
});

ipcMain.handle("legacy-daemon-status", () => {
  return { pids: findLegacyDaemonPids() };
});

ipcMain.handle("stop-legacy-daemon", () => {
  stopLegacyDaemon();
  return { ok: true, pids: findLegacyDaemonPids() };
});

ipcMain.handle("autostart-status", () => autostartStatus());
ipcMain.handle("autostart-enable", () => {
  enableAutostart();
  return autostartStatus();
});
ipcMain.handle("autostart-disable", () => {
  disableAutostart();
  return autostartStatus();
});

app.whenReady().then(() => {
  stopLegacyDaemon();
  enableAutostart();
  createMainWindow();
  createTray();
  startLoops();
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
