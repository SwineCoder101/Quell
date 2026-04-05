"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { parseUnits, pad, encodeFunctionData, keccak256, toHex } from "viem";
import { config } from "@/lib/wagmi";
import { ERC20_ABI } from "@/lib/abis";
import {
  GATEWAY_API_URL,
  GATEWAY_WALLET,
  GATEWAY_MINTER,
  BURN_INTENT_TYPES,
  GATEWAY_WALLET_ABI,
  GATEWAY_MINTER_ABI,
  ARC_DOMAIN,
  ARC_USDC,
  ARC_CHAIN_ID,
  type GatewayChainConfig,
} from "@/lib/gateway";

export type GatewayStep =
  | "idle"
  | "approving"
  | "depositing"
  | "waiting"
  | "signing"
  | "submitting"
  | "switching"
  | "minting"
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
  const { switchChainAsync } = useSwitchChain();

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

        // Calculate fee upfront: ~2% or minimum 2.01 USDC
        const minFee = parseUnits("2.01", 6);
        const percentFee = (rawAmount * BigInt(2)) / BigInt(100);
        const maxFee = percentFee > minFee ? percentFee : minFee;
        const totalDeposit = rawAmount + maxFee;

        // 1. Approve total (amount + fee) to GatewayWallet
        const allowance = await publicClient.readContract({
          address: sourceChain.usdc,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, GATEWAY_WALLET],
        });

        if ((allowance as bigint) < totalDeposit) {
          const approveTx = await walletClient.sendTransaction({
            to: sourceChain.usdc,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "approve",
              args: [GATEWAY_WALLET, totalDeposit],
            }),
          });
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }

        // 2. Deposit amount + fee into GatewayWallet
        setStep("depositing");

        const depositTx = await walletClient.sendTransaction({
          to: GATEWAY_WALLET,
          data: encodeFunctionData({
            abi: GATEWAY_WALLET_ABI,
            functionName: "deposit",
            args: [sourceChain.usdc, totalDeposit],
          }),
        });
        await publicClient.waitForTransactionReceipt({ hash: depositTx });
        setTxHash(depositTx);

        // 2b. Wait for Gateway to recognize the deposit balance
        setStep("waiting");
        const requiredBalance = parseFloat(amount) + parseFloat(maxFee.toString()) / 1e6;
        for (let attempt = 0; attempt < 30; attempt++) {
          try {
            const balRes = await fetch("https://gateway-api-testnet.circle.com/v1/balances", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: "USDC",
                sources: [{ domain: sourceChain.domain, depositor: address }],
              }),
            });
            if (balRes.ok) {
              const balData = await balRes.json();
              const available = parseFloat(balData.balances?.[0]?.balance || "0");
              if (available >= requiredBalance) break;
            }
          } catch {
            // ignore fetch errors, keep polling
          }
          await new Promise((r) => setTimeout(r, 5000));
        }

        // 3. Sign EIP-712 BurnIntent for cross-chain transfer
        setStep("signing");

        const blockNumber = await publicClient.getBlockNumber();
        // Allow generous block buffer — Gateway requires a high maxBlockHeight
        const maxBlockHeight = blockNumber + BigInt(100_000);

        // Generate random salt
        const salt = keccak256(toHex(Date.now()));

        const mintRecipient = pad(recipientAddress, { size: 32 });
        const sourceContract = pad(GATEWAY_WALLET, { size: 32 });
        const destinationContract = pad(GATEWAY_MINTER, { size: 32 });
        const sourceToken = pad(sourceChain.usdc, { size: 32 });
        const destinationToken = pad(ARC_USDC, { size: 32 });
        const sourceSigner = pad(address, { size: 32 });
        const destinationCaller = pad("0x0000000000000000000000000000000000000000" as `0x${string}`, { size: 32 });

        const burnIntent = {
          maxBlockHeight,
          maxFee,
          spec: {
            version: 1,
            sourceDomain: sourceChain.domain,
            destinationDomain: ARC_DOMAIN,
            sourceContract,
            destinationContract,
            sourceToken,
            destinationToken,
            sourceDepositor: pad(address, { size: 32 }),
            destinationRecipient: mintRecipient,
            sourceSigner,
            destinationCaller,
            value: rawAmount,
            salt,
            hookData: "0x" as `0x${string}`,
          },
        };

        const signature = await walletClient.signTypedData({
          domain: {
            name: "GatewayWallet",
            version: "1",
          },
          types: BURN_INTENT_TYPES,
          primaryType: "BurnIntent",
          message: burnIntent,
        });

        // 4. POST signed burn intent to Circle Gateway API
        setStep("submitting");

        const response = await fetch(GATEWAY_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            [{ burnIntent, signature }],
            (_key, value) => typeof value === "bigint" ? value.toString() : value,
          ),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Gateway API error: ${response.status} — ${body}`);
        }

        const result = await response.json();
        setTransferId(result.id || result.transferId || "");

        // 5. Extract attestation from API response
        const attestation = result.attestation || result.attestationPayload;
        const operatorSig = result.signature || result.operatorSignature;

        if (!attestation || !operatorSig) {
          // API accepted but no attestation yet — transfer is processing
          setStep("done");
          return;
        }

        // 6. Switch wallet to Arc testnet
        setStep("switching");
        await switchChainAsync({ chainId: ARC_CHAIN_ID });

        // 7. Get a fresh wallet client bound to Arc after the chain switch
        setStep("minting");
        const arcWalletClient = await getWalletClient(config, { chainId: ARC_CHAIN_ID });

        const mintTx = await arcWalletClient.sendTransaction({
          to: GATEWAY_MINTER,
          data: encodeFunctionData({
            abi: GATEWAY_MINTER_ABI,
            functionName: "gatewayMint",
            args: [attestation as `0x${string}`, operatorSig as `0x${string}`],
          }),
          chain: {
            id: ARC_CHAIN_ID,
            name: "Arc Testnet",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
          },
        });

        setTransferId(mintTx);
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gateway transfer failed");
        setStep("error");
      }
    },
    [address, walletClient, publicClient, switchChainAsync]
  );

  return { transfer, step, txHash, transferId, error, reset };
}
