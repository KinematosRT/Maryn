export interface Violation {
  file: string;
  line: number;
  rule: string;
  match: string;
  severity: "block" | "warn";
}

export interface ScanResult {
  clean: boolean;
  violations: Violation[];
}

interface Pattern {
  name: string;
  re: RegExp;
}

// Block: secrets and credentials that must never be committed
const BLOCK: Pattern[] = [
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "generic-api-key",
    re: /(?:api[_-]?key|apikey|api[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/i,
  },
  // Only match actual JWT values, not placeholder strings like <your-token>
  { name: "bearer-token-value", re: /Bearer\s+eyJ[A-Za-z0-9_-]{10,}\./i },
  {
    name: "private-key",
    re: /-----BEGIN\s+(?:RSA|EC|OPENSSH|DSA)?\s*PRIVATE KEY-----/,
  },
  { name: "gitlab-pat", re: /glpat-[A-Za-z0-9\-_]{20,}/ },
  { name: "gitlab-runner-token", re: /GR1348941[A-Za-z0-9\-_]{20,}/ },
  {
    name: "jwt-full",
    re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  },
  {
    name: "connection-string",
    re: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s'"]{10,}/i,
  },
  {
    name: "azure-secret-assignment",
    re: /client[_-]?secret\s*[:=]\s*["']?[A-Za-z0-9~._\-]{30,}["']?/i,
  },
];

// Warn: PII that may be legitimate in some contexts
const WARN: Pattern[] = [
  {
    name: "email",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  },
  { name: "phone-fr", re: /(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/ },
  {
    name: "ip-private",
    re: /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/,
  },
  {
    name: "credit-card",
    re: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  },
  {
    name: "insee-nir",
    re: /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/,
  },
];

// Known-safe values that should not trigger false positives
const ALLOWLIST = new Set([
  "b2efd9b2-c81d-4ff8-91d6-8fb5fd68691b", // hackathon shared SP
  "maryn-service@thalesgroup.com",
]);

function redact(s: string): string {
  if (s.length <= 8) return "***";
  return s.slice(0, 4) + "..." + s.slice(-4);
}

function isAllowlisted(match: string): boolean {
  const cleaned = match.trim().replace(/["']/g, "");
  for (const safe of ALLOWLIST) {
    if (cleaned.includes(safe)) return true;
  }
  return false;
}

export function scanContent(file: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { name, re } of BLOCK) {
      const m = re.exec(line);
      if (m && !isAllowlisted(m[0])) {
        violations.push({
          file,
          line: i + 1,
          rule: name,
          match: redact(m[0]),
          severity: "block",
        });
      }
    }

    for (const { name, re } of WARN) {
      const m = re.exec(line);
      if (m && !isAllowlisted(m[0])) {
        violations.push({
          file,
          line: i + 1,
          rule: name,
          match: redact(m[0]),
          severity: "warn",
        });
      }
    }
  }

  return violations;
}

export function scan(files: Map<string, string>): ScanResult {
  const all: Violation[] = [];
  for (const [path, content] of files) {
    all.push(...scanContent(path, content));
  }
  return {
    clean: !all.some((v) => v.severity === "block"),
    violations: all,
  };
}
