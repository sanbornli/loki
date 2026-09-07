import { createServer } from "node:http";
import { spawn } from "node:child_process";

const port = Number(process.env.LOKI_RECOVERY_PORT ?? 8799);
const token = process.env.LOKI_RECOVERY_ACTION_TOKEN;
if (!token) throw new Error("LOKI_RECOVERY_ACTION_TOKEN is required");

createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/restart-nakama") {
    response.writeHead(404).end();
    return;
  }
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401).end();
    return;
  }
  const child = spawn("railway", ["restart", "--service", "nakama", "--yes"], {
    stdio: "inherit",
  });
  child.once("exit", (code) => {
    response.writeHead(code === 0 ? 200 : 500).end(code === 0 ? "ok" : "failed");
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}/restart-nakama`);
});
