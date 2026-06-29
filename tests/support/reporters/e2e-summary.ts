import fs from "node:fs";
import path from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

const ROOT = path.resolve(import.meta.dirname, "../../..");

type Row = {
  module: string;
  title: string;
  status: string;
  error?: string;
  stack?: string;
  duration: number;
  screenshot?: string;
  video?: string;
  trace?: string;
};

class E2eSummaryReporter implements Reporter {
  private results: Row[] = [];
  private startedAt = Date.now();

  onTestEnd(test: TestCase, result: TestResult) {
    const parts = test.location.file.split(/[/\\]/);
    const testsIdx = parts.indexOf("tests");
    const module = testsIdx >= 0 && parts[testsIdx + 1] ? parts[testsIdx + 1] : "general";
    const screenshot = result.attachments.find((a) => a.name === "screenshot")?.path;
    const video = result.attachments.find((a) => a.name === "video")?.path;
    const trace = result.attachments.find((a) => a.name?.includes("trace"))?.path;
    this.results.push({
      module,
      title: test.title,
      status: result.status,
      error: result.error?.message,
      stack: result.error?.stack,
      duration: result.duration,
      screenshot,
      video,
      trace,
    });
  }

  onEnd(result: FullResult) {
    const outDir = path.join(ROOT, "tests", "reports");
    fs.mkdirSync(outDir, { recursive: true });
    const failuresDir = path.join(outDir, "failures");
    fs.mkdirSync(failuresDir, { recursive: true });

    const byModule = new Map<string, Row[]>();
    for (const r of this.results) {
      const list = byModule.get(r.module) ?? [];
      list.push(r);
      byModule.set(r.module, list);
    }

    const failed = this.results.filter((t) => t.status === "failed" || t.status === "timedOut");
    const lines: string[] = [
      `# Informe E2E WalTech`,
      ``,
      `Fecha: ${new Date().toISOString()}`,
      `Estado global: **${result.status}**`,
      `Duración total: ${(result.duration / 1000).toFixed(1)}s`,
      `Tests: ${this.results.length} | OK: ${this.results.filter((t) => t.status === "passed").length} | Fallos: ${failed.length}`,
      ``,
    ];

    if (failed.length > 0) {
      lines.push(`## Fallos detectados`, ``);
      for (const t of failed) {
        const slug = `${t.module}-${t.title}`.replace(/[^\w.-]+/g, "_").slice(0, 80);
        const failLog = [
          `Módulo: ${t.module}`,
          `Test: ${t.title}`,
          `Error: ${t.error ?? "timeout"}`,
          t.stack ? `Stack:\n${t.stack}` : "",
          t.screenshot ? `Screenshot: ${t.screenshot}` : "",
          t.video ? `Video: ${t.video}` : "",
          t.trace ? `Trace: ${t.trace}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        fs.writeFileSync(path.join(failuresDir, `${slug}.log`), failLog, "utf8");
        lines.push(`### [${t.module}] ${t.title}`);
        lines.push(`- Error: ${(t.error ?? "timeout").split("\n")[0]}`);
        if (t.screenshot) lines.push(`- Screenshot: \`${t.screenshot}\``);
        if (t.video) lines.push(`- Video: \`${t.video}\``);
        lines.push("");
      }
    }

    for (const [mod, tests] of byModule) {
      const passed = tests.filter((t) => t.status === "passed").length;
      const modFailed = tests.filter((t) => t.status === "failed" || t.status === "timedOut").length;
      lines.push(`## ${mod} (${passed} OK / ${modFailed} fallos)`);
      for (const t of tests) {
        lines.push(`- [${t.status}] ${t.title} (${(t.duration / 1000).toFixed(1)}s)`);
        if (t.error) lines.push(`  - Error: ${t.error.split("\n")[0]}`);
      }
      lines.push("");
    }

    fs.writeFileSync(path.join(outDir, "INFORME-E2E.md"), lines.join("\n"), "utf8");
    fs.writeFileSync(
      path.join(outDir, "run-meta.json"),
      JSON.stringify(
        {
          finishedAt: new Date().toISOString(),
          durationMs: result.duration,
          startedAt: new Date(this.startedAt).toISOString(),
          status: result.status,
          total: this.results.length,
          passed: this.results.filter((t) => t.status === "passed").length,
          failed: failed.length,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

export default function e2eSummaryReporter(_config: FullConfig): Reporter {
  return new E2eSummaryReporter();
}
