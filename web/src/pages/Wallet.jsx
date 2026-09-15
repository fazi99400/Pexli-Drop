import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import { WalletOnboard, WalletManager } from "../components/InAppWallet";
import { api, errMessage } from "../lib/functions";
import { ethers, explorerTxUrl } from "../lib/localWallet";
import { TX_TARGET_ADDRESS } from "../lib/chain";
import { SWAP_CONFIG, swapEnabled, NATIVE_PEX } from "../lib/swapConfig";
import { loadTokenUniverse, loadPools, poolFor, quote as swapQuote, executeSwap } from "../lib/swap";
import Icon from "../components/Icon";

// The wallet hub: unlock/create, manage, faucet, swap, send — all in-app.
export default function Wallet() {
  const { unlocked } = useWallet();

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="section-head">
        <h2 className="section-title">
          <Icon name="wallet" /> Wallet
        </h2>
      </div>

      {!unlocked ? (
        <WalletOnboard />
      ) : (
        <div className="stack">
          <WalletManager />
          <FaucetCard />
          <SwapCard />
          <SendToPexliCard />
        </div>
      )}
    </div>
  );
}

function TxLink({ hash }) {
  const url = explorerTxUrl(hash);
  const short = `${hash.slice(0, 10)}…${hash.slice(-8)}`;
  return url ? (
    <a className="mono" href={url} target="_blank" rel="noreferrer">
      {short} <Icon name="external" size={13} />
    </a>
  ) : (
    <span className="mono">{short}</span>
  );
}

// Cooldown helpers. Firestore Timestamps arrive over the callable as
// { _seconds, _nanoseconds } (sometimes ISO/number), so normalize to millis and
// compute how many minutes are left on a task's lock. Zero = ready now.
function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") {
    const d = Date.parse(ts);
    return Number.isNaN(d) ? 0 : d;
  }
  const s = ts._seconds ?? ts.seconds;
  return s != null ? s * 1000 : 0;
}
function cooldownRemainingMin(lastTs, lockHrs) {
  const last = toMillis(lastTs);
  if (!last || !lockHrs) return 0;
  const remainHrs = lockHrs - (Date.now() - last) / 3600000;
  return remainHrs > 0 ? Math.ceil(remainHrs * 60) : 0;
}
function fmtWait(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// --- Faucet: 1-click claim (server sends PEX to the wallet) ------------------
function FaucetCard() {
  const { config, profile, refreshProfile } = useAuth();
  const { refreshBalance } = useWallet();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const amount = config?.faucet?.amountPex || "0.05";
  const points = config?.points?.faucet ?? 20;
  const lockHrs = config?.locks?.faucetHrs ?? 24;
  const waitMin = cooldownRemainingMin(profile?.lastFaucetAt, lockHrs);
  const onCooldown = waitMin > 0;

  async function claim() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.claimFaucet();
      setMsg({ ok: true, hash: res.data.txHash, text: `Received ${res.data.amount} PEX (+${points} pts)` });
      setTimeout(() => refreshBalance(), 1500);
      refreshProfile();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3 className="card-title"><Icon name="faucet" /> Faucet</h3>
        <span className="badge">+{points} pts</span>
      </div>
      <p className="task-desc">
        Claim <b>{amount} PEX</b> straight to your wallet — one click, no external site. Available once every {config?.locks?.faucetHrs ?? 24}h.
      </p>
      <button className="btn btn-primary" onClick={claim} disabled={busy || onCooldown}>
        {busy ? "Sending…" : onCooldown ? `Available in ${fmtWait(waitMin)}` : `Claim ${amount} PEX`}
      </button>
      {msg && (
        <p className={`msg ${msg.ok ? "ok" : "err"}`}>
          {msg.text} {msg.ok && msg.hash && <TxLink hash={msg.hash} />}
        </p>
      )}
    </div>
  );
}

// --- Swap: fixed 0.0004 PEX in, user picks the token to receive -------------
// SDK-backed (pools + quote from @lifelox/dex-sdk), signed by the in-app wallet.
// Final safety net: swap.js already throws clean, specific messages for every
// outcome it controls (on-chain revert, still-pending, etc.) — this just
// catches anything else (a rejected signature, a generic network blip, or any
// other raw provider/ethers text) and makes sure the user never sees internal
// jargon like "missing revert data" or a raw JSON-RPC error.
function swapErrorMessage(e) {
  const raw = String(e?.shortMessage || e?.reason || e?.message || "");
  if (e?.pending) return raw; // swap.js's own "still confirming" message
  if (e?.reverted) return raw; // swap.js's own clean revert message
  if (/user rejected|user denied|ACTION_REJECTED/i.test(raw)) return "Swap cancelled.";
  if (/insufficient funds/i.test(raw)) return "Not enough PEX to cover the swap + gas.";
  if (/missing revert data|could not decode|CALL_EXCEPTION/i.test(raw)) {
    return "Swap didn't go through — the price likely moved. Try again.";
  }
  if (/network|timeout|fetch/i.test(raw)) return "Network hiccup — try again.";
  return raw || "Swap failed. Try again.";
}

function SwapCard() {
  const { signer, refreshBalance } = useWallet();
  const { config, profile, refreshProfile } = useAuth();
  const amount = SWAP_CONFIG.fixedAmountPex || "0.0004";
  const points = config?.points?.swap ?? 30;
  const lockHrs = config?.locks?.swapHrs ?? 12;
  const [pools, setPools] = useState(null);
  const [outTokens, setOutTokens] = useState([]); // tokens that have a PEX pool
  const [loadErr, setLoadErr] = useState("");
  const [outKey, setOutKey] = useState("");
  const [q, setQ] = useState(null);
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pendingHash, setPendingHash] = useState(null); // swapped, points not yet awarded

  const tokenOut = outTokens.find((t) => tokenKey(t) === outKey);
  const waitMin = cooldownRemainingMin(profile?.lastSwapAt, lockHrs);
  const onCooldown = waitMin > 0 && !pendingHash;

  // Award the swap-task points from the swap tx hash (idempotent server-side).
  async function awardSwap(hash) {
    setStep("Confirming…");
    try {
      const res = await api.verifyTxHash({ hash, taskType: "swap" });
      setMsg({ ok: true, hash: res.data.txHash, text: `Swap complete (+${points} pts)` });
      setPendingHash(null);
      refreshProfile();
    } catch (e) {
      setPendingHash(hash);
      setMsg({ ok: false, text: `Swap done, but awarding points failed (${e?.shortMessage || errMessage(e)}). Tap "Get points".` });
    }
  }

  // Load pools + the tokens that can actually be bought with PEX (a direct pool
  // with PEX). The user only chooses which of these to receive.
  useEffect(() => {
    if (!swapEnabled()) return;
    let alive = true;
    (async () => {
      try {
        const { pools: p, tokens: ts } = await loadTokenUniverse();
        const buyable = ts.filter((t) => tokenKey(t) !== "native" && poolFor(p, NATIVE_PEX, t));
        if (!alive) return;
        setPools(p);
        setOutTokens(buyable);
        if (buyable.length) setOutKey(tokenKey(buyable[0]));
      } catch (e) {
        if (alive) setLoadErr(e?.message || "Could not load pools.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Quote PEX -> selected token for the fixed amount.
  useEffect(() => {
    if (!pools || !tokenOut) {
      setQ(null);
      return;
    }
    try {
      setQ(swapQuote(pools, NATIVE_PEX, tokenOut, amount));
    } catch (e) {
      setQ(null);
    }
  }, [pools, outKey, tokenOut, amount]);

  if (!swapEnabled()) {
    return (
      <div className="panel">
        <h3 className="card-title"><Icon name="swap" /> Swap</h3>
        <p className="task-desc">In-app swap is being connected to the PexSwap DEX.</p>
      </div>
    );
  }

  async function doSwap() {
    if (!signer || !q?.pool || !tokenOut) return;
    // Gate on cooldown BEFORE signing so we never spend PEX on a swap that
    // can't earn points yet.
    const wait = cooldownRemainingMin(profile?.lastSwapAt, lockHrs);
    if (wait > 0) {
      setMsg({ ok: false, text: `Swap is on cooldown — try again in ${fmtWait(wait)}.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // Re-quote from FRESH reserves right before sending — the on-screen
      // quote can be a minute or more old (it's only recomputed when the
      // token picker changes), and that staleness — not the RPC — was the
      // usual reason a swap genuinely reverted on-chain. Falls back to the
      // already-shown quote if the refresh itself fails for any reason.
      setStep("Getting a fresh quote…");
      let fresh = q;
      try {
        const freshPools = await loadPools();
        const requoted = swapQuote(freshPools, NATIVE_PEX, tokenOut, amount);
        if (requoted) fresh = requoted;
      } catch (e) {
        /* keep the on-screen quote — executeSwap's own pre-flight simulation still guards it */
      }
      const receipt = await executeSwap(signer, {
        tokenIn: NATIVE_PEX,
        tokenOut,
        amountInHuman: amount,
        minOutRaw: fresh.minOutRaw,
        pool: fresh.pool,
        onStep: setStep,
      });
      setPendingHash(receipt.hash);
      setTimeout(() => refreshBalance(), 1500);
      await awardSwap(receipt.hash);
    } catch (e) {
      if (e?.pending && e?.txHash) {
        // Broadcast succeeded, just hasn't confirmed within our wait window —
        // this is NOT a failure. Reuse the same pending/"Get points" retry
        // flow as a slow point-award, instead of scaring the user with an
        // error for a swap that's still very likely to land.
        setPendingHash(e.txHash);
        setTimeout(() => refreshBalance(), 4000);
        setMsg({ ok: true, text: "Still confirming on-chain — tap \"Get points\" in a moment." });
      } else {
        setMsg({ ok: false, text: swapErrorMessage(e) });
      }
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  async function retrySwap() {
    setBusy(true);
    await awardSwap(pendingHash);
    setBusy(false);
    setStep("");
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3 className="card-title"><Icon name="swap" /> Swap</h3>
        <span className="badge">+{points} pts</span>
      </div>
      <p className="task-desc">
        Swap <b>{amount} PEX</b> for a token of your choice — one tap, signed by your own wallet.
        Earns points once every {lockHrs}h.
      </p>
      {!pools && !loadErr && <p className="subtle">Loading pools…</p>}
      {loadErr && <p className="msg err">{loadErr}</p>}
      {pools && outTokens.length === 0 && !loadErr && (
        <p className="subtle">No PEX pools available to swap yet.</p>
      )}
      {outTokens.length > 0 && (
        <>
          <div className="swap-row">
            <input className="task-input" readOnly value={`${amount} PEX`} />
            <span className="swap-arrow-sm">→</span>
            <select className="task-input wl-select" value={outKey} onChange={(e) => setOutKey(e.target.value)}>
              {outTokens.map((t) => (
                <option key={tokenKey(t)} value={tokenKey(t)}>{t.symbol}</option>
              ))}
            </select>
          </div>
          <p className="kv">
            You receive: <b className="accent">{q ? `${Number(q.amountOut).toFixed(6)} ${tokenOut?.symbol || ""}` : "…"}</b>
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={doSwap} disabled={busy || !q?.pool || onCooldown || !!pendingHash}>
              {busy ? (step || "Working…") : onCooldown ? `Available in ${fmtWait(waitMin)}` : `Swap ${amount} PEX`}
            </button>
            {pendingHash && (
              <button className="btn btn-sm" onClick={retrySwap} disabled={busy}>
                {busy ? "…" : "Get points"}
              </button>
            )}
          </div>
        </>
      )}
      {msg && (
        <p className={`msg ${msg.ok ? "ok" : "err"}`}>
          {msg.text} {msg.ok && msg.hash && <TxLink hash={msg.hash} />}
        </p>
      )}
    </div>
  );
}

function tokenKey(t) {
  if (!t) return "";
  if (t.key) return t.key;
  if (t.lane === "rust") return "rust:" + t.id;
  if (t.native || t.address === "0x0000000000000000000000000000000000000000") return "native";
  return "sol:" + String(t.address).toLowerCase();
}

// --- Transaction task: one-click send to the Pexli (faucet) address ---------
// No address field — it always goes to the fixed Pexli address and earns the
// tx-task points. Verified server-side by tx hash over RPC (no explorer).
function SendToPexliCard() {
  const { config, profile, refreshProfile } = useAuth();
  const { signer, refreshBalance } = useWallet();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState(null);
  const [pendingHash, setPendingHash] = useState(null); // sent, points not yet awarded
  const amount = config?.tx?.amountPex || "0.0004";
  const points = config?.points?.tx ?? 15;
  const lockHrs = config?.locks?.txHrs ?? 1;
  const waitMin = cooldownRemainingMin(profile?.lastTxAt, lockHrs);
  const onCooldown = waitMin > 0 && !pendingHash;

  // Award points for an already-sent tx (idempotent server-side). Kept separate
  // so a transient verify failure never loses the PEX the user already sent.
  async function awardFor(hash) {
    setStep("Confirming…");
    try {
      const res = await api.verifyTxHash({ hash, taskType: "tx" });
      setMsg({ ok: true, hash: res.data.txHash, text: `Sent ${amount} PEX (+${points} pts)` });
      setPendingHash(null);
      refreshProfile();
    } catch (e) {
      // The send succeeded; only the points step failed → let them retry it.
      setPendingHash(hash);
      setMsg({ ok: false, text: `PEX sent, but awarding points failed (${e?.shortMessage || errMessage(e)}). Tap "Get points".` });
    }
  }

  async function send() {
    if (!signer) return;
    // Gate on cooldown BEFORE sending so PEX is never spent when no points can
    // be earned yet.
    const wait = cooldownRemainingMin(profile?.lastTxAt, lockHrs);
    if (wait > 0) {
      setMsg({ ok: false, text: `Already sent recently — try again in ${fmtWait(wait)}.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      setStep("Sending…");
      const tx = await signer.sendTransaction({
        to: ethers.getAddress(TX_TARGET_ADDRESS),
        value: ethers.parseEther(String(amount)),
      });
      setPendingHash(tx.hash);
      // Wait for the tx to be mined before asking the server to verify it —
      // otherwise the RPC may not see it yet ("not visible on-chain").
      setStep("Confirming…");
      await tx.wait(1).catch(() => {});
      await awardFor(tx.hash);
      setTimeout(() => refreshBalance(), 1500);
    } catch (e) {
      setMsg({ ok: false, text: e?.shortMessage || errMessage(e) });
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  async function retry() {
    setBusy(true);
    await awardFor(pendingHash);
    setBusy(false);
    setStep("");
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3 className="card-title"><Icon name="send" /> Send to Pexli</h3>
        <span className="badge">+{points} pts</span>
      </div>
      <p className="task-desc">
        Send <b>{amount} PEX</b> to the Pexli address in one tap — no address to type — and earn points.
        Repeats every {config?.locks?.txHrs ?? 1}h.
      </p>
      <div className="row">
        <button className="btn btn-primary" onClick={send} disabled={busy || !!pendingHash || onCooldown}>
          {busy ? (step || "Working…") : onCooldown ? `Available in ${fmtWait(waitMin)}` : `Send ${amount} PEX`}
        </button>
        {pendingHash && (
          <button className="btn btn-sm" onClick={retry} disabled={busy}>
            {busy ? "…" : "Get points"}
          </button>
        )}
      </div>
      {msg && (
        <p className={`msg ${msg.ok ? "ok" : "err"}`}>
          {msg.text} {msg.ok && msg.hash && <TxLink hash={msg.hash} />}
        </p>
      )}
    </div>
  );
}
