import { describe, expect, it } from "vitest";
import { compileProject } from "@/lib/server/compiler/compile";
import { runProjectTests } from "@/lib/server/testing/runner";
import { detectProject } from "@/lib/project/detect";

// A Foundry-style layout: sources, tests and scripts nested under contracts/,
// importing forge-std the way Foundry projects do ("forge-std/Test.sol").
const files = [
  // Pinned like the real project this reproduces (crash seen with solc 0.8.28).
  { path: "contracts/foundry.toml", content: '[profile.default]\nsrc = "src"\nsolc_version = "0.8.28"\nevm_version = "cancun"\n' },
  {
    path: "contracts/src/Counter.sol",
    content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract Counter {
    uint256 public number;
    function increment() external { number++; }
}
`,
  },
  {
    path: "contracts/test/Counter.t.sol",
    content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";
import {Padding} from "../src/Padding.sol";
contract CounterTest is Test {
    Counter counter;
    function setUp() public { counter = new Counter(); }
    function test_Increment() public {
        counter.increment();
        assertEq(counter.number(), 1);
    }
}
`,
  },
  {
    path: "contracts/script/Deploy.s.sol",
    content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Script} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Counter} from "../src/Counter.sol";
contract Deploy is Script {
    function run() external { vm.startBroadcast(); new Counter(); vm.stopBroadcast(); }
}
`,
  },
];

// Large inputs: solc-js copies the input JSON onto the wasm stack, and a big
// input plus deeply recursive code then crashes solc with "memory access out
// of bounds" (seen on a real Foundry monorepo). 4ORGE passes the input on the
// heap instead. 1.5 MB of comments plus a 100-level nested expression
// reproduces the crash without that fix.
files.push({
  path: "contracts/src/Padding.sol",
  content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\ncontract Padding {\n    function deep() external pure returns (uint256) { return ${"(".repeat(100)}1${")".repeat(100)}; }\n}\n${"// padding\n".repeat(140_000)}`,
});

describe("forge-std (Foundry test library)", () => {
  it("is fetched from its pinned GitHub release and Foundry-style tests run", async () => {
    const { detection, compiler } = detectProject(files);
    const build = await compileProject(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies });
    expect(build.errors).toEqual([]);
    expect(build.contracts.map((c) => c.name).sort()).toEqual(["Counter", "Padding"]);
    expect(build.errors).toEqual([]);

    const run = await runProjectTests(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies, scope: "solidity" });
    expect(run.errorMessage).toBeNull();
    expect(run.status).toBe("passed");
    expect(run.passed).toBe(1);
  });
});
