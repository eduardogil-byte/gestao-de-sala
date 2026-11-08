import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

export const chromePath = process.env.SALAGEST_TEST_CHROME ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

// Uses the installed browser and synthetic HTTP responses; no API or SQL Server.
export async function openAdminFixture(fixture = "adminCritical") {
  const profile = await mkdtemp(join(tmpdir(), "salagest-admin-tests-"));
  const server = await createServer({ configFile: false, cacheDir: join(profile, "vite-cache"),
    optimizeDeps: { entries: [`tests/fixtures/${fixture}.tsx`] },
    server: { host: "127.0.0.1", port: 0, hmr: false },
    plugins: [{ name: "admin-test-fixture", configureServer(vite) {
      vite.middlewares.use("/__admin-test", async (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml("/__admin-test", `<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/tests/fixtures/${fixture}.tsx"></script></body></html>`));
      });
    } }] });
  await server.listen();
  const browser = spawn(chromePath!, ["--headless=new", "--no-sandbox", "--no-first-run", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true });
  let socket: WebSocket | undefined;
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chrome did not expose DevTools")), 15000);
      let output = "";
      browser.stderr.on("data", (chunk) => {
        output += String(chunk);
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      browser.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    const address = new URL(endpoint);
    const page = await fetch(`http://${address.host}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json()) as { webSocketDebuggerUrl: string };
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(new Error("DevTools connection failed")); });
    let id = 0;
    const pending = new Map<number, { resolve: (result: any) => void; reject: (reason: unknown) => void }>();
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
    };
    const command = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
      const call = ++id;
      const timer = setTimeout(() => { pending.delete(call); reject(new Error(`DevTools timed out: ${method}`)); }, 15000);
      pending.set(call, { resolve: (result) => { clearTimeout(timer); resolve(result); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      socket!.send(JSON.stringify({ id: call, method, params }));
    });
    const evaluate = async <T = unknown>(expression: string): Promise<T> => {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value as T;
    };
    const waitFor = async (expression: string, timeout = 10000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        if (await evaluate<boolean>(expression)) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Condition not met: ${expression}\n${await evaluate("document.body.innerText")}`);
    };
    await command("Page.navigate", { url: `${server.resolvedUrls!.local[0]}__admin-test` });
    await waitFor("!!window.adminTest", 30000);
    return { evaluate, waitFor, command, close: async () => {
      await command("Browser.close").catch(() => {});
      socket?.close(); browser.kill(); await server.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    } };
  } catch (error) {
    socket?.close(); browser.kill(); await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    throw error;
  }
}
