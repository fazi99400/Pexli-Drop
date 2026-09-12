import { PEXLI_RPC_URL, PEXLI_EXPLORER_URL } from "../firebase.config";

const rpc = import.meta.env.VITE_PEXLI_RPC_URL || PEXLI_RPC_URL || "";
const explorer = import.meta.env.VITE_PEXLI_EXPLORER_URL || PEXLI_EXPLORER_URL || "";

// Pexli chain parameters + ecosystem links (spec §1 / §8).
export const PEXLI_CHAIN = {
  chainId: "0x13435", // 78901 decimal
  chainName: "Pexli",
  nativeCurrency: { name: "Pexli", symbol: "PEX", decimals: 18 },
  rpcUrls: [rpc].filter(Boolean),
  blockExplorerUrls: [explorer].filter(Boolean),
};

// Address the "send a transaction" task asks users to send PEX to (the Pexli
// faucet EOA). Shown on the tx card so users know the destination.
export const TX_TARGET_ADDRESS = "0x0ACf5276dc2b0863E91e27CB48e39bA3EF135Abf";

export const LINKS = {
  main: "https://pex.li",
  drop: "https://drop.pex.li",
  faucet: "https://faucet.pex.li",
  dex: "https://lifelox.xyz",
  wallet: "https://wallet.lifelox.xyz",
  x: "https://x.com/PexliLabs",
  instagram: "https://instagram.com/PexliLab",
  chainlist: "https://chainlist.org/chain/78901",
};
