// Pool discovery — a framework-agnostic reader for the core (EVM) factory and
// the cross-lane (dual) factory, for anything embedding a swap UI outside the
// Lifelox frontend (which reads the same data through wagmi hooks, see
// frontend/src/hooks/usePools.ts — this is that logic without the React/wagmi
// dependency). Returns pool topology and reserves only, no token metadata
// (symbol/name/decimals) — combine with erc20.ts / rustlane.ts's metadata
// readers, or the caller's own token list, for that.
import { encodeFunctionData, decodeFunctionResult } from "viem";
import { NATIVE_PEX_ADDRESS } from "./constants.js";
export const FACTORY_ABI = [
    { type: "function", name: "allPairsLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "allPairs", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "address" }] },
];
export const PAIR_ABI = [
    { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
    { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
    { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ name: "reserve0", type: "uint112" }, { name: "reserve1", type: "uint112" }, { name: "blockTimestampLast", type: "uint32" }] },
];
// Cross-lane (dual) factory + pair. A pool side here is an Asset — a lane tag
// plus either a 0x address (Solidity) or a numeric id (Rust) — not a bare address.
const ASSET_OUT = [{ name: "lane", type: "uint8" }, { name: "token", type: "address" }, { name: "id", type: "uint64" }];
export const DUAL_FACTORY_ABI = [
    { type: "function", name: "allPairsLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "allPairs", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "address" }] },
];
export const DUAL_PAIR_ABI = [
    { type: "function", name: "asset0", stateMutability: "view", inputs: [], outputs: ASSET_OUT },
    { type: "function", name: "asset1", stateMutability: "view", inputs: [], outputs: ASSET_OUT },
    { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ name: "reserve0", type: "uint112" }, { name: "reserve1", type: "uint112" }, { name: "blockTimestampLast", type: "uint32" }] },
];
async function readPairAddresses(client, factory) {
    const lenData = await client.call({ to: factory, data: encodeFunctionData({ abi: FACTORY_ABI, functionName: "allPairsLength" }) });
    const length = decodeFunctionResult({ abi: FACTORY_ABI, functionName: "allPairsLength", data: (lenData.data ?? "0x0") });
    const indices = Array.from({ length: Number(length) }, (_, i) => BigInt(i));
    return Promise.all(indices.map(async (i) => {
        const res = await client.call({ to: factory, data: encodeFunctionData({ abi: FACTORY_ABI, functionName: "allPairs", args: [i] }) });
        return decodeFunctionResult({ abi: FACTORY_ABI, functionName: "allPairs", data: (res.data ?? "0x0") });
    }));
}
/** Read every pool on the core (EVM) factory. Both sides are Solidity/native 0x addresses. */
export async function listCorePools(client, factory) {
    const pairs = await readPairAddresses(client, factory);
    return Promise.all(pairs.map(async (pair) => {
        const [t0, t1, res] = await Promise.all([
            client.call({ to: pair, data: encodeFunctionData({ abi: PAIR_ABI, functionName: "token0" }) }),
            client.call({ to: pair, data: encodeFunctionData({ abi: PAIR_ABI, functionName: "token1" }) }),
            client.call({ to: pair, data: encodeFunctionData({ abi: PAIR_ABI, functionName: "getReserves" }) }),
        ]);
        const token0 = decodeFunctionResult({ abi: PAIR_ABI, functionName: "token0", data: (t0.data ?? "0x0") });
        const token1 = decodeFunctionResult({ abi: PAIR_ABI, functionName: "token1", data: (t1.data ?? "0x0") });
        const reserves = decodeFunctionResult({ abi: PAIR_ABI, functionName: "getReserves", data: (res.data ?? "0x0") });
        return {
            pair,
            source: "core",
            side0: { lane: "solidity", address: token0 },
            side1: { lane: "solidity", address: token1 },
            reserve0: reserves[0],
            reserve1: reserves[1],
        };
    }));
}
/** Read every pool on the cross-lane (dual) factory. A side can be Rust-lane (numeric id) or Solidity/native. */
export async function listDualPools(client, factory) {
    const pairs = await readPairAddresses(client, factory);
    // asset(lane, token, id): 0 = Solidity (use token), 1 = Rust (use id),
    // 2 = native PEX — the UI's sentinel address, not whatever `token` holds.
    const toSide = (a) => Number(a[0]) === 1 ? { lane: "rust", id: Number(a[2]) } : { lane: "solidity", address: Number(a[0]) === 2 ? NATIVE_PEX_ADDRESS : a[1] };
    return Promise.all(pairs.map(async (pair) => {
        const [a0, a1, res] = await Promise.all([
            client.call({ to: pair, data: encodeFunctionData({ abi: DUAL_PAIR_ABI, functionName: "asset0" }) }),
            client.call({ to: pair, data: encodeFunctionData({ abi: DUAL_PAIR_ABI, functionName: "asset1" }) }),
            client.call({ to: pair, data: encodeFunctionData({ abi: DUAL_PAIR_ABI, functionName: "getReserves" }) }),
        ]);
        const asset0 = decodeFunctionResult({ abi: DUAL_PAIR_ABI, functionName: "asset0", data: (a0.data ?? "0x0") });
        const asset1 = decodeFunctionResult({ abi: DUAL_PAIR_ABI, functionName: "asset1", data: (a1.data ?? "0x0") });
        const reserves = decodeFunctionResult({ abi: DUAL_PAIR_ABI, functionName: "getReserves", data: (res.data ?? "0x0") });
        return {
            pair,
            source: "dual",
            side0: toSide(asset0),
            side1: toSide(asset1),
            reserve0: reserves[0],
            reserve1: reserves[1],
        };
    }));
}
/**
 * Read every pool a swap widget could draw on: the core factory (if given)
 * plus the dual (cross-lane) factory (if given). Pass just one to read just
 * that factory — e.g. the core factory alone for an EVM-only widget.
 */
export async function listPools(client, factories) {
    const [core, dual] = await Promise.all([
        factories.core ? listCorePools(client, factories.core) : Promise.resolve([]),
        factories.dual ? listDualPools(client, factories.dual) : Promise.resolve([]),
    ]);
    return [...core, ...dual];
}
const sideKey = (s) => (s.lane === "rust" ? `rust:${s.id}` : `sol:${s.address.toLowerCase()}`);
/** True when a pool has this exact side (Solidity/native address or Rust id). */
export function poolHasSide(pool, side) {
    const k = sideKey(side);
    return sideKey(pool.side0) === k || sideKey(pool.side1) === k;
}
/** Every pool that includes this token — narrows a "swap with X" picker down from `listPools()`'s full set. */
export function poolsForSide(pools, side) {
    return pools.filter((p) => poolHasSide(p, side));
}
/** The pool(s) that connect these two exact sides directly. Usually one — can be two if both the core and the dual factory have the same pair. */
export function findPools(pools, a, b) {
    const ka = sideKey(a);
    const kb = sideKey(b);
    return pools.filter((p) => {
        const k0 = sideKey(p.side0);
        const k1 = sideKey(p.side1);
        return (k0 === ka && k1 === kb) || (k0 === kb && k1 === ka);
    });
}
/** Reserves for `side` as (thisReserve, otherReserve) within a given pool. */
export function reservesFor(pool, side) {
    return sideKey(pool.side0) === sideKey(side)
        ? { thisReserve: pool.reserve0, otherReserve: pool.reserve1 }
        : { thisReserve: pool.reserve1, otherReserve: pool.reserve0 };
}
