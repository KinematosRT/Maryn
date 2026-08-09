import type { Sandbox, Execution } from "@e2b/code-interpreter";

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export class E2BSandbox {
  private sandbox: Sandbox | null = null;
  private SandboxClass: (typeof import("@e2b/code-interpreter"))["Sandbox"] | null = null;

  constructor(private readonly apiKey?: string) {}

  get isAvailable(): boolean {
    return !!(this.apiKey || process.env.E2B_API_KEY);
  }

  private async ensure(): Promise<Sandbox> {
    if (!this.isAvailable) {
      throw new Error(
        "E2B sandbox unavailable: set E2B_API_KEY to enable sandboxed execution. " +
        "Context memory tools work without it."
      );
    }
    if (!this.sandbox) {
      if (!this.SandboxClass) {
        try {
          const mod = await import("@e2b/code-interpreter");
          this.SandboxClass = mod.Sandbox;
        } catch {
          throw new Error(
            "E2B SDK not installed or failed to load. Install with: npm install @e2b/code-interpreter"
          );
        }
      }
      this.sandbox = await this.SandboxClass.create({
        apiKey: this.apiKey || process.env.E2B_API_KEY,
      });
    }
    return this.sandbox;
  }

  async execute(
    code: string,
    language: "python" | "javascript" | "shell" = "python",
    timeoutMs = 30_000,
  ): Promise<SandboxResult> {
    const sb = await this.ensure();

    if (language === "shell") {
      const cmd = await sb.commands.run(code, { timeoutMs });
      return {
        stdout: cmd.stdout,
        stderr: cmd.stderr,
        exitCode: cmd.exitCode,
        error: cmd.error,
      };
    }

    const exec: Execution = await sb.runCode(code, { language, timeoutMs });
    return {
      stdout: exec.logs.stdout.join("\n"),
      stderr: exec.logs.stderr.join("\n"),
      exitCode: exec.error ? 1 : 0,
      error: exec.error
        ? `${exec.error.name}: ${exec.error.value}`
        : undefined,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    const sb = await this.ensure();
    await sb.files.write(path, content);
  }

  async readFile(path: string): Promise<string> {
    const sb = await this.ensure();
    return await sb.files.read(path);
  }

  async stop(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }

  get isRunning(): boolean {
    return this.sandbox !== null;
  }
}
