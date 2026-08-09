/**
 * Seeded payloads for scoring the secret scanner.
 *
 * `secret: true` means a write carrying this payload has to be refused.
 * `secret: false` means it has to go through: documentation placeholders and
 * warn tier personal data are not grounds for blocking a commit.
 *
 * Every credential here is fabricated or comes from public vendor examples.
 */

export interface SecretFixture {
  id: string;
  secret: boolean;
  /** Why the payload belongs on its side of the line. */
  note: string;
  content: string;
}

export const SECRET_FIXTURES: SecretFixture[] = [
  {
    id: "aws-access-key",
    secret: true,
    note: "AWS access key id in a configuration snippet",
    content: "Deploy role uses AKIAIOSFODNN7EXAMPLE for the nightly export.",
  },
  {
    id: "generic-api-key",
    secret: true,
    note: "assigned api key with a high entropy value",
    content: 'api_key = "sk_live_9c8b7a6d5e4f3g2h1i0j"',
  },
  {
    id: "gitlab-pat",
    secret: true,
    note: "GitLab personal access token",
    content: "CI variable: glpat-AbCdEfGhIjKlMnOpQrSt",
  },
  {
    id: "gitlab-runner-token",
    secret: true,
    note: "GitLab runner registration token",
    content: "runner token GR1348941AbCdEfGhIjKlMnOpQrStUv",
  },
  {
    id: "github-token",
    secret: true,
    note: "GitHub personal access token",
    content: "gh auth login --with-token ghp_0123456789abcdefghijklmnopqrstuvwxyz",
  },
  {
    id: "slack-token",
    secret: true,
    note: "Slack bot token",
    content: "SLACK_BOT_TOKEN=xoxb-2154812345-8675309abcdefGHIJKL",
  },
  {
    id: "private-key",
    secret: true,
    note: "PEM private key header",
    content: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAxLine\n-----END RSA PRIVATE KEY-----",
  },
  {
    id: "signed-jwt",
    secret: true,
    note: "complete signed JSON web token",
    content:
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ." +
      "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5cX",
  },
  {
    id: "azure-client-secret",
    secret: true,
    note: "service principal secret assignment",
    content: 'client_secret: "Abc8Q~KJhgFdsaPoiuytrewq123456789zXcVbN"',
  },
  {
    id: "connection-string-credentials",
    secret: true,
    note: "database password embedded in a connection string",
    content: "DATABASE_URL=postgres://admin:s3cr3tpassword@db.internal:5432/prod",
  },
  {
    id: "placeholder-angle-bracket",
    secret: false,
    note: "setup guide placeholder, no value present",
    content: 'Set api_key: "<your-api-key-here>" before the first run.',
  },
  {
    id: "environment-reference",
    secret: false,
    note: "indirection through an environment variable",
    content: "api_key = ${MARYN_API_KEY}",
  },
  {
    id: "prose-mention",
    secret: false,
    note: "documentation prose naming a credential without carrying one",
    content: "Store the API key in the vault and reference it from the deployment.",
  },
  {
    id: "commit-sha",
    secret: false,
    note: "hexadecimal string that is a commit id",
    content: "Reverted in 9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c.",
  },
  {
    id: "trace-uuid",
    secret: false,
    note: "correlation identifier",
    content: "Trace id 550e8400-e29b-41d4-a716-446655440000 covers the failing request.",
  },
  {
    id: "base64-checksum",
    secret: false,
    note: "base64 payload that is a checksum",
    content: "checksum: c2FtcGxlIGNoZWNrc3VtIGRhdGEgZm9yIHRlc3Rpbmcgb25seQ==",
  },
  {
    id: "connection-string-host",
    secret: false,
    note: "local connection string without credentials",
    content: "Local development points at postgres://localhost:5432/maryn.",
  },
  {
    id: "work-email",
    secret: false,
    note: "warn tier personal data, recorded but not blocking",
    content: "Incident reported by alex.durand@example.com during the March window.",
  },
  {
    id: "private-address",
    secret: false,
    note: "warn tier network topology, recorded but not blocking",
    content: "The gateway answered on 10.0.12.4 behind the load balancer.",
  },
  {
    id: "test-card-number",
    secret: false,
    note: "warn tier payment data, recorded but not blocking",
    content: "Vendor test card 4111 1111 1111 1111 was used for the sandbox order.",
  },
];

export function fixture(id: string): SecretFixture {
  const found = SECRET_FIXTURES.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown fixture: ${id}`);
  return found;
}

export const SECRET_IDS = SECRET_FIXTURES.filter((f) => f.secret).map((f) => f.id);

export const BENIGN_IDS = [
  "placeholder-angle-bracket",
  "environment-reference",
  "prose-mention",
  "commit-sha",
  "trace-uuid",
  "base64-checksum",
  "connection-string-host",
];

export const WARN_TIER_IDS = ["work-email", "private-address", "test-card-number"];
