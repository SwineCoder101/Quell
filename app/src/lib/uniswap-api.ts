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

/**
 * POST /swap — takes { quote, signature?, permitData? } as separate top-level fields.
 * signature and permitData must both be present or both absent.
 */
export async function getSwap(
  quote: Record<string, unknown>,
  permitData: Record<string, unknown> | null,
  signature?: string,
) {
  const body: Record<string, unknown> = { quote };

  if (signature && permitData) {
    body.signature = signature;
    body.permitData = permitData;
  }
  // If no permitData, omit both signature and permitData entirely

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

/**
 * POST /swap_5792 — takes { quote, permitData?, deadline?, urgency? }.
 * No signature field — EIP-5792 batches approval + swap into calls the wallet executes together.
 */
export interface BatchSwapCall {
  to: string;
  data: string;
  value: string;
}

export interface BatchSwapResponse {
  requestId: string;
  from: string;
  chainId: number;
  calls: BatchSwapCall[];
  gasFee?: string;
}

export async function getBatchSwap(
  quote: Record<string, unknown>,
  permitData?: Record<string, unknown> | null,
  urgency: "normal" | "fast" | "urgent" = "urgent",
): Promise<BatchSwapResponse> {
  const body: Record<string, unknown> = { quote, urgency };

  // Only include permitData if it's a non-null object
  if (permitData && typeof permitData === "object") {
    body.permitData = permitData;
  }

  const res = await fetch("/api/uniswap/swap_5792", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || err.error || `Batch swap failed: ${res.status}`);
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
