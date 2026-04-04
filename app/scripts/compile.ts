import solc from "solc";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const contractsDir = path.join(__dirname, "..", "contracts");
const artifactsDir = path.join(__dirname, "..", "artifacts");

// Read OpenZeppelin sources from node_modules
function findImport(importPath: string) {
  const resolved = path.join(__dirname, "..", "node_modules", importPath);
  if (fs.existsSync(resolved)) {
    return { contents: fs.readFileSync(resolved, "utf8") };
  }
  return { error: `File not found: ${importPath}` };
}

const source = fs.readFileSync(path.join(contractsDir, "MockERC20.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: {
    "MockERC20.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

console.log("Compiling MockERC20.sol...");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      console.error(err.formattedMessage);
      process.exit(1);
    } else {
      console.warn(err.formattedMessage);
    }
  }
}

const contract = output.contracts["MockERC20.sol"]["MockERC20"];
const artifact = {
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
};

fs.mkdirSync(artifactsDir, { recursive: true });
fs.writeFileSync(path.join(artifactsDir, "MockERC20.json"), JSON.stringify(artifact, null, 2));
console.log("Artifact written to artifacts/MockERC20.json");
