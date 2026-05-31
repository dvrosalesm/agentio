import { mkdirSync, unlinkSync } from "node:fs";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { dirname } from "node:path";
import type { RunRequest, RunResponse, ToolHandler } from "./types.js";

export type ToolListen =
  | { kind: "unix"; path: string }
  | { kind: "tcp"; host?: string };

export type ToolEndpoint =
  | { kind: "unix"; path: string }
  | { kind: "tcp"; host: string; port: number };

export class ToolHost {
  private readonly actions = new Map<string, ToolHandler>();
  private server: Server | null = null;
  private readonly listen: ToolListen;

  /** Set after start() for TCP listeners. */
  endpoint: ToolEndpoint | null = null;

  /** @deprecated use endpoint — unix path when listening on a socket file */
  get socketPath(): string {
    if (this.listen.kind === "unix") return this.listen.path;
    if (this.endpoint?.kind === "unix") return this.endpoint.path;
    throw new Error("ToolHost is not using a unix socket");
  }

  constructor(listen: ToolListen = { kind: "tcp" }) {
    this.listen = listen;
  }

  register(name: string, handler: ToolHandler): void {
    this.actions.set(name, handler);
  }

  async start(): Promise<ToolEndpoint> {
    if (this.server && this.endpoint) return this.endpoint;

    if (this.listen.kind === "unix") {
      const path = this.listen.path;
      mkdirSync(dirname(path), { recursive: true });
      try {
        unlinkSync(path);
      } catch {
        /* absent */
      }
      await new Promise<void>((resolve, reject) => {
        const srv = createServer((socket) => this.handleConnection(socket));
        srv.on("error", reject);
        srv.listen(path, () => {
          this.server = srv;
          this.endpoint = { kind: "unix", path };
          resolve();
        });
      });
      return this.endpoint!;
    }

    const host = this.listen.host ?? "127.0.0.1";
    await new Promise<void>((resolve, reject) => {
      const srv = createServer((socket) => this.handleConnection(socket));
      srv.on("error", reject);
      srv.listen(0, host, () => {
        const addr = srv.address();
        const port =
          typeof addr === "object" && addr && "port" in addr ? addr.port : 0;
        if (!port) {
          reject(new Error("ToolHost failed to bind TCP port"));
          return;
        }
        this.server = srv;
        this.endpoint = { kind: "tcp", host, port };
        resolve();
      });
    });
    return this.endpoint!;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const endpoint = this.endpoint;
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    this.server = null;
    this.endpoint = null;
    if (endpoint?.kind === "unix") {
      try {
        unlinkSync(endpoint.path);
      } catch {
        /* */
      }
    }
  }

  private handleConnection(socket: Socket): void {
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buf += chunk;
      const line = buf.split("\n")[0];
      if (!line?.trim() || !buf.includes("\n")) return;
      buf = buf.slice(line.length + 1);
      void (async () => {
        try {
          const req = JSON.parse(line) as RunRequest;
          const handler = this.actions.get(req.action);
          if (!handler) {
            this.reply(socket, { ok: false, error: `Unknown tool: ${req.action}` });
          } else {
            try {
              const result = await handler(req.args ?? {}, {
                taskId: req.taskId,
              });
              this.reply(socket, { ok: true, result });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              this.reply(socket, { ok: false, error: message });
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.reply(socket, { ok: false, error: message });
        }
        socket.end();
      })();
    });
  }

  private reply(socket: Socket, body: RunResponse): void {
    if (socket.destroyed) return;
    socket.write(`${JSON.stringify(body)}\n`);
  }
}

function connectEndpoint(endpoint: ToolEndpoint): Socket {
  if (endpoint.kind === "unix") {
    return createConnection(endpoint.path);
  }
  return createConnection({ host: endpoint.host, port: endpoint.port });
}

/** @deprecated pass a ToolEndpoint instead of a socket path string */
export function invokeTool(
  target: string | ToolEndpoint,
  request: RunRequest,
  timeoutMs = 120_000,
): Promise<RunResponse> {
  const endpoint: ToolEndpoint =
    typeof target === "string"
      ? { kind: "unix", path: target }
      : target;
  return new Promise((resolve, reject) => {
    const socket = connectEndpoint(endpoint);
    let buf = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Tool timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.setEncoding("utf8");
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      buf += chunk;
      const line = buf.split("\n")[0];
      if (!line?.trim() || !buf.includes("\n")) return;
      clearTimeout(timer);
      try {
        resolve(JSON.parse(line) as RunResponse);
      } catch (err) {
        reject(err);
      }
      socket.end();
    });
  });
}
