// PexSwap (Lifelox DEX) configuration for the in-app swap widget.
//
// The deployed DEX on Pexli is the CROSS-LANE ("dual") router+factory — it
// handles Solidity, Rust and native PEX sides uniformly (native PEX is pooled
// as PEX itself, no WPEX wrapper). Addresses are the ones the PexSwap frontend
// ships (frontend/src/config/addresses.ts).
//
// Pool discovery, reserves and the quote FORMULA come from the vendored
// @lifelox/dex-sdk (src/vendor/dex-sdk) — we never re-implement the AMM math.
// Only the dual router's swapExactInput calldata is built here, because the SDK
// only ships the core-V2 builder and this deployment runs the dual router.

export const PEXLI_CHAIN_ID = 78901;

// Native PEX is the zero address (a pool "side" and the router's native lane).
export const NATIVE_PEX = {
  key: "native",
  symbol: "PEX",
  name: "Pexli",
  decimals: 18,
  lane: "solidity", // pool-side lane; the Asset lane is "native" (see swap.js)
  address: "0x0000000000000000000000000000000000000000",
  native: true,
};

export const SWAP_CONFIG = {
  // Cross-lane (dual) contracts — deployed on the Pexli testnet.
  dualFactory: "0x60a0d287C0d2584b8e585317d1264bF389cB894E",
  dualRouter: "0x596b93967Cc18539795437A17E689e775c2CCE93",

  // Default slippage tolerance (fraction). 0.005 = 0.5%.
  slippage: 0.005,

  // The swap always spends this fixed amount of native PEX; the user only picks
  // which token to receive. (Set to "" to allow a free-form amount instead.)
  fixedAmountPex: "0.0004",

  // Extra tokens to show even before any pool is discovered (optional). Native
  // PEX is always included. Each: { symbol, name, decimals, lane, address?, id? }.
  tokens: [],

  // FIXED-POOL mode (optional). When set, the widget offers exactly this one
  // pair and skips discovery. tokenIn/tokenOut are token objects like NATIVE_PEX
  // (with symbol/name/decimals/lane/address|id). Leave null for "any pool" mode.
  //   fixedPool: { tokenIn: NATIVE_PEX, tokenOut: { symbol:"USDP", address:"0x…", decimals:18, lane:"solidity" } }
  fixedPool: null,
};

export function swapEnabled() {
  return !!SWAP_CONFIG.dualRouter && !!SWAP_CONFIG.dualFactory;
}
