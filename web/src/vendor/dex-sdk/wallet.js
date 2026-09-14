// Wallet connection for Lifelox — EIP-6963 discovery with EIP-1193 fallback.
//
// Discovers the "Lifelox" provider announced via EIP-6963 (rdns
// "xyz.lifelox.wallet"), connects with eth_requestAccounts, verifies the chain
// is Pexli (78901), and wires accountsChanged / chainChanged.
import { PEXLI_CHAIN_ID, LIFELOX_WALLET_RDNS, LIFELOX_WALLET_NAME } from "./constants.js";
const getWin = (win) => win ?? (typeof window !== "undefined" ? window : undefined);
/**
 * Collect all EIP-6963 providers currently announcing. Resolves after a short
 * tick so wallets have time to respond to the request event.
 */
export function discoverProviders(win, waitMs = 300) {
    const w = getWin(win);
    return new Promise((resolve) => {
        if (!w)
            return resolve([]);
        const found = new Map();
        const onAnnounce = (event) => {
            const detail = event.detail;
            if (detail?.info?.uuid)
                found.set(detail.info.uuid, detail);
        };
        w.addEventListener("eip6963:announceProvider", onAnnounce);
        const Evt = w.CustomEvent ?? globalThis.CustomEvent;
        w.dispatchEvent(new Evt("eip6963:requestProvider"));
        setTimeout(() => {
            w.removeEventListener("eip6963:announceProvider", onAnnounce);
            resolve([...found.values()]);
        }, waitMs);
    });
}
/**
 * Find the Lifelox provider: prefer the EIP-6963 rdns match, then a name match,
 * then fall back to window.ethereum (single-provider wallets).
 */
export async function getLifeloxProvider(win, waitMs = 300) {
    const details = await discoverProviders(win, waitMs);
    const byRdns = details.find((d) => d.info.rdns === LIFELOX_WALLET_RDNS);
    if (byRdns)
        return byRdns.provider;
    const byName = details.find((d) => d.info.name === LIFELOX_WALLET_NAME);
    if (byName)
        return byName.provider;
    return getWin(win)?.ethereum; // EIP-1193 fallback
}
/** Connect: request accounts, read chainId, flag if not Pexli. */
export async function connectLifelox(win) {
    const provider = await getLifeloxProvider(win);
    if (!provider)
        throw new Error("Lifelox wallet not found. Install it or open in the Lifelox in-app browser.");
    const accounts = (await provider.request({ method: "eth_requestAccounts" }));
    if (!accounts?.length)
        throw new Error("No account authorized.");
    const chainHex = (await provider.request({ method: "eth_chainId" }));
    const chainId = Number(chainHex);
    return {
        provider,
        address: accounts[0],
        chainId,
        onChainWrong: chainId !== PEXLI_CHAIN_ID,
    };
}
/** Ask the wallet to switch to Pexli (78901). */
export async function switchToPexli(provider) {
    const hexId = "0x" + PEXLI_CHAIN_ID.toString(16);
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
}
/** Subscribe to account/chain changes. Returns an unsubscribe function. */
export function watchWallet(provider, handlers) {
    const onAcc = (...a) => handlers.onAccountsChanged?.(a[0] ?? []);
    const onChain = (...a) => handlers.onChainChanged?.(Number(a[0]));
    provider.on?.("accountsChanged", onAcc);
    provider.on?.("chainChanged", onChain);
    return () => {
        provider.removeListener?.("accountsChanged", onAcc);
        provider.removeListener?.("chainChanged", onChain);
    };
}
