import { appendFileSync, mkdirSync, mkdtempSync } from "fs";
import path from "path";
import { chdir, cwd } from "process";

import { create as createArtifactClient } from "@actions/artifact";
import { getInput, setSecret, setFailed } from "@actions/core";
import { extractTar } from "@actions/tool-cache";

import { downloadDatabase, runQuery } from "./codeql";
import { download } from "./download";

interface Repo {
  id: number;
  nwo: string;
  token?: string; // SignedAuthToken
  pat?: string;
}

async function run(): Promise<void> {
  const artifactClient = createArtifactClient();
  try {
    const query = getInput("query") || undefined;
    const queryPackUrl = getInput("query_pack_url") || undefined;

    if ((query === undefined) === (queryPackUrl === undefined)) {
      setFailed("Exactly one of 'query' and 'query_pack_url' is required");
      return;
    }

    const language = getInput("language", { required: true });
    const repos: Repo[] = JSON.parse(
      getInput("repositories", { required: true })
    );
    const codeql = getInput("codeql", { required: true });

    for (const repo of repos) {
      if (repo.token) {
        setSecret(repo.token);
      }
      if (repo.pat) {
        setSecret(repo.pat);
      }
    }

    const curDir = cwd();
    for (const repo of repos) {
      const workDir = mkdtempSync(path.join(curDir, repo.id.toString()));
      chdir(workDir);

      // 1. Use the GitHub API to download the database using token
      console.log("Getting database");
      const dbZip = await downloadDatabase(
        repo.id,
        repo.nwo,
        language,
        repo.token,
        repo.pat
      );

      // 2. Download and extract the query pack, if there is one.
      let queryPack: string | undefined;
      if (queryPackUrl !== undefined) {
        console.log("Getting query pack");
        const queryPackArchive = await download(
          queryPackUrl,
          "query_pack.tar.gz"
        );
        queryPack = await extractTar(queryPackArchive);
      }

      // 2. Run the query
      console.log("Running query");
      const filesToUpload = await runQuery(
        codeql,
        language,
        dbZip,
        repo.nwo,
        query,
        queryPack
      );

      // 3. Upload the results as an artifact
      console.log("Uploading artifact");
      await artifactClient.uploadArtifact(
        repo.id.toString(), // name
        filesToUpload, // files
        "results", // rootdirectory
        { continueOnError: false, retentionDays: 1 }
      );
    }
  } catch (error: any) {
    setFailed(error.message);

    // Write error messages to a file and upload as an artifact, so that the
    // combine-results job "knows" about the failures
    mkdirSync("errors");
    const errorFile = path.join(cwd(), "errors", "error.txt");
    appendFileSync(errorFile, error.message); // TODO: Include information about which repository produced the error

    await artifactClient.uploadArtifact(
      "error", // name
      ["errors/error.txt"], // files
      "errors", // rootdirectory
      { continueOnError: false, retentionDays: 1 }
    );
  }
}

void run();
