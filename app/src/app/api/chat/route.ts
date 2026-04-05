import { streamText, tool, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { TOKEN_LIST, NATIVE_ETH } from "@/lib/token-config";

const V3_PAIRS = [
  "USDC/WETH", "USDC/DAI", "USDC/USDT", "USDC/WBTC", "USDC/LINK", "USDC/UNI",
  "WETH/DAI", "WETH/WBTC", "WETH/LINK", "WETH/UNI", "WETH/AAVE",
  "WETH/ARB", "WETH/OP", "WETH/MKR", "WETH/DOGE",
];

function buildSystemPrompt(balances: { symbol: string; formatted: string }[]) {
  const tokenList = [NATIVE_ETH, ...TOKEN_LIST]
    .map((t) => `${t.symbol} (${t.name}, ${t.decimals} decimals)`)
    .join(", ");

  const pairsStr = V3_PAIRS.map((p) => {
    const [a, b] = p.split("/");
    return `${a} ↔ ${b}`;
  }).join(", ");

  const balancesStr =
    balances.length > 0
      ? balances
          .filter((b) => parseFloat(b.formatted) > 0)
          .map((b) => `${b.symbol}: ${b.formatted}`)
          .join("\n  ")
      : "No wallet connected or no balances available";

  return `You are a DeFi strategy assistant for Quell, a batch swap app on Ethereum Sepolia testnet.

Your job is to help users form batch swap strategies. When a user describes what they want to do, suggest concrete trades using the suggest_trades tool.

Available tokens: ${tokenList}

Valid trading pairs (V3 pools):
${pairsStr}
All pairs are bidirectional. ETH can route through WETH.

User's current balances:
  ${balancesStr}

Rules:
- ONLY suggest trades using the valid pairs listed above
- Never suggest selling more than the user holds
- When user says percentages, calculate concrete amounts from their balances
- Use the suggest_trades tool to propose concrete trades — don't just describe them in text
- Keep explanations concise and actionable
- If a requested pair isn't available, explain which pairs ARE available for those tokens
- ETH and WETH are interchangeable for routing purposes`;
}

export async function POST(req: Request) {
  const { messages: uiMessages, balances } = await req.json();
  const modelMessages = await convertToModelMessages(uiMessages);

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: buildSystemPrompt(balances || []),
    messages: modelMessages,
    tools: {
      suggest_trades: tool({
        description:
          "Suggest concrete trades to add to the batch swap panel. Use this whenever proposing specific swaps.",
        inputSchema: z.object({
          summary: z.string().describe("Brief strategy summary (1-2 sentences)"),
          trades: z.array(
            z.object({
              sellToken: z
                .string()
                .describe("Token symbol to sell (e.g. WETH)"),
              buyToken: z
                .string()
                .describe("Token symbol to buy (e.g. USDC)"),
              sellAmount: z
                .string()
                .describe("Amount to sell in human-readable form (e.g. 0.5)"),
              reasoning: z
                .string()
                .describe("Brief reason for this specific trade"),
            })
          ),
        }),
        execute: async ({ summary, trades }) => {
          return { summary, trades, displayed: true };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
