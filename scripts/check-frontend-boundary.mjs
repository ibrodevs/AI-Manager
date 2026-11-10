import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter((p) => p && existsSync(p));
const invalid = paths.filter((p) => /\.(py|sql|bundle)$/.test(p) || /^apps\/(backend|voice|workers)\//.test(p) || /^packages\/db\//.test(p));
if (invalid.length) throw new Error(`Backend files must live in AI-Manager-backend:\n${invalid.join("\n")}`);
console.log("Frontend boundary OK: no Python services, workers, SQL migrations or repository bundles.");
