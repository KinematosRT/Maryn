/**
 * Assertions used by golden tasks. A task fails by throwing, so each helper
 * carries the detail that ends up in the report.
 */

export class CheckFailure extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "CheckFailure";
  }
}

export function check(condition: boolean, detail: string): asserts condition {
  if (!condition) throw new CheckFailure(detail);
}

export function checkEqual(actual: unknown, expected: unknown, label: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  check(left === right, `${label}: expected ${right} but got ${left}`);
}

export function checkSameSet(actual: string[], expected: string[], label: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  checkEqual(left, right, label);
}

export function checkIncludes(haystack: string, needle: string, label: string): void {
  check(haystack.includes(needle), `${label}: missing ${JSON.stringify(needle)}`);
}

export function checkExcludes(haystack: string, needle: string, label: string): void {
  check(!haystack.includes(needle), `${label}: unexpected ${JSON.stringify(needle)}`);
}
