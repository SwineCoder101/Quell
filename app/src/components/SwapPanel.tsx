"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { TOKEN_LIST, isPairQuotable, isTokenQuotable, getQuotableCounterparts, resolveTokenAddress, type TokenConfig } from "@/lib/token-config";
import { checkApproval, getQuote, getSwap, getOutputAmount } from "@/lib/uniswap-api";
import TokenIcon from "@/components/TokenIcon";
import SettleButton from "@/components/SettleButton";

const SEPOLIA_CHAIN_ID = "11155111";

interface TokenOption extends TokenConfig {
  isNative?: boolean;
}

const TOKEN_OPTIONS: TokenOption[] = [
  ...TOKEN_LIST.filter((t) => isTokenQuotable(t.symbol)),
];

type Step = "idle" | "quoting" | "quoted" | "approving" | "signing" | "swapping" | "done" | "error";

export default function SwapPanel() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [tokenIn, setTokenIn] = useState<TokenOption>(TOKEN_OPTIONS.find((t) => t.symbol === "USDC")!);
  const [tokenOut, setTokenOut] = useState<TokenOption>(TOKEN_OPTIONS.find((t) => t.symbol === "WETH")!);
  const [amountIn, setAmountIn] = useState("");
  const [quoteResponse, setQuoteResponse] = useState<Record<string, unknown> | null>(null);
  const [outputAmount, setOutputAmount] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  const resetState = useCallback(() => {
    setQuoteResponse(null);
    setOutputAmount("");
    setStep("idle");
    setError("");
    setTxHash("");
  }, []);

  const handleQuote = useCallback(async () => {
    if (!address || !amountIn) return;
    resetState();
    setStep("quoting");
    setError("");

    try {
      const decimals = tokenIn.decimals;
      const rawAmount = parseUnits(amountIn, decimals).toString();

      const quote = await getQuote({
        swapper: address,
        tokenIn: resolveTokenAddress(tokenIn, tokenOut.symbol),
        tokenOut: resolveTokenAddress(tokenOut, tokenIn.symbol),
        tokenInChainId: SEPOLIA_CHAIN_ID,
        tokenOutChainId: SEPOLIA_CHAIN_ID,
        amount: rawAmount,
        type: "EXACT_INPUT",
        slippageTolerance: 0.5,
      });

      setQuoteResponse(quote);
      const outAmt = getOutputAmount(quote);
      setOutputAmount(formatUnits(BigInt(outAmt), tokenOut.decimals));
      setStep("quoted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote failed");
      setStep("error");
    }
  }, [address, amountIn, tokenIn, tokenOut, resetState]);

  const handleSwap = useCallback(async () => {
    if (!address || !walletClient || !publicClient || !quoteResponse) return;
    setError("");

    try {
      if (!tokenIn.isNative) {
        setStep("approving");
        const approvalRes = await checkApproval({
          walletAddress: address,
          token: resolveTokenAddress(tokenIn, tokenOut.symbol),
          amount: parseUnits(amountIn, tokenIn.decimals).toString(),
          chainId: 11155111,
        });

        if (approvalRes.approval) {
          const approveTx = await walletClient.sendTransaction({
            to: approvalRes.approval.to as `0x${string}`,
            data: approvalRes.approval.data as `0x${string}`,
            value: BigInt(approvalRes.approval.value || "0"),
          });
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }
      }

      let signature: string | undefined;
      const permitData = quoteResponse.permitData as Record<string, unknown> | null;

      if (permitData) {
        setStep("signing");
        signature = await walletClient.signTypedData({
          domain: permitData.domain as Record<string, unknown>,
          types: permitData.types as Record<string, Array<{ name: string; type: string }>>,
          primaryType: Object.keys(permitData.types as Record<string, unknown>).find(
            (k) => k !== "EIP712Domain"
          ) as string,
          message: permitData.values as Record<string, unknown>,
        });
      }

      setStep("swapping");
      const quote = quoteResponse.quote as Record<string, unknown>;
      const swapRes = await getSwap(quote, permitData, signature);

      if (!swapRes.swap?.data || swapRes.swap.data === "0x") {
        throw new Error("Swap data is empty — quote may have expired. Please re-quote.");
      }

      const tx = await walletClient.sendTransaction({
        to: swapRes.swap.to as `0x${string}`,
        data: swapRes.swap.data as `0x${string}`,
        value: BigInt(swapRes.swap.value || "0"),
        gas: swapRes.swap.gasLimit ? BigInt(swapRes.swap.gasLimit) : undefined,
      });

      await publicClient.waitForTransactionReceipt({ hash: tx });
      setTxHash(tx);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed");
      setStep("error");
    }
  }, [address, walletClient, publicClient, quoteResponse, tokenIn, amountIn]);

  const swapTokens = () => {
    const prevIn = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(prevIn);
    resetState();
  };

  if (!isConnected) {
    return (
      <div className="text-center text-cex-secondary py-12">
        Connect your wallet to start swapping
      </div>
    );
  }

  return (
    <div className="bg-cex-surface border border-cex-border rounded p-6 space-y-4">
      {/* Token In */}
      <div className="bg-background border border-cex-border rounded-lg p-5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-cex-tertiary uppercase tracking-wider">You pay</span>
          <TokenSelector
            tokens={TOKEN_OPTIONS}
            selected={tokenIn}
            exclude={tokenOut.symbol}
            filterFor={tokenOut.symbol}
            onChange={(t) => { setTokenIn(t); resetState(); }}
          />
        </div>
        <input
          type="text"
          placeholder="0.0"
          className="w-full bg-transparent text-3xl text-foreground outline-none font-mono"
          value={amountIn}
          onChange={(e) => {
            setAmountIn(e.target.value);
            resetState();
          }}
        />
      </div>

      {/* Swap direction */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={swapTokens}
          className="bg-cex-surface-hover hover:bg-cex-border border border-cex-border rounded-lg p-2 transition"
        >
          <svg className="w-5 h-5 text-cex-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* Token Out */}
      <div className="bg-background border border-cex-border rounded-lg p-5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-cex-tertiary uppercase tracking-wider">You receive</span>
          <TokenSelector
            tokens={TOKEN_OPTIONS}
            selected={tokenOut}
            exclude={tokenIn.symbol}
            filterFor={tokenIn.symbol}
            onChange={(t) => { setTokenOut(t); resetState(); }}
          />
        </div>
        <div className="text-3xl text-foreground font-mono">
          {step === "quoting" ? (
            <span className="text-cex-tertiary animate-pulse">Getting quote...</span>
          ) : outputAmount ? (
            outputAmount
          ) : (
            <span className="text-cex-tertiary">0.0</span>
          )}
        </div>
      </div>

      {/* Quote details */}
      {quoteResponse && step === "quoted" && (
        <div className="bg-background border border-cex-border rounded-lg p-4 text-sm text-cex-secondary space-y-2">
          <div className="flex justify-between">
            <span>Routing</span>
            <span className="text-foreground">{quoteResponse.routing as string}</span>
          </div>
          {quoteResponse.routing === "CLASSIC" && (
            <div className="flex justify-between">
              <span>Gas estimate</span>
              <span className="text-foreground">
                {(quoteResponse.quote as Record<string, unknown>).gasFeeUSD
                  ? `$${(quoteResponse.quote as Record<string, unknown>).gasFeeUSD}`
                  : "N/A"}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Slippage</span>
            <span className="text-foreground">0.5%</span>
          </div>
        </div>
      )}

      {/* Pair quotability warning */}
      {!isPairQuotable(tokenIn.symbol, tokenOut.symbol) && (
        <div className="bg-cex-red/5 border border-cex-red/20 rounded p-3 flex items-start gap-2">
          <span className="text-cex-red text-sm mt-0.5">!</span>
          <div>
            <p className="text-cex-red text-sm font-medium">RFQ unavailable for {tokenIn.symbol}/{tokenOut.symbol}</p>
            <p className="text-cex-red/60 text-xs mt-0.5">This pair only has V4 liquidity. The Uniswap Trading API does not yet support V4 pool routing.</p>
          </div>
        </div>
      )}

      {/* Action button */}
      {step === "idle" || step === "error" ? (
        <button
          onClick={handleQuote}
          disabled={!amountIn || parseFloat(amountIn) <= 0 || !isPairQuotable(tokenIn.symbol, tokenOut.symbol)}
          className="w-full bg-cex-gold hover:bg-cex-gold/90 disabled:bg-cex-surface disabled:text-cex-tertiary disabled:border disabled:border-cex-border text-[#0b0e11] font-semibold py-4 rounded-lg transition text-base"
        >
          Request Quote (RFQ)
        </button>
      ) : step === "quoted" ? (
        <button
          onClick={handleSwap}
          className="w-full bg-cex-gold hover:bg-cex-gold/90 text-[#0b0e11] font-semibold py-4 rounded-lg transition text-base"
        >
          Swap
        </button>
      ) : step === "done" ? (
        <div className="text-center space-y-2">
          <div className="text-cex-green font-semibold">Swap successful!</div>
          {txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cex-gold hover:underline text-sm"
            >
              View on Etherscan
            </a>
          )}
          <button
            onClick={resetState}
            className="block mx-auto mt-2 text-sm text-cex-secondary hover:text-foreground"
          >
            New swap
          </button>
        </div>
      ) : (
        <button disabled className="w-full bg-cex-surface border border-cex-border text-cex-secondary font-semibold py-4 rounded-lg text-base">
          {step === "quoting" && "Requesting quote..."}
          {step === "approving" && "Approving token..."}
          {step === "signing" && "Sign permit in wallet..."}
          {step === "swapping" && "Confirm swap in wallet..."}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="bg-cex-red/10 border border-cex-red/30 rounded p-3 text-cex-red text-sm">
          {error}
        </div>
      )}

      {/* Settle */}
      <SettleButton />
    </div>
  );
}

function TokenSelector({
  tokens,
  selected,
  exclude,
  filterFor,
  onChange,
}: {
  tokens: TokenOption[];
  selected: TokenOption;
  exclude: string;
  filterFor?: string;
  onChange: (t: TokenOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const counterparts = filterFor ? getQuotableCounterparts(filterFor) : null;
  const filtered = tokens
    .filter((t) => t.symbol !== exclude)
    .filter((t) => !counterparts || counterparts.includes(t.symbol))
    .filter(
      (t) =>
        t.symbol.toLowerCase().includes(search.toLowerCase()) ||
        t.name.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-cex-surface-hover hover:bg-cex-border text-foreground rounded px-3 py-1.5 text-sm border border-cex-border transition"
      >
        <TokenIcon symbol={selected.symbol} size="sm" />
        <span className="font-medium">{selected.symbol}</span>
        <svg className="w-3 h-3 text-cex-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-cex-surface border border-cex-border rounded shadow-2xl z-30 overflow-hidden">
            <div className="p-2">
              <input
                type="text"
                placeholder="Search tokens..."
                className="w-full bg-cex-surface-hover text-foreground text-sm rounded px-3 py-2 outline-none border border-cex-border focus:border-cex-gold transition"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.map((t) => (
                <div
                  key={t.symbol}
                  className={`flex items-center gap-3 px-3 py-2 hover:bg-cex-surface-hover transition ${
                    t.symbol === selected.symbol ? "bg-cex-gold/5" : ""
                  }`}
                >
                  <button
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <TokenIcon symbol={t.symbol} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{t.symbol}</p>
                      <p className="text-xs text-cex-tertiary truncate">{t.name}</p>
                    </div>
                  </button>
                  {t.address !== "0x0000000000000000000000000000000000000000" && (
                    <a
                      href={`https://sepolia.etherscan.io/token/${t.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-cex-tertiary hover:text-cex-gold transition shrink-0"
                    >
                      ↗
                    </a>
                  )}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-cex-secondary text-sm py-4">No tokens found</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
