import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import { WalletOnboard, WalletManager } from "../components/InAppWallet";
import { api, errMessage } from "../lib/functions";
import { ethers, explorerTxUrl } from "../lib/localWallet";
import { TX_TARGET_ADDRESS } from "../lib/chain";
import { SWAP_CONFIG, swapEnabled } from "../lib/swapConfig";
import { getQuote, executeSwap } from "../lib/swap";
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

// --- Swap: in-page, signed by the in-browser wallet -------------------------
function SwapCard() {
  const { signer, refreshBalance } = useWallet();
  const tokens = SWAP_CONFIG.tokens;
  const [inIdx, setInIdx] = useState(0);
  const [outIdx, setOutIdx] = useState(1);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const tokenIn = tokens[inIdx];
  const tokenOut = tokens[outIdx];
  const canQuote = swapEnabled() && tokenIn && tokenOut && inIdx !== outIdx && Number(amount) > 0;

  useEffect(() => {
    if (!canQuote) {
      setQuote(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const q = await getQuote(tokenIn, tokenOut, amount);
        if (alive) setQuote(q);
      } catch (e) {
        if (alive) setQuote(null);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [amount, inIdx, outIdx, canQuote, tokenIn, tokenOut]);

  if (!swapEnabled()) {
    return (
      <div className="panel">
        <h3 className="card-title"><Icon name="swap" /> Swap</h3>
        <p className="task-desc">
          In-app swap is being connected to the PexSwap router. It will appear here — no redirect to any DEX.
        </p>
      </div>
    );
  }

  function flip() {
    setInIdx(outIdx);
    setOutIdx(inIdx);
    setQuote(null);
  }

  async function doSwap() {
    if (!signer || !quote) return;
    setBusy(true);
    setMsg(null);
    try {
      const receipt = await executeSwap(signer, {
        tokenIn,
        tokenOut,
        amountInHuman: amount,
        minOutRaw: quote.minOutRaw,
        onStep: setStep,
      });
      setMsg({ ok: true, hash: receipt.hash, text: "Swap complete" });
      setAmount("");
      setQuote(null);
      setTimeout(() => refreshBalance(), 1500);
    } catch (e) {
      setMsg({ ok: false, text: e?.reason || e?.message || "Swap failed." });
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <div className="panel">
      <h3 className="card-title"><Icon name="swap" /> Swap</h3>
      <div className="swap-row">
        <input className="task-input" type="number" min="0" placeholder="0.0" value={amount}
          onChange={(e) => setAmount(e.target.value)} />
        <select className="task-input wl-select" value={inIdx} onChange={(e) => setInIdx(Number(e.target.value))}>
          {tokens.map((t, i) => <option key={t.symbol} value={i}>{t.symbol}</option>)}
        </select>
      </div>
      <div className="swap-flip"><button className="btn btn-sm btn-ghost" onClick={flip}>↓ swap</button></div>
      <div className="swap-row">
        <input className="task-input" readOnly placeholder="0.0"
          value={quote ? Number(quote.amountOut).toFixed(6) : ""} />
        <select className="task-input wl-select" value={outIdx} onChange={(e) => setOutIdx(Number(e.target.value))}>
          {tokens.map((t, i) => <option key={t.symbol} value={i}>{t.symbol}</option>)}
        </select>
      </div>
      {inIdx === outIdx && <p className="subtle">Pick two different tokens.</p>}
      <button className="btn btn-primary mt" onClick={doSwap} disabled={busy || !quote || inIdx === outIdx}>
        {busy ? (step || "Working…") : "Swap"}
      </button>
      {msg && (
        <p className={`msg ${msg.ok ? "ok" : "err"}`}>
          {msg.text} {msg.ok && msg.hash && <TxLink hash={msg.hash} />}
        </p>
      )}
    </div>
  );
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
