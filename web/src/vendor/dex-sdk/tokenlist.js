// Shared token-list schema used by BOTH the Lifelox wallet and the DEX.
export const isRust = (t) => t.lane === "rust";
export const isNative = (t) => t.standard === "native";
/** Validate a token list against the schema. Throws on the first problem. */
export function validateTokenList(list) {
    if (!list.tokens?.length)
        throw new Error("token list has no tokens");
    for (const t of list.tokens) {
        if (!t.symbol || typeof t.decimals !== "number")
            throw new Error(`bad token entry: ${JSON.stringify(t)}`);
        if (t.lane === "rust" && typeof t.id !== "number")
            throw new Error(`rust-lane token ${t.symbol} must have a numeric id`);
        if (t.lane === "solidity" && !t.address)
            throw new Error(`solidity-lane token ${t.symbol} must have an address`);
    }
}
