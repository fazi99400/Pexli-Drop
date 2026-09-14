// Swap quotes.
//
// getAmountsOut() asks the deployed router — an exact match for what the swap
// tx will actually execute against, since it's the same call the router makes
// internally. quoteFromReserves() is the identical constant-product formula
// computed locally from reserves already in hand (e.g. from pools.ts), for a
// quote with no extra RPC round trip. bestDirectPool() picks the best-quoting
// pool when more than one connects two tokens directly (e.g. the same pair
// exists on both the core and the dual factory).
//
// This DEX is Uniswap-V2-style: pools are direct pairs, and there is no
// multi-hop router. "Search all pools" here means exactly that — every direct
// pool between two tokens — not pathfinding through an intermediate token.
import { encodeFunctionData, decodeFunctionResult } from "viem";
import { ROUTER_ABI } from "./router.js";
import { poolHasSide, poolsForSide, reservesFor } from "./pools.js";
/** Ask the router for amounts along `path` — the same call the swap tx settles against. */
export async function getAmountsOut(client, router, amountIn, path) {
    const data = encodeFunctionData({ abi: ROUTER_ABI, functionName: "getAmountsOut", args: [amountIn, path] });
    const res = await client.call({ to: router, data });
    return decodeFunctionResult({ abi: ROUTER_ABI, functionName: "getAmountsOut", data: (res.data ?? "0x0") });
}
/**
 * The Uniswap-V2 constant-product quote with the 0.30% fee — the exact
 * formula the routers implement on-chain (see docs/ARCHITECTURE.md). Useful
 * to price a swap from reserves already in hand, with no RPC round trip.
 */
export function quoteFromReserves(amountIn, reserveIn, reserveOut) {
    if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n)
        return 0n;
    const amountInWithFee = amountIn * 997n;
    return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
}
/**
 * Every pool directly connecting `tokenIn` and `tokenOut`, priced from their
 * reserves, best output first. Empty when nothing connects them directly —
 * this DEX has no multi-hop route to fall back to.
 */
export function quoteDirectPools(pools, tokenIn, tokenOut, amountIn) {
    const candidates = poolsForSide(pools, tokenIn).filter((p) => poolHasSide(p, tokenOut));
    return candidates
        .map((pool) => {
        const { thisReserve, otherReserve } = reservesFor(pool, tokenIn);
        return { pool, amountOut: quoteFromReserves(amountIn, thisReserve, otherReserve) };
    })
        .sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
}
/**
 * The best-quoting pool for tokenIn -> tokenOut, out of every pool that
 * connects them directly — "use whichever pool has this pair" instead of the
 * caller having to already know core vs. dual. Undefined when no pool
 * connects the two tokens directly.
 */
export function bestDirectPool(pools, tokenIn, tokenOut, amountIn) {
    return quoteDirectPools(pools, tokenIn, tokenOut, amountIn)[0];
}
