import { describe, expect, it } from "vitest";
import { compileProject } from "@/lib/server/compiler/compile";
import { runProjectTests } from "@/lib/server/testing/runner";
import { detectProject } from "@/lib/project/detect";

// A Foundry-style layout: sources, tests and scripts nested under contracts/,
// importing forge-std the way Foundry projects do ("forge-std/Test.sol").
const files = [
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

describe("forge-std (Foundry test library)", () => {
  it("is fetched from its pinned GitHub release and Foundry-style tests run", async () => {
    const { detection, compiler } = detectProject(files);
    const build = await compileProject(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies });
    expect(build.errors).toEqual([]);
    expect(build.contracts.map((c) => c.name)).toEqual(["Counter"]);

    const run = await runProjectTests(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies, scope: "solidity" });
    expect(run.errorMessage).toBeNull();
    expect(run.status).toBe("passed");
    expect(run.passed).toBe(1);
  });
});
