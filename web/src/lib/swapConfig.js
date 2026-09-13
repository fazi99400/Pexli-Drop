// PexSwap router configuration.
//
// Fill these in with the real values from the PexSwap repo/team (spec §3) to
// turn the in-app swap ON. Until routerAddress is set, the Swap card shows a
// "coming soon" state and never sends a transaction.
//
// The default ABI below is the common Uniswap-V2 shape. If PexSwap's router
// uses different function names/signatures, replace ROUTER_ABI to match — the
// swap client (lib/swap.js) only relies on the names present here.

export const SWAP_CONFIG = {
  // Router contract address on Pexli. Leave "" to keep swap disabled.
  routerAddress: "",

  // Wrapped-native (WPEX) address — needed for PEX <-> token swaps. Optional if
  // you only support token <-> token.
  wpexAddress: "",

  // Tokens shown in the picker. `address: "native"` is the native PEX coin.
  tokens: [
    { address: "native", symbol: "PEX", name: "Pexli", decimals: 18 },
    // { address: "0x...", symbol: "USDX", name: "USDX", decimals: 6 },
  ],

  // Default slippage tolerance (fraction). 0.005 = 0.5%.
  slippage: 0.005,
};

// Uniswap-V2-style router ABI (quote + the swap variants). Adjust to PexSwap.
export const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
];

export const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export function swapEnabled() {
  return !!SWAP_CONFIG.routerAddress;
}
