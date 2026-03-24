import { spawn } from "child_process";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Python sandbox for code execution.
 * Each execution spawns a fresh Python process with a temp script file.
 * Using file-based execution avoids shell escaping issues and SRE module
 * mismatch errors that can occur with `python3 -c` on some environments.
 */

type SandboxSession = {
  conversationId: number;
  lastUsed: number;
};

const sessions = new Map<number, SandboxSession>();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  const keysToDelete: number[] = [];
  sessions.forEach((session, convId) => {
    if (now - session.lastUsed > SESSION_TIMEOUT_MS) {
      keysToDelete.push(convId);
    }
  });
  keysToDelete.forEach((k) => sessions.delete(k));
}, 60 * 1000);

export type SandboxResult = {
  stdout: string;
  stderr: string;
  images: string[];
  executionTimeMs: number;
};

/**
 * Build the wrapper script that captures stdout, stderr, and matplotlib images.
 */
function buildWrapperScript(userCode: string): string {
  // Escape the user code for embedding in a Python string
  const escapedCode = JSON.stringify(userCode);

  return `# -*- coding: utf-8 -*-
import sys, io, json, base64, traceback, os

_stdout = io.StringIO()
_stderr = io.StringIO()
_images = []

try:
    old_stdout, old_stderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = _stdout, _stderr

    # Patch matplotlib if available
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        def _capture_show(*args, **kwargs):
            for i in plt.get_fignums():
                buf = io.BytesIO()
                plt.figure(i).savefig(buf, format='png', dpi=150, bbox_inches='tight')
                buf.seek(0)
                _images.append(base64.b64encode(buf.getvalue()).decode('utf-8'))
            plt.close('all')
        plt.show = _capture_show
    except ImportError:
        pass

    _user_code = ${escapedCode}
    _globals = {"__builtins__": __builtins__, "__name__": "__main__"}
    exec(compile(_user_code, "<sandbox>", "exec"), _globals)

    # Capture any remaining matplotlib figures
    try:
        import matplotlib.pyplot as plt
        if plt.get_fignums():
            for i in plt.get_fignums():
                buf = io.BytesIO()
                plt.figure(i).savefig(buf, format='png', dpi=150, bbox_inches='tight')
                buf.seek(0)
                _images.append(base64.b64encode(buf.getvalue()).decode('utf-8'))
            plt.close('all')
    except Exception:
        pass

except Exception:
    _stderr.write(traceback.format_exc())
finally:
    sys.stdout, sys.stderr = old_stdout, old_stderr

_result = {
    "stdout": _stdout.getvalue(),
    "stderr": _stderr.getvalue(),
    "images": _images
}
print("__SANDBOX_RESULT__" + json.dumps(_result))
`;
}

/**
 * Execute Python code in a sandbox environment.
 * Writes code to a temp file and runs it, avoiding shell escaping issues.
 */
export async function executePython(
  conversationId: number,
  code: string
): Promise<SandboxResult> {
  const startTime = Date.now();

  sessions.set(conversationId, {
    conversationId,
    lastUsed: Date.now(),
  });

  // Write the wrapper script to a temp file
  let tmpDir: string;
  let scriptPath: string;

  try {
    tmpDir = await mkdtemp(join(tmpdir(), "sandbox-"));
    scriptPath = join(tmpDir, "script.py");
    await writeFile(scriptPath, buildWrapperScript(code), "utf-8");
  } catch (err) {
    return {
      stdout: "",
      stderr: `Failed to create sandbox script: ${err instanceof Error ? err.message : String(err)}`,
      images: [],
      executionTimeMs: Date.now() - startTime,
    };
  }

  return new Promise<SandboxResult>((resolve) => {
    const proc = spawn("python3", [scriptPath], {
      timeout: 30000,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONDONTWRITEBYTECODE: "1",
      },
      cwd: tmpDir,
    });

    let output = "";
    let errorOutput = "";

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    proc.on("close", async () => {
      const executionTimeMs = Date.now() - startTime;

      // Clean up temp files
      try {
        await unlink(scriptPath);
        const { rmdir } = await import("fs/promises");
        await rmdir(tmpDir);
      } catch {
        // Best effort cleanup
      }

      // Try to parse the structured result
      const marker = "__SANDBOX_RESULT__";
      const markerIdx = output.indexOf(marker);

      if (markerIdx !== -1) {
        try {
          const jsonStr = output.substring(markerIdx + marker.length).trim();
          const result = JSON.parse(jsonStr);
          resolve({
            stdout: result.stdout || "",
            stderr: result.stderr || errorOutput,
            images: result.images || [],
            executionTimeMs,
          });
          return;
        } catch {
          // Fall through
        }
      }

      // Fallback: return raw output
      resolve({
        stdout: output,
        stderr: errorOutput,
        images: [],
        executionTimeMs,
      });
    });

    proc.on("error", (err) => {
      resolve({
        stdout: "",
        stderr: `Execution error: ${err.message}`,
        images: [],
        executionTimeMs: Date.now() - startTime,
      });
    });
  });
}
