import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

export async function startValidationServer() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (address === null || typeof address === "string") throw new Error("No test port available");
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));

  const cwd = resolve(process.cwd(), "../draft-api");
  const server = spawn(join(cwd, ".venv/bin/python"), [
    "-m", "uvicorn", "examples.app:app", "--host", "127.0.0.1", "--port", String(port),
  ], { cwd, stdio: ["ignore", "ignore", "pipe"] });
  let logs = "";
  server.stderr.on("data", chunk => { logs += String(chunk); });
  await once(server, "spawn");
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (server.exitCode !== null || server.signalCode !== null) return;
    const closed = once(server, "exit");
    server.kill("SIGTERM");
    await closed;
  };
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Draft API failed to start: ${logs}`);
    try {
      const response = await fetch(`${url}/api/catalog`);
      if (response.ok) return { url, stop };
    } catch { /* Wait for the local test server to bind its port. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await stop();
  throw new Error(`Draft API did not become ready: ${logs}`);
}
