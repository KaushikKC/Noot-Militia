import * as React from "react";
import { useWalletClient } from "wagmi";
import { providers } from "ethers";

interface WalletClientWithRequiredProps {
  account: {
    address: string;
  };
  chain: {
    id: number;
    name: string;
    contracts?: {
      ensRegistry?: {
        address: string;
      };
    };
  };
  transport: {
    request: (...args: unknown[]) => Promise<unknown>;
    [key: string]: unknown;
  };
}

export function walletClientToSigner(
  walletClient: WalletClientWithRequiredProps
) {
  const { account, chain, transport } = walletClient;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new providers.Web3Provider(transport, network);
  const signer = provider.getSigner(account.address);
  return signer;
}

/** Hook to convert a viem Wallet Client to an ethers.js Signer. */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: walletClient } = useWalletClient({ chainId });

  return React.useMemo(
    () =>
      walletClient
        ? walletClientToSigner(walletClient as WalletClientWithRequiredProps)
        : undefined,
    [walletClient]
  );
}
