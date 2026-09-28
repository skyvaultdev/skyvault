"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/icons/Icon";
import { useRouter } from "next/navigation";
import { FiBell } from "react-icons/fi";
import { useModal } from "@/app/(components)/modal/ModalProvider";

type Notification = {
  id: number;
  type: "announcement" | "order_update" | "reseller_invite" | "question_answer";
  title: string;
  body: string | null;
  data: { resellerId?: number; orderId?: number; productSlug?: string } | null;
  read_at: string | null;
  created_at: string;
};

const TYPE_ICON: Record<Notification["type"], IconName> = {
  announcement: "megaphone",
  order_update: "box",
  reseller_invite: "handshake",
  question_answer: "chat",
};

// Popover pequeno tipo o do carrinho, mas sem página dedicada — abre,
// mostra as notificações, fecha. "Carregar mais" pagina dentro do próprio
// popover em vez de mandar pra outro lugar.
export default function NotificationsBell() {
  const router = useRouter();
  const modal = useModal();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const loadedOnceRef = useRef(false);

  const openRef = useRef(false);
  const lastCountRef = useRef<number | null>(null);

  const loadPage = useCallback(async (targetPage: number, append: boolean, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/notifications?page=${targetPage}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) return;
      const newItems: Notification[] = json.data.items ?? [];
      setItems((prev) => (append ? [...prev, ...newItems] : newItems));
      setPage(targetPage);
      setHasMore(targetPage * json.data.pageSize < json.data.total);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Polling curto: quando a contagem de não lidas muda (nova notificação
  // chegou) e o popover está aberto, recarrega a lista sozinho — antes só
  // carregava na primeira abertura e exigia refresh da página.
  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const count = Number(json.data?.count) || 0;
      setUnreadCount(count);
      if (lastCountRef.current !== null && count > lastCountRef.current) {
        loadedOnceRef.current = false;
        if (openRef.current) void loadPage(1, false, true);
      }
      lastCountRef.current = count;
    } catch {
      // ignora erro pontual
    }
  }, [loadPage]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    void loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 5000);
    const onFocus = () => void loadUnreadCount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadUnreadCount]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    openRef.current = next;
    if (next) {
      loadedOnceRef.current = true;
      void loadPage(1, false);
    }
  }

  async function markRead(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" }),
    }).catch(() => {});
  }

  async function markAllRead() {
    const hadUnread = items.some((n) => !n.read_at);
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    setUnreadCount(0);
    if (hadUnread) await fetch("/api/notifications/mark-all-read", { method: "POST" }).catch(() => {});
  }

  async function clearRead() {
    setItems((prev) => prev.filter((n) => !n.read_at));
    await fetch("/api/notifications/clear", { method: "POST" }).catch(() => {});
  }

  async function deleteOne(id: number) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await fetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function resolveInvite(id: number, action: "accept_reseller_invite" | "decline_reseller_invite") {
    setResolvingId(id);
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        await modal.alert(json.error === "INVITE_ALREADY_RESOLVED" ? "Esse convite já foi resolvido." : "Não foi possível processar sua resposta.");
        await loadPage(1, false);
        return;
      }
      setUnreadCount((prev) => Math.max(0, prev - 1));
      if (action === "accept_reseller_invite") {
        setOpen(false);
        const goToPanel = await modal.confirm("Convite aceito! Quer ir agora pro seu painel de revendedor?");
        if (goToPanel) {
          router.push("/reseller");
          return;
        }
      }
      await loadPage(1, false);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="notifWrapper">
      <button className="notifBellButton" onClick={toggleOpen} aria-label="Notificações">
        <FiBell size={20} />
        {unreadCount > 0 && <span className="notifBellBadge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="notifBellOverlay" onClick={() => setOpen(false)} />
          <div className="notifBellDropdown">
            <div className="notifBellHeader">
              <h3>Notificações</h3>
              <button className="notifBellCloseBtn" onClick={() => setOpen(false)}><Icon name="x" /></button>
            </div>

            <div className="notifBellActions">
              <button onClick={() => void markAllRead()} disabled={unreadCount === 0}>Marcar lidas</button>
              <button onClick={() => void clearRead()}>Limpar lidas</button>
            </div>

            <div className="notifBellList">
              {items.length === 0 && !loading && <p className="notifBellEmpty">Nenhuma notificação ainda.</p>}

              {items.map((n) => (
                <div key={n.id} className={`notifBellItem ${!n.read_at ? "unread" : ""}`}>
                  <span className="notifBellIcon"><Icon name={TYPE_ICON[n.type] ?? "bell"} /></span>
                  <div className="notifBellBody" onClick={() => {
                    if (!n.read_at && n.type !== "reseller_invite") void markRead(n.id);
                    if (n.type === "question_answer" && n.data?.productSlug) {
                      setOpen(false);
                      router.push(`/product/${n.data.productSlug}#perguntas`);
                    }
                  }}>
                    <strong>{n.title}</strong>
                    {n.body && <p>{n.body}</p>}
                    <span className="notifBellDate">{new Date(n.created_at).toLocaleString("pt-BR")}</span>

                    {n.type === "reseller_invite" && !n.read_at && (
                      <div className="notifBellInviteActions">
                        <button
                          className="notifBellAccept"
                          disabled={resolvingId === n.id}
                          onClick={(e) => { e.stopPropagation(); void resolveInvite(n.id, "accept_reseller_invite"); }}
                        >
                          Aceitar
                        </button>
                        <button
                          className="notifBellDecline"
                          disabled={resolvingId === n.id}
                          onClick={(e) => { e.stopPropagation(); void resolveInvite(n.id, "decline_reseller_invite"); }}
                        >
                          Recusar
                        </button>
                      </div>
                    )}
                  </div>
                  <button className="notifBellDelete" onClick={() => void deleteOne(n.id)} title="Remover"><Icon name="x" /></button>
                </div>
              ))}

              {hasMore && (
                <button className="notifBellLoadMore" onClick={() => void loadPage(page + 1, true)} disabled={loading}>
                  {loading ? "Carregando..." : "Carregar mais"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
