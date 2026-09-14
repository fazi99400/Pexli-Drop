import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import { WalletOnboard, WalletManager } from "../components/InAppWallet";
import { api, errMessage } from "../lib/functions";
import { ethers, explorerTxUrl } from "../lib/localWallet";
import { TX_TARGET_ADDRESS } from "../lib/chain";
import { SWAP_CONFIG, swapEnabled, NATIVE_PEX } from "../lib/swapConfig";
import { loadTokenUniverse, poolFor, quote as swapQuote, executeSwap } from "../lib/swap";
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

// --- Faucet: 1-click claim (server sends PEX to the wallet) ------------------
function FaucetCard() {
  const { config, refreshProfile } = useAuth();
  const { refreshBalance } = useWallet();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const amount = config?.faucet?.amountPex || "0.05";
  const points = config?.points?.faucet ?? 20;

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
      <button className="btn btn-primary" onClick={claim} disabled={busy}>
        {busy ? "Sending…" : `Claim ${amount} PEX`}
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
function SwapCard() {
  const { signer, refreshBalance } = useWallet();
  const amount = SWAP_CONFIG.fixedAmountPex || "0.0004";
  const [pools, setPools] = useState(null);
  const [outTokens, setOutTokens] = useState([]); // tokens that have a PEX pool
  const [loadErr, setLoadErr] = useState("");
  const [outKey, setOutKey] = useState("");
  const [q, setQ] = useState(null);
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const tokenOut = outTokens.find((t) => tokenKey(t) === outKey);

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
    setBusy(true);
    setMsg(null);
    try {
      const receipt = await executeSwap(signer, {
        tokenIn: NATIVE_PEX,
        tokenOut,
        amountInHuman: amount,
        minOutRaw: q.minOutRaw,
        pool: q.pool,
        onStep: setStep,
      });
      setMsg({ ok: true, hash: receipt.hash, text: "Swap complete" });
      setTimeout(() => refreshBalance(), 1500);
    } catch (e) {
      setMsg({ ok: false, text: e?.shortMessage || e?.reason || e?.message || "Swap failed." });
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <div className="panel">
      <h3 className="card-title"><Icon name="swap" /> Swap</h3>
      <p className="task-desc">
        Swap <b>{amount} PEX</b> for a token of your choice — one tap, signed by your own wallet.
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
          <button className="btn btn-primary" onClick={doSwap} disabled={busy || !q?.pool}>
            {busy ? (step || "Working…") : `Swap ${amount} PEX`}
          </button>
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
  const { config, refreshProfile } = useAuth();
  const { signer, refreshBalance } = useWallet();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState(null);
  const [pendingHash, setPendingHash] = useState(null); // sent, points not yet awarded
  const amount = config?.tx?.amountPex || "0.0004";
  const points = config?.points?.tx ?? 15;

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
        <button className="btn btn-primary" onClick={send} disabled={busy || !!pendingHash}>
          {busy ? (step || "Working…") : `Send ${amount} PEX`}
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
