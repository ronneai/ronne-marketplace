import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";

it("survives a closed stdout: a script piped into `grep -q` writes on and exits 0", () => {
  // A child that writes 100,000 lines through writeTo while `head -1` closes the pipe after one.
  const output = join(import.meta.dirname, "output.ts");
  const script = `import { writeTo } from ${JSON.stringify(output)};
for (let i = 0; i < 100000; i++) writeTo(process.stdout, "line " + i + "\\n");
writeTo(process.stderr, "done\\n");`;
  const result = spawnSync(
    "sh",
    ["-c", `node --import tsx -e '${script.replaceAll("'", "'\\''")}' | head -1`],
    { encoding: "utf8", cwd: join(import.meta.dirname, "../../..") },
  );
  expect(result.stdout).toBe("line 0\n");
  expect(result.stderr).toContain("done");
  expect(result.stderr).not.toContain("EPIPE");
});
