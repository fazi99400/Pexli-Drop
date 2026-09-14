// Rust-lane PXC token support.
//
// Rust-lane tokens do NOT have their own ERC-20 contract. Their state lives in
// the RUSTVM system account's storage, keyed by a numeric token `id`. This
// module implements the exact storage-key derivation and operation calldata
// layout documented by pexli-stf, so the wallet can read balances and build
// transfer/settlement transactions.
//
// Storage key (balance):  keccak256( ns(1) || id(8, big-endian) || holder(20) )
// Operation calldata:     op(1) || id(8, big-endian) || to(20) || amount(8, big-endian)
import { keccak256, concatBytes, bytesToHex, toBytes, pad, numberToBytes, hexToBigInt, } from "viem";
import { BRIDGE, NS, OP, PXC_BRIDGE_ADDRESS, RUSTVM_ADDRESS } from "./constants.js";
/** 8-byte big-endian encoding of a token id or amount (u64). */
export function u64be(value) {
    const v = BigInt(value);
    if (v < 0n || v > 0xffffffffffffffffn)
        throw new Error("u64be: out of range");
    return numberToBytes(v, { size: 8 });
}
/** 20-byte address encoding. */
function addr20(a) {
    return toBytes(pad(a, { size: 20 }));
}
/**
 * Storage slot for a holder's balance of Rust-lane token `id` in namespace `ns`.
 * = keccak256( ns(1) || id_be8 || holder20 )
 */
export function rustBalanceSlot(id, holder, ns = NS.PXC20) {
    const preimage = concatBytes([Uint8Array.of(ns), u64be(id), addr20(holder)]);
    return keccak256(preimage);
}
/**
 * Calldata for a Rust-lane operation.
 * = op(1) || id_be8 || to20 || amount_be8   (37 bytes)
 */
export function encodeRustOp(op, id, to, amount) {
    return bytesToHex(concatBytes([Uint8Array.of(op & 0xff), u64be(id), addr20(to), u64be(amount)]));
}
/** Convenience: calldata for a PXC-20 transfer (op XFER_20). */
export function encodePxc20Transfer(id, to, amount) {
    return encodeRustOp(OP.XFER_20, id, to, amount);
}
/** Read a Rust-lane token balance via eth_getStorageAt on the RUSTVM account. */
export async function rustBalanceOf(client, id, holder, ns = NS.PXC20, rustvm = RUSTVM_ADDRESS) {
    const slot = rustBalanceSlot(id, holder, ns);
    const raw = await client.getStorageAt({ address: rustvm, slot });
    if (!raw || raw === "0x")
        return 0n;
    return hexToBigInt(raw);
}
/* ------------------------------------------------------------------ */
/* Metadata — the Rust-lane answer to ERC-20 name()/symbol()/decimals() */
/* ------------------------------------------------------------------ */
/** Calldata for a bridge read: selector(1) || id_be8 (9 bytes). */
export function encodeBridgeRead(selector, id) {
    return bytesToHex(concatBytes([Uint8Array.of(selector & 0xff), u64be(id)]));
}
/** Decode a right-padded utf-8 `bytes32` word ("RGOLD\0\0…") into a string. */
export function decodeBytes32String(word) {
    if (!word || word === "0x")
        return "";
    let bytes;
    try {
        bytes = toBytes(word);
    }
    catch {
        return "";
    }
    const end = bytes.indexOf(0);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, end === -1 ? bytes.length : end));
    return text.replace(/[\u0000-\u001f\u007f\ufffd]/g, "").trim();
}
/**
 * Read a Rust-lane token's name, symbol and decimals through the bridge
 * precompile. Metadata is optional on this chain: unset fields come back empty
 * and callers should fall back to `PXC #id` rather than render an empty symbol.
 */
export async function fetchRustTokenMeta(client, id, bridge = PXC_BRIDGE_ADDRESS) {
    const read = async (selector) => {
        try {
            const res = await client.call({ to: bridge, data: encodeBridgeRead(selector, id) });
            return res?.data;
        }
        catch {
            return undefined; // no bridge / no metadata for this id
        }
    };
    const [symWord, nameWord, decWord] = await Promise.all([
        read(BRIDGE.SYMBOL),
        read(BRIDGE.NAME),
        read(BRIDGE.DECIMALS),
    ]);
    const symbol = decodeBytes32String(symWord);
    const name = decodeBytes32String(nameWord);
    let decimals = 0;
    if (decWord && decWord !== "0x") {
        const d = Number(hexToBigInt(decWord));
        if (Number.isFinite(d) && d >= 0 && d <= 36)
            decimals = d;
    }
    return { symbol, name, decimals, hasMetadata: !!symbol || !!name };
}
/**
 * Build an unsigned transaction that performs a Rust-lane PXC-20 transfer.
 * The wallet signs and sends this (EIP-1193 eth_sendTransaction).
 */
export function buildRustTransferTx(id, to, amount, rustvm = RUSTVM_ADDRESS) {
    return { to: rustvm, data: encodePxc20Transfer(id, to, amount), value: "0x0" };
}
