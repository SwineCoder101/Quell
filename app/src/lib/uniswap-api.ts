// Client-side helpers that call our Next.js API routes (which proxy to Uniswap Trading API)

export interface QuoteParams {
  swapper: string;
  tokenIn: string;
  tokenOut: string;
  tokenInChainId: string;
  tokenOutChainId: string;
  amount: string;
  type: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance?: number;
  routingPreference?: string;
}

export interface ApprovalParams {
  walletAddress: string;
  token: string;
  amount: string;
  chainId: number;
}

export async function checkApproval(params: ApprovalParams) {
  const res = await fetch("/api/uniswap/check_approval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || err.error || `Approval check failed: ${res.status}`);
  }
  return res.json();
}

export async function getQuote(params: QuoteParams) {
  const res = await fetch("/api/uniswap/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      slippageTolerance: params.slippageTolerance ?? 0.5,
      routingPreference: params.routingPreference ?? "BEST_PRICE",
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || err.error || `Quote failed: ${res.status}`);
  }
  return res.json();
}

export async function getSwap(quoteResponse: Record<string, unknown>, signature?: string) {
  // Strip null permitData fields, spread quote response into body
  const { permitData, permitTransaction, ...cleanQuote } = quoteResponse;
  const body: Record<string, unknown> = { ...cleanQuote };

  const isUniswapX =
    quoteResponse.routing === "DUTCH_V2" ||
    quoteResponse.routing === "DUTCH_V3" ||
    quoteResponse.routing === "PRIORITY";

  if (isUniswapX) {
    if (signature) body.signature = signature;
  } else {
    if (signature && permitData && typeof permitData === "object") {
      body.signature = signature;
      body.permitData = permitData;
    }
  }

  const res = await fetch("/api/uniswap/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || err.error || `Swap failed: ${res.status}`);
  }
  return res.json();
}

// Helper to extract output amount from quote response regardless of routing type
export function getOutputAmount(quoteResponse: Record<string, unknown>): string {
  const routing = quoteResponse.routing as string;
  const quote = quoteResponse.quote as Record<string, unknown>;

  if (routing === "DUTCH_V2" || routing === "DUTCH_V3" || routing === "PRIORITY") {
    const orderInfo = quote.orderInfo as Record<string, unknown>;
    const outputs = orderInfo.outputs as Array<{ startAmount: string }>;
    return outputs[0]?.startAmount ?? "0";
  }

  const output = quote.output as { amount: string };
  return output?.amount ?? "0";
}
