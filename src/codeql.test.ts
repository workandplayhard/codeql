import fs from "fs";
import path from "path";

import { exec } from "@actions/exec";
import { rmRF } from "@actions/io";
import test from "ava";

import { runQuery, getDatabaseSHA } from "./codeql";

test.before(async (t: any) => {
  const tmpDir = path.resolve(fs.mkdtempSync("tmp"));
  t.context.tmpDir = tmpDir;

  const projectDir = path.join(tmpDir, "project");
  const dbDir = path.join(tmpDir, "db");
  fs.mkdirSync(projectDir);
  const testFile = path.join(projectDir, "test.js");
  fs.writeFileSync(testFile, "const x = 1;");

  await exec("codeql", [
    "database",
    "create",
    "--language=javascript",
    `--source-root=${projectDir}`,
    dbDir,
  ]);

  const dbZip = path.join(tmpDir, "database.zip");
  await exec("codeql", ["database", "bundle", `--output=${dbZip}`, dbDir]);
  t.context.db = dbZip;
});

test.after(async (t: any) => {
  if (t.context?.tmpDir !== undefined) {
    await rmRF(t.context.tmpDir);
  }
});

test("running a basic query", async (t: any) => {
  const tmpDir = fs.mkdtempSync("tmp");
  const cwd = process.cwd();
  process.chdir(tmpDir);
  try {
    await runQuery(
      "codeql",
      "javascript",
      t.context.db,
      "a/b",
      "import javascript\nfrom File f select f"
    );

    t.true(
      fs
        .readFileSync(path.join("results", "results.md"), "utf-8")
        .includes("test.js")
    );
    t.true(fs.existsSync(path.join("results", "results.bqrs")));
    t.true(fs.existsSync(path.join("results", "results.csv")));
  } finally {
    process.chdir(cwd);
    await rmRF(tmpDir);
  }
});

test("running a query in a pack", async (t: any) => {
  const testPack = path.resolve("testdata/test_pack");
  const tmpDir = fs.mkdtempSync("tmp");
  const cwd = process.cwd();
  process.chdir(tmpDir);
  try {
    await runQuery(
      "codeql",
      "javascript",
      t.context.db,
      "a/b",
      undefined,
      testPack
    );

    t.true(
      fs
        .readFileSync(path.join("results", "results.md"), "utf-8")
        .includes("| 0 | 1 |")
    );
    t.true(fs.existsSync(path.join("results", "results.bqrs")));
    t.true(fs.existsSync(path.join("results", "results.csv")));
  } finally {
    process.chdir(cwd);
    await rmRF(tmpDir);
  }
});

test("getting the commit SHA for a database", async (t: any) => {
  // Note: db-metadata-only.zip is not a real database.
  // It doesn't contain source code, only a codeql-database.yml file.
  const testDbZip = path.resolve("testdata/db-metadata-only.zip");
  const tmpDir = fs.mkdtempSync("tmp");
  const cwd = process.cwd();
  process.chdir(tmpDir);
  try {
    // Test our fake database. This "database" has a commit SHA in its metadata.
    await exec("codeql", ["database", "unbundle", testDbZip, "--name=fakeDb"]);
    const sha1 = getDatabaseSHA("fakeDb");
    t.is(sha1, "ccf1e13626d97b009b4da78f719f028d9f7cdf80");

    // Test the real database, which has no commit SHA (until CodeQL CLI 2.7.2 is released).
    // TODO: update this test once CodeQL CLI 2.7.2 is released.
    await exec("codeql", [
      "database",
      "unbundle",
      t.context.db,
      "--name=realDb",
    ]);
    const sha2 = getDatabaseSHA("realDb");
    t.is(sha2, "HEAD");
  } finally {
    process.chdir(cwd);
    await rmRF(tmpDir);
  }
});
