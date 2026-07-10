"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseChangelogToEntries } = require("./convert-changelog-to-json.js");

test("parses multiple version entries with bodies, most recent first", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [1.1.0](https://example.com/compare/v1.0.0...v1.1.0) (2025-01-04)",
    "",
    "### Features",
    "",
    "* add foo",
    "",
    "## [1.0.0](https://example.com/compare/v0.9.0...v1.0.0) (2024-12-01)",
    "",
    "### Bug Fixes",
    "",
    "* fix bar",
    "",
  ].join("\n");

  const entries = parseChangelogToEntries(changelog, () => null);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].version, "1.1.0");
  assert.equal(entries[0].date, "2025/01/04");
  assert.match(entries[0].body, /add foo/);
  assert.equal(entries[1].version, "1.0.0");
  assert.equal(entries[1].date, "2024/12/01");
  assert.match(entries[1].body, /fix bar/);
});

test("falls back to the CHANGELOG.md date when the release date resolver returns null", () => {
  const changelog = "# 2.0.0 (2025-03-10)\n\nbody text\n";
  const entries = parseChangelogToEntries(changelog, () => null);
  assert.equal(entries[0].date, "2025/03/10");
});

test("prefers the resolved release date (e.g. from a git tag) over the CHANGELOG.md date", () => {
  const changelog = "# 2.0.0 (2025-03-10)\n\nbody text\n";
  const entries = parseChangelogToEntries(changelog, () => "2025/03/11 09:30");
  assert.equal(entries[0].date, "2025/03/11 09:30");
});

test("returns an empty array when there are no version headers", () => {
  const entries = parseChangelogToEntries("# Changelog\n\nNothing here yet.\n", () => null);
  assert.deepEqual(entries, []);
});

test("passes each version to the resolver so callers can look up per-version release dates", () => {
  const changelog = "# 1.0.1 (2025-02-01)\n\nfix\n\n# 1.0.0 (2025-01-01)\n\ninit\n";
  const seen = [];
  parseChangelogToEntries(changelog, (version) => {
    seen.push(version);
    return null;
  });
  assert.deepEqual(seen, ["1.0.1", "1.0.0"]);
});
