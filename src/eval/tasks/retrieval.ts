/**
 * Retrieval correctness. Maryn promises that the same question returns the same
 * context, that the context is the stored one, and that nothing else comes with
 * it. These tasks hold the surface to exactly that.
 */

import {
  ALL_PATHS,
  ARCHITECTURE_CHAR_LIMIT,
  ARCHITECTURE_TAIL,
  PINNED_PATHS,
  SEARCH_CASES,
  UNPINNED_PATHS,
  corpusFile,
} from "../corpus.js";
import { check, checkEqual, checkExcludes, checkIncludes, checkSameSet } from "../expect.js";
import { readMemory, readSnapshot, readTree, search, searchPaths } from "../surface.js";
import type { GoldenTask } from "../types.js";

export const RETRIEVAL_TASKS: GoldenTask[] = [
  {
    id: "R1",
    family: "retrieval",
    title: "markdown read returns the stored record",
    claim: "context_read reproduces description, tags and body of a markdown file without alteration.",
    async run({ session }) {
      const expected = corpusFile("reference/decision-0007.md");
      const actual = await readMemory(session, expected.path);

      checkEqual(actual.path, expected.path, "path");
      checkEqual(actual.frontmatter.description, expected.description, "description");
      checkEqual(actual.frontmatter.tags, expected.tags, "tags");
      checkEqual(actual.content, expected.body, "body");
    },
  },
  {
    id: "R2",
    family: "retrieval",
    title: "YAML read returns the stored structure",
    claim: "context_read separates declared attributes from structured data and keeps both intact.",
    async run({ session }) {
      const expected = corpusFile("reference/glossary.yaml");
      const actual = await readMemory(session, expected.path);

      checkEqual(actual.frontmatter.description, expected.description, "description");
      checkEqual(actual.frontmatter.tags, expected.tags, "tags");
      checkEqual(actual.data, expected.data, "structured data");
    },
  },
  {
    id: "R3",
    family: "retrieval",
    title: "single term search returns the exact match set",
    claim: "A term present in one record retrieves that record and no other.",
    async run({ session }) {
      for (const testCase of SEARCH_CASES.filter((c) => c.query.split(" ").length === 1)) {
        const paths = await searchPaths(session, testCase.query);
        checkSameSet(paths, testCase.expected, `query ${JSON.stringify(testCase.query)}`);
      }
    },
  },
  {
    id: "R4",
    family: "retrieval",
    title: "multi term search joins terms with AND",
    claim: "Every term of a query has to appear in a record for it to be returned.",
    async run({ session }) {
      const cases = SEARCH_CASES.filter(
        (c) => c.query.split(" ").length > 1 && c.expected.length > 0,
      );
      check(cases.length > 0, "no multi term case defined");

      for (const testCase of cases) {
        const paths = await searchPaths(session, testCase.query);
        checkSameSet(paths, testCase.expected, `query ${JSON.stringify(testCase.query)}`);
      }
    },
  },
  {
    id: "R5",
    family: "retrieval",
    title: "absent terms retrieve nothing",
    claim: "A query with no match reports no result instead of returning a near neighbour.",
    async run({ session }) {
      const miss = SEARCH_CASES.find((c) => c.expected.length === 0);
      check(miss !== undefined, "no empty result case defined");

      const reply = await search(session, miss.query);
      check(!reply.isError, `search reported an error: ${reply.text}`);
      checkIncludes(reply.text, "No results", "empty search reply");

      const paths = await searchPaths(session, miss.query);
      checkSameSet(paths, [], "empty search result set");
    },
  },
  {
    id: "R6",
    family: "retrieval",
    title: "tree lists the store and partitions it",
    claim: "context_tree covers every stored record and splits pinned from unpinned by location.",
    async run({ session }) {
      const tree = await readTree(session);

      checkSameSet(tree.files, ALL_PATHS, "files");
      checkSameSet(tree.pinned, PINNED_PATHS, "pinned");
      checkSameSet(tree.unpinned, UNPINNED_PATHS, "unpinned");
    },
  },
  {
    id: "R7",
    family: "retrieval",
    title: "snapshot carries pinned records only",
    claim: "context_snapshot contains every pinned record and leaks no unpinned one.",
    async run({ session }) {
      const snapshot = await readSnapshot(session);

      for (const path of PINNED_PATHS) {
        checkIncludes(snapshot, path, "snapshot");
      }
      for (const path of UNPINNED_PATHS) {
        checkExcludes(snapshot, path, "snapshot");
      }
      for (const path of PINNED_PATHS) {
        checkIncludes(snapshot, corpusFile(path).description, "snapshot description");
      }
    },
  },
  {
    id: "R8",
    family: "retrieval",
    title: "snapshot honours the declared character budget",
    claim: "A record declaring char_limit is truncated at that budget before it enters the context.",
    async run({ session }) {
      const architecture = corpusFile("system/architecture.md");
      const body = architecture.body ?? "";
      const kept = body.slice(0, ARCHITECTURE_CHAR_LIMIT);
      const snapshot = await readSnapshot(session);

      check(body.length > ARCHITECTURE_CHAR_LIMIT, "corpus record is shorter than its budget");
      checkIncludes(snapshot, kept, "truncated body");
      checkIncludes(snapshot, "(truncated)", "truncation marker");
      checkExcludes(snapshot, ARCHITECTURE_TAIL, "content past the budget");
    },
  },
  {
    id: "R9",
    family: "retrieval",
    title: "repeated retrieval is byte identical",
    claim: "Identical requests return identical bytes, which is what makes the store usable as evidence.",
    async run({ session }) {
      const firstSnapshot = await readSnapshot(session);
      const firstTree = await readTree(session);
      const firstSearch = await search(session, "decision");

      const secondSnapshot = await readSnapshot(session);
      const secondTree = await readTree(session);
      const secondSearch = await search(session, "decision");

      checkEqual(secondSnapshot, firstSnapshot, "snapshot across calls");
      checkEqual(secondTree, firstTree, "tree across calls");
      checkEqual(secondSearch.text, firstSearch.text, "search across calls");
    },
  },
];
