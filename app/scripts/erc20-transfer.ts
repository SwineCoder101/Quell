import { createUnlink, unlinkAccount, unlinkEvm } from "@unlink-xyz/sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const UNLINK_ENGINE = "https://staging-api.unlink.xyz";
const UNLINK_TOKEN = "0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const apiKey = process.env.UNLINK_API_KEY;
  const mnemonic = process.env.UNLINK_MNEMONIC;
  const to = process.env.TO_ADDRESS;
  const amount = process.env.AMOUNT || "1";

  if (!privateKey || !apiKey || !mnemonic || !to) {
    console.error("Missing env vars. Need: PRIVATE_KEY, UNLINK_API_KEY, UNLINK_MNEMONIC, TO_ADDRESS");
    process.exit(1);
  }

  const evmAccount = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account: evmAccount,
    chain: baseSepolia,
    transport: http(),
  });

  console.log(`EVM wallet: ${evmAccount.address}`);

  const unlink = createUnlink({
    engineUrl: UNLINK_ENGINE,
    apiKey,
    account: unlinkAccount.fromMnemonic({ mnemonic }),
    evm: unlinkEvm.fromViem({ walletClient }),
  });

  const unlinkAddress = await unlink.getAddress();
  console.log(`Unlink address: ${unlinkAddress}`);

  // Check private balances
  const { balances } = await unlink.getBalances();
  console.log("Private balances:", balances);

  // Private transfer
  const rawAmount = (BigInt(amount) * BigInt(10) ** BigInt(18)).toString();
  console.log(`\nSending private transfer of ${amount} tokens to ${to}...`);

  const transfer = await unlink.transfer({
    recipientAddress: to,
    token: UNLINK_TOKEN,
    amount: rawAmount,
  });

  console.log(`Transfer submitted: txId=${transfer.txId}, status=${transfer.status}`);

  // Wait for confirmation
  const confirmed = await unlink.pollTransactionStatus(transfer.txId);
  console.log("Transfer confirmed:", confirmed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
