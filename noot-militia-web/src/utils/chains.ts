import { http } from "viem";

const sepoliaTestnet = {
  id: 11155111,
  name: "Sepolia",
  iconUrl:
    "https://ethereum.org/static/6b935ac0e6194247347855dc3d328e83/13c43/sepolia-eth.png",
  nativeCurrency: {
    name: "Sepolia Ether",
    symbol: "SEP",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.sepolia.org",
        "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Sepolia Etherscan",
      url: "https://sepolia.etherscan.io",
    },
  },
};

const abstractSepoliaTestnet = {
  id: 11155420,
  name: "Abstract Sepolia",
  iconUrl: "https://docs.abstractsdk.com/img/logo-light.svg",
  nativeCurrency: {
    name: "Abstract Sepolia Ether",
    symbol: "ASEP",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://sepolia.abstract.network"] },
  },
  blockExplorers: {
    default: {
      name: "Abstract Sepolia Explorer",
      url: "https://explorer.sepolia.abstract.network",
    },
  },
};

export const chainArray = [sepoliaTestnet, abstractSepoliaTestnet];
export const transportsObject = {
  [sepoliaTestnet.id]: http(),
  [abstractSepoliaTestnet.id]: http(),
};
