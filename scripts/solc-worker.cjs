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
    const soljson = require(soljsonPath);
    const solc = wrapper(soljson);
    // No import callback: every source is supplied up front by the resolver,
    // so the compiler never touches the filesystem.
    const json = JSON.stringify(input);
    const heapCompile = heapCompiler(soljson);
    const output = JSON.parse(heapCompile ? heapCompile(json) : solc.compile(json));
    process.stdout.write(JSON.stringify({ version: solc.version(), output }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ fatal: String(e && e.message ? e.message : e) }));
    process.exitCode = 1;
  }
});

/**
 * solc-js passes the input JSON through Emscripten's ccall, which copies
 * string arguments onto the WebAssembly stack (about 1 MB). Larger inputs,
 * e.g. tests importing forge-std, whose safeconsole.sol alone is 400 KB, crash
 * with "memory access out of bounds". This copies the input to the heap
 * instead. Returns null for old compilers without these exports.
 */
function heapCompiler(soljson) {
  const has = (n) => typeof soljson[n] === "function";
  if (!has("_solidity_compile") || !has("lengthBytesUTF8") || !has("stringToUTF8") || !has("UTF8ToString")) return null;
  const alloc = has("_solidity_alloc") ? soljson.cwrap("solidity_alloc", "number", ["number"]) : has("_malloc") ? soljson._malloc : null;
  if (!alloc) return null;
  const compile = soljson.cwrap("solidity_compile", "number", ["number", "number", "number"]);
  const reset = has("_solidity_reset") ? soljson.cwrap("solidity_reset", null, []) : null;
  return (json) => {
    const len = soljson.lengthBytesUTF8(json);
    const ptr = alloc(len + 1);
    soljson.stringToUTF8(json, ptr, len + 1);
    const out = soljson.UTF8ToString(compile(ptr, 0, 0));
    if (reset) reset(); // frees every allocation, including the input
    return out;
  };
}
