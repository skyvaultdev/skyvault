"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./reseller.css";
import { useModal } from "@/app/(components)/modal/ModalProvider";

type ResellerStatus = "invited" | "pending" | "approved" | "rejected" | "suspended";

type ResellerProduct = {
  product_id: number;
  product_name: string;
  slug: string;
  price: number;
  commission_percent: number;
  referralLink: string;
};

type Commission = {
  id: number;
  order_id: number;
  product_name: string;
  sale_amount: number;
  commission_percent: number;
  commission_amount: number;
  status: "confirmed" | "cancelled" | "paid";
  created_at: string;
  paid_at: string | null;
};

type PayoutRequest = {
  id: number;
  amount: number;
  status: "requested" | "approved" | "rejected" | "paid";
  requested_at: string;
  resolved_at: string | null;
  note: string | null;
};

type MeResponse = {
  reseller: { id?: number; status: ResellerStatus; referralCode?: string; displayName?: string | null; note?: string | null } | null;
  products?: ResellerProduct[];
  commissions?: Commission[];
  payoutRequests?: PayoutRequest[];
  balanceDue?: number;
  totalPaid?: number;
  hasPendingPayoutRequest?: boolean;
  hasPixKey?: boolean;
};

const STATUS_LABELS: Record<ResellerStatus, string> = {
  invited: "Convite pendente",
  pending: "Sua candidatura está em análise",
  approved: "Aprovado",
  rejected: "Convite recusado / candidatura não aprovada",
  suspended: "Conta suspensa",
};

function money(value: number | string) {
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function ResellerPage() {
  const router = useRouter();
  const modal = useModal();
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [data, setData] = useState<MeResponse | null>(null);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reseller/me", { cache: "no-store" });
      if (res.status === 401) {
        setUnauthenticated(true);
        return;
      }
      const json = await res.json();
      setData(res.ok ? json.data : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestPayout() {
    setRequestingPayout(true);
    try {
      const res = await fetch("/api/reseller/payout-requests", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        await modal.alert(
          json.error === "NO_BALANCE_AVAILABLE" ? "Você não tem saldo disponível pra sacar ainda."
          : json.error === "MISSING_PIX_KEY" ? "Cadastre sua chave PIX no seu perfil antes de solicitar um saque."
          : "Não foi possível solicitar o saque."
        );
        return;
      }
      await modal.alert("Solicitação de saque enviada! A loja vai revisar e marcar como paga assim que resolver.");
      await load();
    } finally {
      setRequestingPayout(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
      setTimeout(() => setCopiedLink((current) => (current === link ? null : current)), 2000);
    } catch {
      await modal.alert("Não foi possível copiar o link — copie manualmente.");
    }
  }

  if (loading) {
    return (
      <main className="resellerPage">
        <div className="resellerCard2">Carregando...</div>
      </main>
    );
  }

  if (unauthenticated) {
    return (
      <main className="resellerPage">
        <div className="resellerCard2">
          <h1>Área do revendedor</h1>
          <p className="resellerHint">Você precisa estar logado pra acessar essa área.</p>
          <button className="resellerBtnPrimary" onClick={() => router.push("/login")}>Entrar</button>
        </div>
      </main>
    );
  }

  if (!data?.reseller) {
    return (
      <main className="resellerPage">
        <div className="resellerCard2">
          <h1>Área do revendedor</h1>
          <p className="resellerHint">
            O programa de revendedores é por convite — a loja escolhe quem convida. Se você for convidado, o convite
            aparece na aba de <strong>Notificações</strong> pra você aceitar.
          </p>
        </div>
      </main>
    );
  }

  if (data.reseller.status === "invited") {
    return (
      <main className="resellerPage">
        <div className="resellerCard2">
          <h1>Você tem um convite pendente</h1>
          <p className="resellerHint">
            Você foi convidado pra ser revendedor. Acesse a aba de <strong>Notificações</strong> pra aceitar ou
            recusar o convite.
          </p>
        </div>
      </main>
    );
  }

  if (data.reseller.status !== "approved") {
    return (
      <main className="resellerPage">
        <div className="resellerCard2">
          <h1>{STATUS_LABELS[data.reseller.status]}</h1>
          {data.reseller.note && <p className="resellerHint">Observação da loja: {data.reseller.note}</p>}
        </div>
      </main>
    );
  }

  const products = data.products ?? [];
  const commissions = data.commissions ?? [];
  const payoutRequests = data.payoutRequests ?? [];
  const balanceDue = data.balanceDue ?? 0;

  return (
    <main className="resellerPage resellerPageWide">
      <div className="resellerCard2">
        <h1>Painel do revendedor</h1>
        <p className="resellerHint">Seu código: <code>{data.reseller.referralCode}</code></p>

        <div className="resellerBalanceRow">
          <div className="resellerBalanceBox">
            <span>Saldo disponível</span>
            <strong>{money(balanceDue)}</strong>
          </div>
          <div className="resellerBalanceBox">
            <span>Já recebido</span>
            <strong>{money(data.totalPaid ?? 0)}</strong>
          </div>
          {data.hasPixKey === false ? (
            <Link href="/profile" className="resellerBtnPrimary resellerBtnLink">
              Cadastre sua chave PIX
            </Link>
          ) : (
            <button
              className="resellerBtnPrimary"
              onClick={() => void requestPayout()}
              disabled={requestingPayout || balanceDue <= 0 || !!data.hasPendingPayoutRequest}
            >
              {data.hasPendingPayoutRequest ? "Saque já solicitado" : requestingPayout ? "Solicitando..." : "Solicitar saque"}
            </button>
          )}
        </div>
        {data.hasPixKey === false && (
          <p className="resellerHint">
            Você precisa cadastrar uma chave PIX no seu perfil antes de poder solicitar saques — é como a loja vai
            te pagar.
          </p>
        )}

        <h2>Seus links de divulgação</h2>
        {products.length === 0 && <p className="resellerHint">A loja ainda não autorizou nenhum produto pra você.</p>}
        <div className="resellerProductList">
          {products.map((p) => (
            <div key={p.product_id} className="resellerProductRow">
              <div>
                <strong>{p.product_name}</strong>
                <span className="resellerHint"> — comissão de {p.commission_percent}% ({money((p.price * p.commission_percent) / 100)} por venda)</span>
              </div>
              <div className="resellerLinkRow">
                <input readOnly value={p.referralLink} onFocus={(e) => e.currentTarget.select()} />
                <button className="resellerBtnSecondary" onClick={() => void copyLink(p.referralLink)}>
                  {copiedLink === p.referralLink ? "Copiado!" : "Copiar link"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <h2>Comissões</h2>
        {commissions.length === 0 && <p className="resellerHint">Nenhuma venda registrada ainda.</p>}
        {commissions.length > 0 && (
          <div className="resellerTableWrap">
            <table className="resellerTable">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Pedido</th>
                  <th>Valor da venda</th>
                  <th>Comissão</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id}>
                    <td>{c.product_name}</td>
                    <td>#{c.order_id}</td>
                    <td>{money(c.sale_amount)}</td>
                    <td>{money(c.commission_amount)} ({c.commission_percent}%)</td>
                    <td><span className={`resellerCommissionStatus status-${c.status}`}>{c.status}</span></td>
                    <td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {payoutRequests.length > 0 && (
          <>
            <h2>Histórico de saques</h2>
            <div className="resellerTableWrap">
              <table className="resellerTable">
                <thead>
                  <tr>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Solicitado em</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutRequests.map((p) => (
                    <tr key={p.id}>
                      <td>{money(p.amount)}</td>
                      <td><span className={`resellerCommissionStatus status-${p.status}`}>{p.status}</span></td>
                      <td>{new Date(p.requested_at).toLocaleDateString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
