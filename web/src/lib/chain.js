// Pexli chain parameters + ecosystem links (spec §1 / §8).
export const PEXLI_CHAIN = {
  chainId: "0x13435", // 78901 decimal
  chainName: "Pexli",
  nativeCurrency: { name: "Pexli", symbol: "PEX", decimals: 18 },
  rpcUrls: [import.meta.env.VITE_PEXLI_RPC_URL || ""].filter(Boolean),
  blockExplorerUrls: [import.meta.env.VITE_PEXLI_EXPLORER_URL || ""].filter(Boolean),
};

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
