"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits, pad, encodeFunctionData } from "viem";
import { ERC20_ABI } from "@/lib/abis";
import {
  GATEWAY_API_URL,
  GATEWAY_WALLET,
  BURN_INTENT_TYPES,
  GATEWAY_WALLET_ABI,
  ARC_DOMAIN,
  type GatewayChainConfig,
} from "@/lib/gateway";

export type GatewayStep =
  | "idle"
  | "approving"
  | "depositing"
  | "signing"
  | "submitting"
  | "done"
  | "error";

interface TransferParams {
  sourceChain: GatewayChainConfig;
  amount: string; // USDC amount as decimal string
  recipientAddress: `0x${string}`;
}

export function useGatewayTransfer() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [step, setStep] = useState<GatewayStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [transferId, setTransferId] = useState("");
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setStep("idle");
    setTxHash("");
    setTransferId("");
    setError("");
  }, []);

  const transfer = useCallback(
    async ({ sourceChain, amount, recipientAddress }: TransferParams) => {
      if (!address || !walletClient || !publicClient) {
        setError("Wallet not connected");
        setStep("error");
        return;
      }

      try {
        setStep("approving");
        setError("");
        setTxHash("");
        setTransferId("");

        const rawAmount = parseUnits(amount, 6);
        // Fee: ~2% or minimum 2.01 USDC
        const minFee = parseUnits("2.01", 6);
        const percentFee = (rawAmount * BigInt(2)) / BigInt(100);
        const fee = percentFee > minFee ? percentFee : minFee;
        const totalAmount = rawAmount + fee;

        // 1. Approve USDC to GatewayWallet
        const allowance = await publicClient.readContract({
          address: sourceChain.usdc,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, GATEWAY_WALLET],
        });

        if ((allowance as bigint) < totalAmount) {
          const approveTx = await walletClient.sendTransaction({
            to: sourceChain.usdc,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "approve",
              args: [GATEWAY_WALLET, totalAmount],
            }),
          });
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }

        // 2. Deposit USDC + fee into GatewayWallet
        setStep("depositing");
        const mintRecipient = pad(recipientAddress, { size: 32 });

        const depositTx = await walletClient.sendTransaction({
          to: GATEWAY_WALLET,
          data: encodeFunctionData({
            abi: GATEWAY_WALLET_ABI,
            functionName: "deposit",
            args: [
              sourceChain.usdc,
              rawAmount,
              ARC_DOMAIN,
              mintRecipient,
              fee,
            ],
          }),
        });
        await publicClient.waitForTransactionReceipt({ hash: depositTx });
        setTxHash(depositTx);

        // 3. Get nonce for EIP-712 signing
        setStep("signing");
        const nonce = await publicClient.readContract({
          address: GATEWAY_WALLET,
          abi: GATEWAY_WALLET_ABI,
          functionName: "nonces",
          args: [address],
        });

        // 4. Sign EIP-712 BurnIntent message
        const signature = await walletClient.signTypedData({
          domain: {
            name: "GatewayWallet",
            version: "1",
            chainId: BigInt(sourceChain.chainId),
            verifyingContract: GATEWAY_WALLET,
          },
          types: BURN_INTENT_TYPES,
          primaryType: "BurnIntent",
          message: {
            sender: address,
            nonce: nonce as bigint,
            burnToken: sourceChain.usdc,
            amount: rawAmount,
            destinationDomain: ARC_DOMAIN,
            mintRecipient,
            maxFee: fee,
          },
        });

        // 5. POST to Circle Gateway API
        setStep("submitting");
        const response = await fetch(GATEWAY_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: address,
            nonce: (nonce as bigint).toString(),
            burnToken: sourceChain.usdc,
            amount: rawAmount.toString(),
            sourceDomain: sourceChain.domain,
            destinationDomain: ARC_DOMAIN,
            mintRecipient: mintRecipient,
            maxFee: fee.toString(),
            signature,
            sourceChainId: sourceChain.chainId,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Gateway API error: ${response.status} — ${body}`);
        }

        const result = await response.json();
        setTransferId(result.id || result.transferId || "");
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gateway transfer failed");
        setStep("error");
      }
    },
    [address, walletClient, publicClient]
  );

  return { transfer, step, txHash, transferId, error, reset };
}
