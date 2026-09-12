// Wallet connect for MetaMask / TrustWallet (EIP-1193). Auto-adds the Pexli
// network via wallet_addEthereumChain — one click, no manual RPC entry.
import { PEXLI_CHAIN } from "./chain";

function getProvider() {
  const eth = window.ethereum;
  if (!eth) {
    throw new Error(
      "No EVM wallet found. Open this page in MetaMask or TrustWallet's dApp browser.",
    );
  }
  return eth;
}

// Ask the wallet to add / switch to Pexli. Safe to call repeatedly.
export async function addPexliNetwork() {
  const eth = getProvider();
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: PEXLI_CHAIN.chainId }],
    });
  } catch (err) {
    // 4902 = chain not added yet → add it.
    if (err?.code === 4902 || /Unrecognized chain/i.test(err?.message || "")) {
      if (PEXLI_CHAIN.rpcUrls.length === 0) {
        throw new Error("Pexli RPC URL is not configured yet.");
      }
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [PEXLI_CHAIN],
      });
    } else {
      throw err;
    }
  }
}

// Connect and return the first account (lowercased). Adds the network too.
export async function connectWallet() {
  const eth = getProvider();
  const accounts = await eth.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) throw new Error("No account selected.");
  try {
    await addPexliNetwork();
  } catch (e) {
    // Network add is best-effort; still return the address.
    console.warn("addPexliNetwork:", e?.message);
  }
  return accounts[0];
}
