#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  cwd: rootDir,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const forbiddenEnvFiles = trackedFiles.filter(
  (file) => /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example") && file !== ".env.example",
);
const findings = forbiddenEnvFiles.map((file) => `${file}: tracked environment file is not allowed`);
let textFilesScanned = 0;

const credentialPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["GitHub token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["credential-like sk token", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
];
const secretAssignment = /\b(QWEN_API_KEY|DASHSCOPE_API_KEY|HANDOFFBASE_API_KEY|MCP_AUTH_TOKEN|DATABASE_URL)[ \t]*=[ \t]*([^\s#]*)/g;
const credentialUrl = /\b(?:postgres|postgresql):\/\/([^\s/:]+):([^\s@]+)@[^\s)"']+/g;
const intentionalSensitiveFixtureFiles = new Set([
  "packages/memory-core/test/qwen-sanitizer.test.mjs",
  "packages/memory-core/test/sensitive.test.mjs",
]);

for (const file of trackedFiles) {
  if (forbiddenEnvFiles.includes(file)) {
    continue;
  }

  const bytes = readFileSync(path.join(rootDir, file));
  if (bytes.includes(0)) {
    continue;
  }
  textFilesScanned += 1;
  const text = bytes.toString("utf8");

  if (!intentionalSensitiveFixtureFiles.has(file)) {
    for (const [label, pattern] of credentialPatterns) {
      for (const match of text.matchAll(pattern)) {
        findings.push(`${file}:${lineFor(text, match.index)}: ${label}`);
      }
    }
  }

  for (const match of text.matchAll(secretAssignment)) {
    const value = match[2];
    if (!isClearlyNonSecret(value)) {
      findings.push(`${file}:${lineFor(text, match.index)}: non-placeholder ${match[1]} assignment`);
    }
  }

  for (const match of text.matchAll(credentialUrl)) {
    if (!isClearlyNonSecret(match[1]) || !isClearlyNonSecret(match[2])) {
      findings.push(`${file}:${lineFor(text, match.index)}: credential-bearing PostgreSQL URL`);
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`Tracked-file secret scan: FAIL (${findings.length} findings)\n`);
  for (const finding of findings) {
    process.stderr.write(`- ${finding}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Tracked-file secret scan: PASS (${trackedFiles.length} tracked files, ${textFilesScanned} text files scanned; no real .env.* files opened).\n`,
  );
}

function isClearlyNonSecret(value) {
  const normalized = value.toLowerCase();
  return (
    value === "" ||
    value === '""' ||
    value === "''" ||
    value.startsWith("<") ||
    value.startsWith("${") ||
    value.startsWith("$") ||
    /(?:placeholder|redacted|example|invalid|fake|test|local|password|sentinel|your-|change-me)/.test(normalized)
  );
}

function lineFor(text, index = 0) {
  return text.slice(0, index).split("\n").length;
}
