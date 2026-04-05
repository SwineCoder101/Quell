import { NextRequest, NextResponse } from "next/server";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  concat,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const DYNAMIC_ENV_ID = process.env.DYNAMIC_ENVIRONMENT_ID || process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
const DYNAMIC_TOKEN = process.env.DYNAMIC_AUTH_TOKEN || process.env.NEXT_PUBLIC_DYNAMIC_AUTH_TOKEN;
const WALLET_PWD = process.env.WALLET_PASSWORD || process.env.NEXT_WALLET_PASSWORD;

const APPROVE_SELECTOR = "0x095ea7b3";
// Universal Router execute(bytes,bytes[],uint256) selector
const EXECUTE_SELECTOR = "0x24856bc3";

const UNIVERSAL_ROUTER_ABI = [
  {
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

async function getEvmClient() {
  const client = new DynamicEvmWalletClient({
    environmentId: DYNAMIC_ENV_ID!,
    enableMPCAccelerator: false,
  });
  await client.authenticateApiToken(DYNAMIC_TOKEN!);
  return client;
}

/**
 * Decode a Universal Router execute(commands, inputs, deadline) call
 * and return the individual components.
 */
function decodeExecuteCall(data: Hex): {
  commands: Hex;
  inputs: Hex[];
  deadline: bigint;
} | null {
  if (!data.startsWith(EXECUTE_SELECTOR)) return null;

  // Strip the 4-byte selector to get the ABI-encoded params
  const params = `0x${data.slice(10)}` as Hex;
  const [commands, inputs, deadline] = decodeAbiParameters(
    [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    params
  );

  return {
    commands: commands as Hex,
    inputs: inputs as Hex[],
    deadline,
  };
}

/**
 * Merge multiple execute() calls into a single execute() call
 * by concatenating commands and inputs arrays.
 */
function mergeExecuteCalls(
  swapCalls: { to: string; data: string; value: string }[]
): { to: string; data: Hex; value: bigint } | null {
  const decoded = swapCalls
    .map((c) => decodeExecuteCall(c.data as Hex))
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (decoded.length === 0) return null;

  // Concatenate all commands bytes
  const allCommands = concat(decoded.map((d) => d.commands));
  // Flatten all inputs arrays
  const allInputs = decoded.flatMap((d) => d.inputs);
  // Use the earliest deadline
  const minDeadline = decoded.reduce(
    (min, d) => (d.deadline < min ? d.deadline : min),
    decoded[0].deadline
  );
  // Sum all values
  const totalValue = swapCalls.reduce(
    (sum, c) => sum + BigInt(c.value || "0"),
    BigInt(0)
  );

  const data = encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [allCommands, allInputs, minDeadline],
  });

  return {
    to: swapCalls[0].to, // All target the same Universal Router
    data,
    value: totalValue,
  };
}

export async function POST(req: NextRequest) {
  if (!DYNAMIC_TOKEN || !DYNAMIC_ENV_ID) {
    return NextResponse.json(
      { error: "Server not configured for Dynamic wallet operations" },
      { status: 500 }
    );
  }

  const { walletAddress, calls } = await req.json();

  if (!walletAddress || !Array.isArray(calls) || calls.length === 0) {
    return NextResponse.json(
      { error: "Missing walletAddress or calls" },
      { status: 400 }
    );
  }

  try {
    const evmClient = await getEvmClient();
    const transport = http(RPC_URL);
    const publicClient = createPublicClient({ chain: sepolia, transport });

    // Auto-fund gas from paymaster if server wallet is low on ETH
    const privateKey = process.env.PRIVATE_KEY;
    if (privateKey) {
      const ethBalance = await publicClient.getBalance({ address: walletAddress as `0x${string}` });
      const minGas = parseEther("0.01");
      if (ethBalance < minGas) {
        const paymasterAccount = privateKeyToAccount(privateKey as `0x${string}`);
        const paymaster = createWalletClient({ account: paymasterAccount, chain: sepolia, transport });
        const fundHash = await paymaster.sendTransaction({
          to: walletAddress as `0x${string}`,
          value: parseEther("0.05"),
        });
        await publicClient.waitForTransactionReceipt({ hash: fundHash });
        console.log(`Paymaster funded server wallet with 0.05 ETH for gas (balance was ${formatEther(ethBalance)})`);
      }
    }

    const walletClient = await evmClient.getWalletClient({
      accountAddress: walletAddress,
      password: WALLET_PWD,
      chain: sepolia,
      rpcUrl: RPC_URL,
    });

    // Separate approvals from swap calls
    const approvals = calls.filter((c: any) => c.data?.startsWith(APPROVE_SELECTOR));
    const swaps = calls.filter((c: any) => !c.data?.startsWith(APPROVE_SELECTOR));

    // Execute approvals first (silently)
    for (const call of approvals) {
      try {
        const hash = await walletClient.sendTransaction({
          to: call.to as `0x${string}`,
          data: call.data as `0x${string}`,
          value: BigInt(call.value || "0"),
          chain: sepolia,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      } catch (err: any) {
        console.warn("Approval tx failed (may already be approved):", err.message);
      }
    }

    // Merge all swap execute() calls into a single Universal Router transaction
    const merged = mergeExecuteCalls(swaps);
    if (!merged) {
      return NextResponse.json(
        { error: "No valid swap calls to execute" },
        { status: 400 }
      );
    }

    const swapHash = await walletClient.sendTransaction({
      to: merged.to as `0x${string}`,
      data: merged.data,
      value: merged.value,
      chain: sepolia,
    });
    await publicClient.waitForTransactionReceipt({ hash: swapHash });

    console.log(`Batch swap executed in 1 tx: ${swapHash} (${swaps.length} swaps merged)`);

    return NextResponse.json({
      success: true,
      txHashes: [swapHash],
      approvalCount: approvals.length,
      swapCount: swaps.length,
    });
  } catch (err: any) {
    console.error("Batch execution error:", err);
    return NextResponse.json(
      { error: err.message || "Batch execution failed" },
      { status: 500 }
    );
  }
}
