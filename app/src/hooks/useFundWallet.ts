"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits, pad, encodeFunctionData } from "viem";
import { ERC20_ABI } from "@/lib/abis";
import { CCTP_CHAINS, ARC_DOMAIN, TOKEN_MESSENGER_V2_ABI } from "@/lib/cctp";

export type FundStep =
  | "idle"
  | "approving"
  | "depositing"
  | "done"
  | "error";

interface FundParams {
  sourceChainId: number;
  amount: string; // USDC amount as decimal string e.g. "10.00"
  recipientAddress: `0x${string}`;
}

export function useFundWallet() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [step, setStep] = useState<FundStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setStep("idle");
    setTxHash("");
    setError("");
  }, []);

  const fundWallet = useCallback(
    async ({ sourceChainId, amount, recipientAddress }: FundParams) => {
      if (!address || !walletClient || !publicClient) {
        setError("Wallet not connected");
        setStep("error");
        return;
      }

      const chainConfig = CCTP_CHAINS[sourceChainId];
      if (!chainConfig) {
        setError(`Unsupported source chain: ${sourceChainId}`);
        setStep("error");
        return;
      }

      try {
        setStep("approving");
        setError("");
        setTxHash("");

        const rawAmount = parseUnits(amount, 6); // USDC has 6 decimals

        // Check allowance and approve if needed
        const allowance = await publicClient.readContract({
          address: chainConfig.usdc,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, chainConfig.tokenMessengerV2],
        });

        if ((allowance as bigint) < rawAmount) {
          const approveTx = await walletClient.sendTransaction({
            to: chainConfig.usdc,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "approve",
              args: [chainConfig.tokenMessengerV2, rawAmount],
            }),
          });
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }

        // depositForBurn on TokenMessengerV2
        setStep("depositing");

        const mintRecipient = pad(recipientAddress, { size: 32 });
        const destinationCaller = pad("0x0" as `0x${string}`, { size: 32 });

        const depositTx = await walletClient.sendTransaction({
          to: chainConfig.tokenMessengerV2,
          data: encodeFunctionData({
            abi: TOKEN_MESSENGER_V2_ABI,
            functionName: "depositForBurn",
            args: [
              rawAmount,
              ARC_DOMAIN,
              mintRecipient,
              chainConfig.usdc,
              destinationCaller,
              BigInt(0), // maxFee (0 = no limit)
              0,         // mintDeadline (0 = no deadline)
            ],
          }),
        });

        await publicClient.waitForTransactionReceipt({ hash: depositTx });
        setTxHash(depositTx);
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "CCTP transfer failed");
        setStep("error");
      }
    },
    [address, walletClient, publicClient]
  );

  return { fundWallet, step, txHash, error, reset };
}
