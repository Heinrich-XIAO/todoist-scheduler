import http from "http";
import { spawn } from "child_process";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const ports = Array.from({ length: 13 }, (_, idx) => 5173 + idx);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probe(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "localhost",
        port,
        path: "/",
        timeout: 500,
      },
      (res) => {
        res.destroy();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForDevServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const port of ports) {
      if (await probe(port)) {
        return port;
      }
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for Vite dev server");
}

const port = await waitForDevServer();
const env = {
  ...process.env,
  VITE_DEV_SERVER_URL: `http://localhost:${port}`,
};

const child = spawn(electronPath, ["."], {
  cwd: repoRoot,
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
