import { spawn } from "node:child_process";

export type HttpResponse = { status: number; body: string };

const STATUS_MARKER = "\n__ALLVALUE_HTTP_STATUS__:";

export async function httpPostJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<HttpResponse> {
  const args = [
    "-sS",
    "-X", "POST",
    "--max-time", String(Math.ceil(timeoutMs / 1000)),
    "--data-binary", "@-",
    "-w", `${STATUS_MARKER}%{http_code}`,
  ];
  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }
  args.push(url);

  return new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => { out += c.toString(); });
    child.stderr.on("data", (c) => { err += c.toString(); });
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`curl exited ${code}: ${err.trim() || "(no stderr)"}`));
        return;
      }
      const idx = out.lastIndexOf(STATUS_MARKER);
      if (idx < 0) {
        reject(new Error(`curl output missing status marker: ${out.slice(-200)}`));
        return;
      }
      const status = Number.parseInt(out.slice(idx + STATUS_MARKER.length), 10);
      resolve({ status, body: out.slice(0, idx) });
    });
    child.stdin.end(body);
  });
}
