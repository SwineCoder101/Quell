declare module "@dynamic-labs-wallet/node-evm" {
  export class DynamicEvmWalletClient {
    constructor(opts: {
      environmentId: string;
      enableMPCAccelerator?: boolean;
    });
    authenticateApiToken(token: string): Promise<void>;
    createWalletAccount(opts: {
      thresholdSignatureScheme: any;
      password?: string;
      onError?: (error: Error) => void;
      backUpToClientShareService?: boolean;
    }): Promise<{
      accountAddress: string;
      walletId: string;
      publicKeyHex: string;
      externalServerKeyShares: any[];
    }>;
    signMessage(opts: {
      accountAddress: string;
      message: string;
      password?: string;
      externalServerKeyShares?: any[];
    }): Promise<string>;
    signTransaction(opts: {
      senderAddress: string;
      transaction: any;
      password?: string;
      externalServerKeyShares?: any[];
    }): Promise<string>;
    getExternalServerKeyShares(opts: {
      accountAddress: string;
    }): Promise<any[]>;
    getWalletClient(opts: {
      accountAddress: string;
      password?: string;
      externalServerKeyShares?: any[];
      chain?: any;
      chainId?: number;
      rpcUrl?: string;
    }): Promise<any>;
  }
}

declare module "@dynamic-labs-wallet/core" {
  export enum ThresholdSignatureScheme {
    TWO_OF_TWO = "TWO_OF_TWO",
    TWO_OF_THREE = "TWO_OF_THREE",
  }
}
