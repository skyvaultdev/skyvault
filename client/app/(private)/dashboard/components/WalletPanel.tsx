"use client";

import { useEffect, useState, useCallback } from "react";
import "./WalletPanel.css";

type LedgerEntry = {
  id: number;
  order_id: number | null;
  type: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
};

type WithdrawalRequest = {
  id: number;
  amount: number;
  payout_method: string | null;
  payout_details: string | null;
  status: string;
  requested_at: string;
  requested_by_email: string | null;
  processed_by_email: string | null;
};

const LEDGER_TYPE_LABELS: Record<string, string> = {
  sale_credit: "Venda",
  withdrawal_debit: "Resgate",
  refund_debit: "Reembolso",
  adjustment: "Ajuste",
};

export default function WalletPanel() {
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, withdrawalsRes] = await Promise.all([
        fetch("/api/admin/wallet", { cache: "no-store" }),
        fetch("/api/admin/wallet/withdrawals", { cache: "no-store" }),
      ]);
      const walletJson = await walletRes.json();
      const withdrawalsJson = await withdrawalsRes.json();

      if (walletRes.ok) {
        setBalance(walletJson.data.balance);
        setLedger(walletJson.data.ledger);
      }
      if (withdrawalsRes.ok) setWithdrawals(withdrawalsJson.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleRequestWithdrawal(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount.replace(",", ".")), payoutMethod, payoutDetails }),
      });
      const json = await res.json();

      if (!res.ok) {
        setFeedback(json.error === "INSUFFICIENT_BALANCE" ? "Saldo insuficiente." : "Erro ao solicitar resgate.");
        return;
      }

      setAmount("");
      setPayoutMethod("");
      setPayoutDetails("");
      setFeedback("Resgate solicitado!");
      await loadAll();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Saldo da loja</h3>
        <p className="helperText">
          Extrato do caixa único e pedidos de resgate. Aprovação e pagamento dos resgates são feitos pelos
          devs (é a conta deles que processa o Pix) — aqui você só acompanha o status.
        </p>
      </div>

      <div className="walletBalanceCard">
        <span>Saldo disponível</span>
        <strong>R$ {balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
      </div>

      <form className="walletWithdrawForm" onSubmit={handleRequestWithdrawal}>
        <h4>Solicitar resgate</h4>
        <div className="walletFormRow">
          <input
            placeholder="Valor (R$)"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9,.]/g, ""))}
            required
          />
          <input
            placeholder="Método (Pix, transferência...)"
            value={payoutMethod}
            onChange={(e) => setPayoutMethod(e.target.value)}
          />
        </div>
        <input
          placeholder="Dados pra pagamento (chave Pix, conta...)"
          value={payoutDetails}
          onChange={(e) => setPayoutDetails(e.target.value)}
        />
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "Enviando..." : "Solicitar resgate"}
        </button>
        {feedback && <p className="helperText">{feedback}</p>}
      </form>

      <div className="walletSection">
        <h4>Pedidos de resgate</h4>
        {withdrawals.length === 0 && <p className="emptyMsg">Nenhum resgate solicitado.</p>}
        <div className="walletWithdrawalList">
          {withdrawals.map((w) => (
            <div key={w.id} className="walletWithdrawalRow">
              <div>
                <strong>R$ {Number(w.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                <span className={`walletStatusBadge status-${w.status}`}>{w.status}</span>
              </div>
              <span className="helperText">
                {w.payout_method} {w.payout_details ? `— ${w.payout_details}` : ""} · pedido por {w.requested_by_email}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="walletSection">
        <h4>Extrato</h4>
        {loading && <p>Carregando...</p>}
        <div className="walletLedgerList">
          {ledger.map((entry) => (
            <div key={entry.id} className="walletLedgerRow">
              <span>{LEDGER_TYPE_LABELS[entry.type] ?? entry.type}{entry.note ? ` — ${entry.note}` : ""}</span>
              <span className={Number(entry.amount) >= 0 ? "walletAmountPositive" : "walletAmountNegative"}>
                {Number(entry.amount) >= 0 ? "+" : ""}R$ {Number(entry.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
              <span className="helperText">{new Date(entry.created_at).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
