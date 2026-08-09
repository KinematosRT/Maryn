import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scan, scanContent } from "../src/sanitize/scanner.js";

function rules(content: string, severity: "block" | "warn"): string[] {
  return scanContent("sample.md", content)
    .filter((violation) => violation.severity === severity)
    .map((violation) => violation.rule);
}

describe("secret scanner", () => {
  it("blocks credential literals", () => {
    const cases: Array<[string, string]> = [
      ["AKIAIOSFODNN7EXAMPLE", "aws-access-key"],
      ['api_key = "sk_live_9c8b7a6d5e4f3g2h1i0j"', "generic-api-key"],
      ["glpat-AbCdEfGhIjKlMnOpQrSt", "gitlab-pat"],
      ["GR1348941AbCdEfGhIjKlMnOpQrStUv", "gitlab-runner-token"],
      ["ghp_0123456789abcdefghijklmnopqrstuvwxyz", "github-token"],
      ["xoxb-2154812345-8675309abcdefGHIJKL", "slack-token"],
      ["-----BEGIN RSA PRIVATE KEY-----", "private-key"],
      ['client_secret: "Abc8Q~KJhgFdsaPoiuytrewq123456789zXcVbN"', "azure-secret-assignment"],
    ];

    for (const [content, rule] of cases) {
      assert.ok(rules(content, "block").includes(rule), `${rule} should block ${content}`);
    }
  });

  it("blocks a connection string only when it carries credentials", () => {
    assert.deepEqual(
      rules("postgres://admin:s3cr3tpassword@db.internal:5432/prod", "block"),
      ["connection-string-credentials"],
    );
    assert.deepEqual(rules("postgres://localhost:5432/maryn", "block"), []);
    assert.deepEqual(rules("postgres://localhost:5432/maryn", "warn"), [
      "connection-string-host",
    ]);
  });

  it("leaves documentation payloads alone", () => {
    const benign = [
      'Set api_key: "<your-api-key-here>" before the first run.',
      "api_key = ${MARYN_API_KEY}",
      "Store the API key in the vault and reference it from the deployment.",
      "Reverted in 9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c.",
      "Trace id 550e8400-e29b-41d4-a716-446655440000 covers the failing request.",
      "checksum: c2FtcGxlIGNoZWNrc3VtIGRhdGEgZm9yIHRlc3Rpbmcgb25seQ==",
    ];

    for (const content of benign) {
      assert.deepEqual(scanContent("doc.md", content), [], `should stay clean: ${content}`);
    }
  });

  it("warns on personal data without blocking", () => {
    const result = scan(
      new Map([["notes.md", "Reported by alex.durand@example.com from 10.0.12.4."]]),
    );

    assert.equal(result.clean, true);
    assert.deepEqual(
      result.violations.map((violation) => violation.severity).sort(),
      ["warn", "warn"],
    );
  });

  it("redacts the matched value it reports", () => {
    const [violation] = scanContent("config.md", "AKIAIOSFODNN7EXAMPLE");

    assert.equal(violation.rule, "aws-access-key");
    assert.ok(!violation.match.includes("IOSFODNN7"), "raw credential leaked into the report");
    assert.equal(violation.line, 1);
  });

  it("skips allowlisted values", () => {
    assert.deepEqual(scanContent("team.md", "owner: maryn-service@thalesgroup.com"), []);
  });
});
