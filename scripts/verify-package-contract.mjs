import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const target = mkdtempSync(join(tmpdir(), "frankfmy-package-consumer-"));

try {
  const output = execFileSync("npm", ["pack", "--silent", "--pack-destination", target], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const tarball = join(target, output.split("\n").at(-1));
  writeFileSync(join(target, "package.json"), '{"name":"frankfmy-package-consumer","private":true,"type":"module"}\n');
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], {
    cwd: target,
    stdio: "pipe",
  });
  const packageRoot = join(target, "node_modules", ...sourceManifest.name.split("/"));
  const installed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (
    installed.name !== sourceManifest.name ||
    installed.version !== sourceManifest.version ||
    installed.license !== sourceManifest.license ||
    installed.private === true ||
    !existsSync(join(packageRoot, "LICENSE")) ||
    !existsSync(join(packageRoot, "SECURITY.md"))
  ) {
    throw new Error("installed package metadata contract failed");
  }
  const specs = Object.keys(installed.exports).map((key) =>
    key === "." ? installed.name : `${installed.name}${key.slice(1)}`,
  );
  writeFileSync(
    join(target, "check.mjs"),
    `const specs = ${JSON.stringify(specs)}; for (const spec of specs) await import(spec); console.log("isolated package exports: PASS");\n`,
  );
  execFileSync(process.execPath, [join(target, "check.mjs")], {
    cwd: target,
    stdio: "inherit",
    timeout: 10_000,
  });
  execFileSync("npm", ["ls", "--all"], { cwd: target, stdio: "pipe" });
  execFileSync("npm", ["audit", "--omit=dev", "--audit-level=high"], { cwd: target, stdio: "pipe" });
} finally {
  rmSync(target, { force: true, recursive: true });
}
