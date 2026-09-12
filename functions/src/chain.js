// On-chain access for the Pexli EVM chain.
//
// Two strategies, picked by what the owner configured:
//  1. Explorer API (preferred for faucet/swap) — an Etherscan/Blockscout-style
//     endpoint. Cheap, indexed "did address X receive from / send to Y" queries.
//  2. Raw RPC via ethers (used for the tx-per-hour nonce check) — always
//     available as long as PEXLI_RPC_URL is set.
const { ethers } = require("ethers");
const { HttpsError } = require("firebase-functions/v2/https");
const params = require("./params");

let _provider = null;
function getProvider() {
  const rpc = params.PEXLI_RPC_URL.value();
  if (!rpc) {
    throw new HttpsError(
      "failed-precondition",
      "Chain RPC not configured. Set PEXLI_RPC_URL (from chainlist.org/chain/78901).",
    );
  }
  if (!_provider) {
    const chainId = Number(params.PEXLI_CHAIN_ID.value()) || 78901;
    _provider = new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
  }
  return _provider;
}

function lc(addr) {
  return String(addr || "").toLowerCase();
}

// Current outbound tx count (nonce). Used by the tx-per-hour task: if the nonce
// has grown since the last one we stored, the user made at least one new tx.
async function getNonce(address) {
  const provider = getProvider();
  return provider.getTransactionCount(lc(address), "latest");
}

async function getBlockNumber() {
  return getProvider().getBlockNumber();
}

// Fetch this address's transaction list from the explorer API. Etherscan and
// Blockscout both expose ?module=account&action=txlist. Returns [] if no
// explorer is configured (callers should surface a clear error instead).
async function explorerTxList(address, startBlock = 0) {
  const base = params.PEXLI_EXPLORER_API.value();
  if (!base) return null; // signal "no explorer configured"
  const url =
    `${base.replace(/\/+$/, "")}?module=account&action=txlist` +
    `&address=${lc(address)}&startblock=${startBlock}&endblock=99999999` +
    `&sort=desc&page=1&offset=200`;
  const res = await fetch(url, {
    headers: { "User-Agent": "PexliAirdropBot/1.0" },
  });
  if (!res.ok) {
    throw new HttpsError("unavailable", "Chain explorer request failed.");
  }
  const json = await res.json();
  // status "1" = ok with results; "0" + "No transactions found" = empty.
  if (json.status === "1" && Array.isArray(json.result)) return json.result;
  if (json.status === "0" && /no transactions/i.test(json.message || "")) return [];
  if (Array.isArray(json.result)) return json.result;
  return [];
}

// Did `address` RECEIVE a native transfer FROM `fromAddr` after block cursor?
// Returns the matching tx {hash, blockNumber} or null.
async function findIncomingFrom(address, fromAddr, sinceBlock = 0) {
  const txs = await explorerTxList(address, sinceBlock);
  if (txs === null) {
    throw new HttpsError(
      "failed-precondition",
      "Faucet verification needs PEXLI_EXPLORER_API configured.",
    );
  }
  const from = lc(fromAddr);
  const to = lc(address);
  for (const t of txs) {
    if (
      lc(t.from) === from &&
      lc(t.to) === to &&
      Number(t.blockNumber) > Number(sinceBlock) &&
      (t.isError === "0" || t.isError === undefined) &&
      BigInt(t.value || "0") > 0n
    ) {
      return { hash: t.hash, blockNumber: Number(t.blockNumber) };
    }
  }
  return null;
}

// Did `address` SEND a tx TO `toAddr` (e.g. the DEX router) after block cursor?
// Returns the matching tx {hash, blockNumber} or null.
async function findOutgoingTo(address, toAddr, sinceBlock = 0) {
  const txs = await explorerTxList(address, sinceBlock);
  if (txs === null) {
    throw new HttpsError(
      "failed-precondition",
      "Swap verification needs PEXLI_EXPLORER_API configured.",
    );
  }
  const from = lc(address);
  const to = lc(toAddr);
  for (const t of txs) {
    if (
      lc(t.from) === from &&
      lc(t.to) === to &&
      Number(t.blockNumber) > Number(sinceBlock) &&
      (t.isError === "0" || t.isError === undefined)
    ) {
      return { hash: t.hash, blockNumber: Number(t.blockNumber) };
    }
  }
  return null;
}

// Basic address validity + checksum normalization.
function normalizeAddress(address) {
  try {
    return ethers.getAddress(String(address).trim()); // throws if invalid
  } catch (e) {
    throw new HttpsError("invalid-argument", "That is not a valid wallet address.");
  }
}

module.exports = {
  getProvider,
  getNonce,
  getBlockNumber,
  explorerTxList,
  findIncomingFrom,
  findOutgoingTo,
  normalizeAddress,
  lc,
};
