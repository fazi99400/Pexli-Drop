// In-app swap against the deployed Lifelox cross-lane ("dual") DEX.
//
// Pool discovery, reserves and the quote formula come from the vendored
// @lifelox/dex-sdk (src/vendor/dex-sdk) — we never rewrite the AMM math. The
// only thing built here is the dual router's swapExactInput calldata, because
// the SDK ships the core-V2 builder and this deployment runs the dual router
// (native PEX is a pool side of its own — no WPEX wrapper). Everything is
// signed and sent by the site's own in-app wallet (ethers signer); no backend
// ever signs. See PexSwap docs/EMBED-SWAP.md.
import { ethers, getProvider } from "./localWallet";
import { encodeFunctionData } from "viem";
import {
  listPools,
  findPools,
  reservesFor,
  quoteFromReserves,
  buildRustTransferTx,
  fetchRustTokenMeta,
} from "../vendor/dex-sdk/index.js";
import { SWAP_CONFIG, NATIVE_PEX } from "./swapConfig";

const ZERO = "0x0000000000000000000000000000000000000000";

// Dual router's swap entry point (PexSwap frontend/src/config/abis.ts).
const ASSET_COMPONENTS = [
  { name: "lane", type: "uint8" },
  { name: "token", type: "address" },
  { name: "id", type: "uint64" },
];
const DUAL_ROUTER_ABI = [
  {
    type: "function",
    name: "swapExactInput",
    stateMutability: "payable",
    inputs: [
      { name: "assetIn", type: "tuple", components: ASSET_COMPONENTS },
      { name: "assetOut", type: "tuple", components: ASSET_COMPONENTS },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
];
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

// CallClient adapter over the ethers provider for the SDK's read functions.
function callClient() {
  const provider = getProvider();
  return { call: async ({ to, data }) => ({ data: await provider.call({ to, data }) }) };
}

export const isNativeTok = (t) => !!t && (t.native || t.key === "native" || t.address === ZERO);

// A UI token -> the SDK PoolSide used for pool matching.
function poolSide(t) {
  if (t.lane === "rust") return { lane: "rust", id: Number(t.id) };
  return { lane: "solidity", address: isNativeTok(t) ? ZERO : t.address };
}
// A UI token -> the dual router Asset struct arg (lane 0=Solidity,1=Rust,2=Native).
function assetArg(t) {
  if (t.lane === "rust") return { lane: 1, token: ZERO, id: BigInt(t.id ?? 0) };
  if (isNativeTok(t)) return { lane: 2, token: ZERO, id: 0n };
  return { lane: 0, token: t.address, id: 0n };
}

export async function loadPools() {
  return listPools(callClient(), { dual: SWAP_CONFIG.dualFactory });
}

// Build the token universe for "any pool" mode: native PEX + every token that
// appears in a pool (metadata read on-chain) + any config extras.
export async function loadTokenUniverse() {
  const pools = await loadPools();
  const client = callClient();
  const provider = getProvider();
  const seen = new Map();
  for (const p of pools) {
    for (const s of [p.side0, p.side1]) {
      const k = s.lane === "rust" ? `rust:${s.id}` : `sol:${String(s.address).toLowerCase()}`;
      if (!seen.has(k)) seen.set(k, s);
    }
  }
  const tokens = [{ ...NATIVE_PEX }];
  const keys = new Set(["native", "sol:" + ZERO]);
  // Read every token's metadata in PARALLEL. ethers batches concurrent calls
  // into a single JSON-RPC request, so this is ~one round-trip instead of one
  // per token — the difference between a snappy and a sluggish swap card.
  const sides = [...seen.values()].filter(
    (s) => !(s.lane === "solidity" && String(s.address).toLowerCase() === ZERO),
  );
  const results = await Promise.all(
    sides.map(async (s) => {
      try {
        if (s.lane === "rust") {
          const meta = await fetchRustTokenMeta(client, BigInt(s.id));
          return { key: "rust:" + s.id, symbol: meta.symbol || `PXC#${s.id}`, name: meta.name || `Rust token ${s.id}`, decimals: meta.decimals ?? 8, lane: "rust", id: Number(s.id) };
        }
        const erc = new ethers.Contract(s.address, ERC20_ABI, provider);
        const [symbol, decimals] = await Promise.all([erc.symbol().catch(() => "TKN"), erc.decimals().catch(() => 18)]);
        return { key: "sol:" + String(s.address).toLowerCase(), symbol, name: symbol, decimals: Number(decimals), lane: "solidity", address: s.address };
      } catch (e) {
        return null; // skip tokens whose metadata can't be read
      }
    }),
  );
  for (const t of results) {
    if (t && !keys.has(t.key)) {
      keys.add(t.key);
      tokens.push(t);
    }
  }
  for (const t of SWAP_CONFIG.tokens || []) {
    const key = t.lane === "rust" ? "rust:" + t.id : "sol:" + String(t.address).toLowerCase();
    if (!keys.has(key)) {
      keys.add(key);
      tokens.push({ key, ...t });
    }
  }
  return { pools, tokens };
}

// The direct pool + reserves oriented to (tokenIn -> tokenOut), or null.
export function poolFor(pools, tokenIn, tokenOut) {
  const found = findPools(pools, poolSide(tokenIn), poolSide(tokenOut));
  if (!found.length) return null;
  const pool = found[0];
  const { thisReserve, otherReserve } = reservesFor(pool, poolSide(tokenIn));
  return { pool, reserveIn: thisReserve, reserveOut: otherReserve };
}

// Quote using the SDK's constant-product formula. Returns
// { amountOut(human), amountOutRaw, minOutRaw, pool } or null when no pool.
export function quote(pools, tokenIn, tokenOut, amountInHuman) {
  const pf = poolFor(pools, tokenIn, tokenOut);
  if (!pf) return null;
  const amountIn = ethers.parseUnits(String(amountInHuman || "0"), tokenIn.decimals);
  if (amountIn <= 0n) return { amountOut: "0", amountOutRaw: 0n, minOutRaw: 0n, pool: pf.pool };
  const out = quoteFromReserves(amountIn, pf.reserveIn, pf.reserveOut);
  const minOut = (out * BigInt(Math.floor((1 - SWAP_CONFIG.slippage) * 1000))) / 1000n;
  return {
    amountOut: ethers.formatUnits(out, tokenOut.decimals),
    amountOutRaw: out,
    minOutRaw: minOut,
    pool: pf.pool,
  };
}

// Read-call a request, retrying while the RPC returns an EMPTY revert
// ("missing revert data") — a cold/slow-node artifact, not a real revert. A
// revert that carries data is deterministic, so we surface it immediately.
async function callWithRetry(provider, req, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await provider.call(req);
    } catch (e) {
      if (e && e.data && e.data !== "0x") throw e; // real revert with a reason
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

// Send with an explicit gasLimit so ethers never runs eth_estimateGas (whose
// cold-call revert is the usual "missing revert data"). One retry for a
// transient broadcast blip.
async function sendTx(signer, req, gasLimit) {
  const full = { ...req, gasLimit };
  try {
    return await signer.sendTransaction(full);
  } catch (e) {
    const m = String(e?.shortMessage || e?.message || "");
    if (/rejected|denied|insufficient funds|nonce|already known/i.test(m)) throw e;
    await new Promise((r) => setTimeout(r, 700));
    return signer.sendTransaction(full);
  }
}

// Execute the swap with the in-app signer. `pool` is the PoolInfo from quote().
export async function executeSwap(signer, { tokenIn, tokenOut, amountInHuman, minOutRaw, pool, onStep }) {
  const to = await signer.getAddress();
  const amountIn = ethers.parseUnits(String(amountInHuman), tokenIn.decimals);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min
  const router = SWAP_CONFIG.dualRouter;

  if (tokenIn.lane === "rust") {
    // Rust input can't be pulled (no approve on that lane) — push it to the pair
    // first, then the router measures what arrived. Two signatures.
    if (!pool?.pair) throw new Error("No pool for this pair yet.");
    onStep?.(`Sending ${tokenIn.symbol} to the pool…`);
    const rt = buildRustTransferTx(BigInt(tokenIn.id), pool.pair, amountIn);
    const push = await sendTx(signer, { to: rt.to, data: rt.data, value: BigInt(rt.value ?? 0) }, 250000n);
    await push.wait(1);
  } else if (!isNativeTok(tokenIn)) {
    // Solidity input: approve the router if the allowance is short.
    const erc = new ethers.Contract(tokenIn.address, ERC20_ABI, signer);
    const current = await erc.allowance(to, router);
    if (current < amountIn) {
      onStep?.("Approving…");
      const ap = await sendTx(signer, {
        to: tokenIn.address,
        data: erc.interface.encodeFunctionData("approve", [router, ethers.MaxUint256]),
      }, 120000n);
      await ap.wait(1);
    }
  }

  onStep?.("Swapping…");
  const data = encodeFunctionData({
    abi: DUAL_ROUTER_ABI,
    functionName: "swapExactInput",
    args: [assetArg(tokenIn), assetArg(tokenOut), amountIn, minOutRaw, to, deadline],
  });
  const value = isNativeTok(tokenIn) ? amountIn : 0n;

  // Validate the swap with a read-only simulation FIRST (retried through any
  // cold "missing revert data" blips). This warms the RPC and proves the swap
  // will succeed, so we never broadcast — and never spend gas on — a tx that
  // would revert. Only after a clean simulation do we send with a fixed gas
  // limit (no estimateGas), so the first real attempt goes through.
  const provider = getProvider();
  await callWithRetry(provider, { to: router, data, value, from: to });

  const tx = await sendTx(signer, { to: router, data, value }, 700000n);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error("Swap transaction failed.");
  return receipt;
}
