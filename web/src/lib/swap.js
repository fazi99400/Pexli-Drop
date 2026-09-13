// In-app swap client (Uniswap-V2-style). Uses the unlocked in-browser signer.
// Everything is signed locally; no server ever sees a key. Router details come
// from lib/swapConfig.js (fill them to enable swapping).
import { ethers } from "ethers";
import { getProvider } from "./localWallet";
import { SWAP_CONFIG, ROUTER_ABI, ERC20_ABI, swapEnabled } from "./swapConfig";

const isNative = (t) => !t || t.address === "native";

function router(runner) {
  return new ethers.Contract(SWAP_CONFIG.routerAddress, ROUTER_ABI, runner);
}

// Build the token path, substituting WPEX for the native coin at either end.
function pathFor(tokenIn, tokenOut) {
  const wpex = SWAP_CONFIG.wpexAddress;
  const a = isNative(tokenIn) ? wpex : tokenIn.address;
  const b = isNative(tokenOut) ? wpex : tokenOut.address;
  if (!a || !b) throw new Error("Token path not available (WPEX address not set).");
  return [a, b];
}

// amountIn is a human string; returns { amountOut (human), amountOutRaw, minOutRaw }.
export async function getQuote(tokenIn, tokenOut, amountInHuman) {
  if (!swapEnabled()) throw new Error("Swap isn't configured yet.");
  const amountIn = ethers.parseUnits(String(amountInHuman || "0"), tokenIn.decimals);
  if (amountIn <= 0n) return { amountOut: "0", amountOutRaw: 0n, minOutRaw: 0n };
  const amounts = await router(getProvider()).getAmountsOut(amountIn, pathFor(tokenIn, tokenOut));
  const out = amounts[amounts.length - 1];
  const slip = BigInt(Math.floor((1 - SWAP_CONFIG.slippage) * 1_000_000));
  const minOut = (out * slip) / 1_000_000n;
  return {
    amountOut: ethers.formatUnits(out, tokenOut.decimals),
    amountOutRaw: out,
    minOutRaw: minOut,
  };
}

// Ensure the router can spend `amountIn` of an ERC-20 tokenIn (native needs none).
export async function ensureApproval(signer, tokenIn, amountInRaw, onStep) {
  if (isNative(tokenIn)) return;
  const erc = new ethers.Contract(tokenIn.address, ERC20_ABI, signer);
  const owner = await signer.getAddress();
  const current = await erc.allowance(owner, SWAP_CONFIG.routerAddress);
  if (current >= amountInRaw) return;
  onStep?.("Approving token…");
  const tx = await erc.approve(SWAP_CONFIG.routerAddress, amountInRaw);
  await tx.wait(1);
}

// Execute the swap. Returns the receipt.
export async function executeSwap(signer, { tokenIn, tokenOut, amountInHuman, minOutRaw, onStep }) {
  if (!swapEnabled()) throw new Error("Swap isn't configured yet.");
  const to = await signer.getAddress();
  const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
  const amountIn = ethers.parseUnits(String(amountInHuman), tokenIn.decimals);
  const path = pathFor(tokenIn, tokenOut);
  const r = router(signer);

  await ensureApproval(signer, tokenIn, amountIn, onStep);
  onStep?.("Swapping…");

  let tx;
  if (isNative(tokenIn)) {
    tx = await r.swapExactETHForTokens(minOutRaw, path, to, deadline, { value: amountIn });
  } else if (isNative(tokenOut)) {
    tx = await r.swapExactTokensForETH(amountIn, minOutRaw, path, to, deadline);
  } else {
    tx = await r.swapExactTokensForTokens(amountIn, minOutRaw, path, to, deadline);
  }
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error("Swap transaction failed.");
  return receipt;
}
