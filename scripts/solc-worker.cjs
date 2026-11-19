/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 4ORGE compiler worker. Runs in its own Node process (spawned with a memory
 * cap and a timeout by src/lib/server/compiler/compile.ts) so a pathological
 * contract cannot stall or crash the web server.
 *
 * stdin:  {"soljsonPath": "...", "input": <solc standard JSON input>}
 * stdout: {"version": "<long version>", "output": <solc standard JSON output>}
 */
const path = require("node:path");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  try {
    const { soljsonPath, input } = JSON.parse(raw);
    const wrapperPath = require.resolve("solc/wrapper", { paths: [process.cwd(), path.join(__dirname, "..")] });
    const wrapper = require(wrapperPath);
    const solc = wrapper(require(soljsonPath));
    // No import callback: every source is supplied up front by the resolver,
    // so the compiler never touches the filesystem.
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    process.stdout.write(JSON.stringify({ version: solc.version(), output }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ fatal: String(e && e.message ? e.message : e) }));
    process.exitCode = 1;
  }
});
