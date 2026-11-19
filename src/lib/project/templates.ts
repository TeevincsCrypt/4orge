import type { AbiParameter } from "../types";

export type TemplateId = "counter" | "token" | "oz-token" | "blank";

export interface ProjectTemplate {
  id: TemplateId;
  name: string;
  description: string;
  files: { path: string; content: string }[];
}

const SPDX = "// SPDX-License-Identifier: MIT";

const hardhatConfig = (deps = "") => `// Hardhat 3 configuration for working on this project outside 4ORGE.
// 4ORGE reads compiler settings from this file *as text*; it never executes it.
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    qieTestnet: {
      type: "http",
      chainType: "l1",
      url: "https://rpc1testnet.qie.digital",
      chainId: 1983,
    },
  },
});${deps}
`;

const packageJson = (name: string, extraDeps: Record<string, string> = {}) =>
  JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: { test: "hardhat test", build: "hardhat build" },
      dependencies: extraDeps,
      devDependencies: {
        hardhat: "^3.0.0",
        "@nomicfoundation/hardhat-toolbox-viem": "^5.0.0",
        viem: "^2.0.0",
      },
    },
    null,
    2,
  ) + "\n";

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "counter",
    name: "Counter (starter)",
    description: "A minimal contract with a constructor argument, Solidity tests and a viem node:test suite.",
    files: [
      {
        path: "contracts/Counter.sol",
        content: `${SPDX}
pragma solidity ^0.8.24;

/// @title Counter — a minimal 4ORGE starter contract
contract Counter {
    uint256 public count;
    address public immutable owner;

    event Incremented(address indexed by, uint256 amount, uint256 newCount);

    error ZeroAmount();

    constructor(uint256 initialCount) {
        count = initialCount;
        owner = msg.sender;
    }

    function increment() external {
        incrementBy(1);
    }

    function incrementBy(uint256 amount) public {
        if (amount == 0) revert ZeroAmount();
        count += amount;
        emit Incremented(msg.sender, amount, count);
    }
}
`,
      },
      {
        path: "contracts/Counter.t.sol",
        content: `${SPDX}
pragma solidity ^0.8.24;

import {Counter} from "./Counter.sol";

/// Solidity tests run inside the EVM with Hardhat 3.
contract CounterTest {
    Counter counter;

    function setUp() public {
        counter = new Counter(10);
    }

    function test_InitialCount() public view {
        require(counter.count() == 10, "initial count should be 10");
    }

    function test_Increment() public {
        counter.increment();
        require(counter.count() == 11, "count should be 11");
    }

    function testFuzz_IncrementBy(uint64 amount) public {
        if (amount == 0) return;
        uint256 before = counter.count();
        counter.incrementBy(amount);
        require(counter.count() == before + amount, "count mismatch");
    }

    function test_RevertsOnZero() public {
        (bool ok, ) = address(counter).call(abi.encodeCall(Counter.incrementBy, (0)));
        require(!ok, "incrementBy(0) should revert");
    }
}
`,
      },
      {
        path: "test/Counter.ts",
        content: `import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("Counter", async function () {
  const { viem } = await network.connect();

  it("stores the constructor value", async function () {
    const counter = await viem.deployContract("Counter", [42n]);
    assert.equal(await counter.read.count(), 42n);
  });

  it("increments and emits Incremented", async function () {
    const counter = await viem.deployContract("Counter", [0n]);
    await viem.assertions.emit(counter.write.incrementBy([5n]), counter, "Incremented");
    assert.equal(await counter.read.count(), 5n);
  });
});
`,
      },
      { path: "hardhat.config.ts", content: hardhatConfig() },
      { path: "package.json", content: packageJson("counter") },
    ],
  },
  {
    id: "token",
    name: "Fixed-supply token",
    description: "A self-contained ERC-20 token (no external dependencies) with name, symbol and supply set at deployment.",
    files: [
      {
        path: "contracts/ForgeToken.sol",
        content: `${SPDX}
pragma solidity ^0.8.24;

/// @title ForgeToken — minimal, dependency-free ERC-20
contract ForgeToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint256 initialSupply) {
        name = name_;
        symbol = symbol_;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "ForgeToken: insufficient allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - value;
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "ForgeToken: transfer to zero address");
        require(balanceOf[from] >= value, "ForgeToken: insufficient balance");
        unchecked {
            balanceOf[from] -= value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
`,
      },
      {
        path: "contracts/ForgeToken.t.sol",
        content: `${SPDX}
pragma solidity ^0.8.24;

import {ForgeToken} from "./ForgeToken.sol";

contract ForgeTokenTest {
    ForgeToken token;
    address constant ALICE = address(0xA11CE);

    function setUp() public {
        token = new ForgeToken("Forge", "FRG", 1_000 ether);
    }

    function test_Metadata() public view {
        require(keccak256(bytes(token.symbol())) == keccak256("FRG"), "symbol");
        require(token.decimals() == 18, "decimals");
    }

    function test_InitialSupplyToDeployer() public view {
        require(token.balanceOf(address(this)) == 1_000 ether, "deployer balance");
        require(token.totalSupply() == 1_000 ether, "total supply");
    }

    function test_Transfer() public {
        token.transfer(ALICE, 10 ether);
        require(token.balanceOf(ALICE) == 10 ether, "alice balance");
    }

    function test_RevertsOnInsufficientBalance() public {
        (bool ok, ) = address(token).call(abi.encodeCall(ForgeToken.transfer, (ALICE, 2_000 ether)));
        require(!ok, "should revert");
    }
}
`,
      },
      { path: "hardhat.config.ts", content: hardhatConfig() },
      { path: "package.json", content: packageJson("forge-token") },
    ],
  },
  {
    id: "oz-token",
    name: "OpenZeppelin ERC-20",
    description:
      "An ERC-20 built on @openzeppelin/contracts. Demonstrates 4ORGE's safe npm dependency resolution (no install scripts are run).",
    files: [
      {
        path: "contracts/QieToken.sol",
        content: `${SPDX}
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract QieToken is ERC20, Ownable {
    constructor(address initialOwner, uint256 initialSupply)
        ERC20("QIE Demo Token", "QDT")
        Ownable(initialOwner)
    {
        _mint(initialOwner, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
`,
      },
      {
        path: "contracts/QieToken.t.sol",
        content: `${SPDX}
pragma solidity ^0.8.24;

import {QieToken} from "./QieToken.sol";

contract QieTokenTest {
    QieToken token;

    function setUp() public {
        token = new QieToken(address(this), 500 ether);
    }

    function test_OwnerReceivesSupply() public view {
        require(token.balanceOf(address(this)) == 500 ether, "owner balance");
    }

    function test_OwnerCanMint() public {
        token.mint(address(0xBEEF), 1 ether);
        require(token.balanceOf(address(0xBEEF)) == 1 ether, "minted");
    }
}
`,
      },
      { path: "hardhat.config.ts", content: hardhatConfig() },
      { path: "package.json", content: packageJson("qie-token", { "@openzeppelin/contracts": "^5.1.0" }) },
    ],
  },
  {
    id: "blank",
    name: "Blank Hardhat project",
    description: "An empty contract and Hardhat 3 configuration to start from scratch.",
    files: [
      {
        path: "contracts/MyContract.sol",
        content: `${SPDX}
pragma solidity ^0.8.24;

contract MyContract {
    // Start building here.
}
`,
      },
      { path: "hardhat.config.ts", content: hardhatConfig() },
      { path: "package.json", content: packageJson("my-project") },
    ],
  },
];

export function getTemplate(id: string): ProjectTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

function placeholderValue(p: AbiParameter): string {
  const t = p.type;
  if (t.endsWith("]")) return `new ${t.replace(/\[\d*\]$/, "")}[](0)`;
  if (t === "address") return "address(0xBEEF)";
  if (t === "bool") return "true";
  if (t === "string") return '"example"';
  if (t.startsWith("uint") || t.startsWith("int")) return "1";
  if (t === "bytes") return '""';
  if (t.startsWith("bytes")) return `${t}(0)`;
  return "/* TODO */";
}

/** Generate a starter Solidity test for a compiled contract. */
export function generateSolidityTest(contractName: string, sourcePath: string, constructorInputs: AbiParameter[]): {
  path: string;
  content: string;
} {
  const dir = sourcePath.split("/").slice(0, -1).join("/");
  const file = sourcePath.split("/").pop()!;
  const testPath = `${dir ? `${dir}/` : ""}${contractName}.t.sol`;
  const args = constructorInputs.map(placeholderValue).join(", ");
  return {
    path: testPath,
    content: `${SPDX}
pragma solidity ^0.8.20;

import {${contractName}} from "./${file}";

/// Generated by 4ORGE. Each function starting with \`test\` is a test case;
/// a test fails if it reverts. Replace the placeholders with real checks.
contract ${contractName}Test {
    ${contractName} target;

    function setUp() public {
        target = new ${contractName}(${args});
    }

    function test_Deploys() public view {
        require(address(target) != address(0), "deployment failed");
    }

    // function test_SomeBehaviour() public {
    //     target.someFunction();
    //     require(target.someValue() == 1, "unexpected value");
    // }
}
`,
  };
}
