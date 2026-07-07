export type SensitiveFindingType =
  | "private_key"
  | "password"
  | "api_key"
  | "token"
  | "cookie"
  | "jwt"
  | "cloud_secret";

export interface SensitiveDataFinding {
  type: SensitiveFindingType;
  pattern: string;
  excerpt: string;
}

export interface SensitiveDataCheck {
  ok: boolean;
  findings: SensitiveDataFinding[];
}

interface SensitivePattern {
  type: SensitiveFindingType;
  name: string;
  pattern: RegExp;
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  {
    type: "private_key",
    name: "private_key_block",
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/gi
  },
  {
    type: "token",
    name: "github_token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g
  },
  {
    type: "api_key",
    name: "openai_style_key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g
  },
  {
    type: "cloud_secret",
    name: "aws_access_key_id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g
  },
  {
    type: "api_key",
    name: "google_api_key",
    pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/g
  },
  {
    type: "token",
    name: "slack_token",
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g
  },
  {
    type: "jwt",
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  },
  {
    type: "token",
    name: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi
  },
  {
    type: "cookie",
    name: "cookie_header",
    pattern: /\bCookie\s*:\s*[^\n=;]+=[^\n;]+(?:;\s*[^\n=;]+=[^\n;]+)+/gi
  },
  {
    type: "password",
    name: "credential_assignment",
    pattern:
      /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|session[_-]?cookie)\s*[:=]\s*["']?(?!\[REDACTED_)[^\s"',;]{8,}/gi
  }
];

export class SensitiveDataError extends Error {
  readonly findings: SensitiveDataFinding[];

  constructor(findings: SensitiveDataFinding[]) {
    super(`Refusing to persist sensitive memory content: ${findings.map((finding) => finding.type).join(", ")}`);
    this.name = "SensitiveDataError";
    this.findings = findings;
  }
}

export function findSensitiveData(text: string): SensitiveDataFinding[] {
  const findings: SensitiveDataFinding[] = [];

  for (const sensitivePattern of SENSITIVE_PATTERNS) {
    for (const match of text.matchAll(sensitivePattern.pattern)) {
      const value = match[0];
      findings.push({
        type: sensitivePattern.type,
        pattern: sensitivePattern.name,
        excerpt: maskSecret(value)
      });
    }
  }

  return findings.slice(0, 20);
}

export function rejectSensitiveText(text: string): SensitiveDataCheck {
  const findings = findSensitiveData(text);
  return {
    ok: findings.length === 0,
    findings
  };
}

export function redactSensitiveText(text: string): string {
  let redacted = text;

  for (const sensitivePattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(sensitivePattern.pattern, `[REDACTED_${sensitivePattern.type.toUpperCase()}]`);
  }

  return redacted;
}

export function assertNoSensitiveText(text: string): void {
  const check = rejectSensitiveText(text);
  if (!check.ok) {
    throw new SensitiveDataError(check.findings);
  }
}

function maskSecret(value: string): string {
  const compact = value.replace(/\s+/g, " ").slice(0, 160);
  if (compact.length <= 12) {
    return "[redacted]";
  }

  return `${compact.slice(0, 4)}...[redacted]...${compact.slice(-4)}`;
}
