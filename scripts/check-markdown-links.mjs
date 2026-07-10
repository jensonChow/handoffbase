#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const trackedMarkdown = execFileSync("git", ["ls-files", "-z", "--", "*.md"], {
  cwd: rootDir,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const failures = [];
let checkedLinks = 0;

for (const relativeFile of trackedMarkdown) {
  const absoluteFile = path.join(rootDir, relativeFile);
  const markdown = withoutFencedCode(readFileSync(absoluteFile, "utf8"));
  const targets = [
    ...markdown.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g),
    ...markdown.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm),
  ].map((match) => match[1]);

  for (const rawTarget of targets) {
    const target = normalizeTarget(rawTarget);
    if (!target || isNonRelativeTarget(target)) {
      continue;
    }

    checkedLinks += 1;
    const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
    if (!withoutFragment) {
      continue;
    }

    let decoded;
    try {
      decoded = decodeURIComponent(withoutFragment);
    } catch {
      failures.push(`${relativeFile}: invalid URL encoding in ${target}`);
      continue;
    }

    const resolved = path.resolve(path.dirname(absoluteFile), decoded);
    if (!isInsideRepo(resolved) || !existsSync(resolved)) {
      failures.push(`${relativeFile}: missing relative target ${target}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Markdown relative-link check: FAIL (${failures.length} broken links)\n`);
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Markdown relative-link check: PASS (${trackedMarkdown.length} tracked Markdown files, ${checkedLinks} relative links).\n`,
  );
}

function withoutFencedCode(markdown) {
  return markdown.replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, "");
}

function normalizeTarget(rawTarget) {
  return rawTarget.startsWith("<") && rawTarget.endsWith(">")
    ? rawTarget.slice(1, -1)
    : rawTarget;
}

function isNonRelativeTarget(target) {
  return (
    target.startsWith("#") ||
    target.startsWith("/") ||
    target.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  );
}

function isInsideRepo(resolved) {
  const relative = path.relative(rootDir, resolved);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}
