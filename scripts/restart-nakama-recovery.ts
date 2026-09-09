import { createServer } from "node:http";
import { spawn } from "node:child_process";

const port = Number(process.env.LOKI_RECOVERY_PORT ?? 8799);
const token = process.env.LOKI_RECOVERY_ACTION_TOKEN;
if (!token) throw new Error("LOKI_RECOVERY_ACTION_TOKEN is required");

const log = (message: string): void => {
  console.error(`${new Date().toISOString()} ${message}`);
};

createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/restart-nakama") {
    response.writeHead(404).end();
    return;
  }
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401).end();
    return;
  }
  log("restart requested");
  const chunks: Buffer[] = [];
  const child = spawn(
    "railway",
    ["restart", "--service", "nakama", "--yes", "--json"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let settled = false;
  const finish = (code: number | null) => {
    if (settled) return;
    settled = true;
    const output = Buffer.concat(chunks).toString("utf8").trim().slice(0, 1_000);
    log(`railway restart exit=${code ?? "null"} ${output}`);
    const ok = code === 0;
    response.writeHead(ok ? 200 : 500).end(ok ? "ok" : output || "failed");
  };
  const timer = setTimeout(() => {
    log("railway restart timed out");
    child.kill("SIGTERM");
    finish(1);
  }, 120_000);
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.once("exit", (code) => {
    clearTimeout(timer);
    finish(code);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}/restart-nakama`);
});
