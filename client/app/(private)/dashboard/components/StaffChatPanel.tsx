"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import "./StaffChatPannel.css";
import "@/components/chat/ChatShared.css";
import ChatLightbox from "./ChatLightbox";
import ChatContextMenu from "@/components/chat/ChatContextMenu";
import ChatMessageContent from "@/components/chat/ChatMessageContent";
import { buildReplyBody } from "@/lib/chat/chatShared";

type Conversation = {
  id: number;
  customer_email: string;
  customer_name?: string | null;
  status: "open" | "closed";
  last_message_at: string | null;
  unread_count: number;
  order_id: number | null;
  is_ticket: boolean;
};

type Message = {
  id: number | string;
  conversation_id: number;
  sender_type: "customer" | "staff";
  sender_email: string;
  body: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
};

type PendingFile = {
  id: string;
  file: File;
  previewUrl: string | null;
  status: "pending" | "uploading" | "error";
  progress: number;
};

type CustomerResult = {
  email: string;
  username: string | null;
};

type ReplyTarget = {
  id: Message["id"];
  label: string;
  snippet: string;
};

type ContextMenuState = {
  x: number;
  y: number;
  message: Message;
};

function normalizeMessage(raw: any): Message {
  return {
    ...raw,
    id: typeof raw.id === "string" ? Number(raw.id) : raw.id,
    conversation_id: typeof raw.conversation_id === "string" ? Number(raw.conversation_id) : raw.conversation_id,
  };
}

function uploadAttachmentWithProgress(
  conversationId: number,
  file: File,
  onProgress: (pct: number) => void
): Promise<Message> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/chat/conversations/${conversationId}/attachments`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(normalizeMessage(JSON.parse(xhr.responseText).data));
        } catch {
          reject(new Error("Resposta inválida"));
        }
      } else {
        reject(new Error("Falha no upload"));
      }
    };
    xhr.onerror = () => reject(new Error("Erro de rede"));
    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export default function StaffChatPanel() {
  const [view, setView] = useState<"chats" | "tickets">("chats");
  const [ticketStatus, setTicketStatus] = useState<"open" | "closed">("open");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const [initialLoadingConversations, setInitialLoadingConversations] = useState(true);
  const [refreshingConversations, setRefreshingConversations] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [refreshingMessages, setRefreshingMessages] = useState(false);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [customerTyping, setCustomerTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);
  const messagesCacheRef = useRef<Map<number, Message[]>>(new Map());

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [previewFocusIndex, setPreviewFocusIndex] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [newChatResults, setNewChatResults] = useState<CustomerResult[]>([]);
  const [newChatSearching, setNewChatSearching] = useState(false);
  const [newChatStarting, setNewChatStarting] = useState(false);

  // Contagem separada por aba — antes uma mensagem nova de ticket inflava
  // a bolinha de "Chats" (e vice-versa) sem indicar de onde vinha.
  const [unreadByView, setUnreadByView] = useState({ chats: 0, tickets: 0 });

  useEffect(() => {
    async function loadUnread() {
      try {
        const res = await fetch("/api/chat/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        setUnreadByView({ chats: Number(json.chats) || 0, tickets: Number(json.tickets) || 0 });
      } catch {
        // ignora erro pontual
      }
    }
    void loadUnread();
    const interval = setInterval(loadUnread, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    async function loadLogo() {
      try {
        const res = await fetch("/api/store-settings", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        setStoreLogoUrl(json.data?.logo_url || null);
      } catch {
        // ignora
      }
    }
    void loadLogo();
  }, []);

  const loadConversations = useCallback(async (background = false) => {
    if (!background) setInitialLoadingConversations(true);
    else setRefreshingConversations(true);
    try {
      const params = new URLSearchParams();
      if (view === "tickets") {
        params.set("ticket", "true");
        params.set("status", ticketStatus);
      }
      const res = await fetch(`/api/chat/conversations?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setConversations(Array.isArray(json.data) ? json.data : []);
    } finally {
      setInitialLoadingConversations(false);
      setRefreshingConversations(false);
    }
  }, [view, ticketStatus]);

  useEffect(() => {
    setSelectedId(null);
    void loadConversations(false);
    const interval = setInterval(() => void loadConversations(true), 10000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  async function toggleTicketStatus() {
    if (!selectedConversation) return;
    setClosingTicket(true);
    try {
      const nextStatus = selectedConversation.status === "open" ? "closed" : "open";
      await fetch(`/api/chat/conversations/${selectedConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadConversations(false);
      if (nextStatus === "closed") setSelectedId(null);
    } finally {
      setClosingTicket(false);
    }
  }

  const filteredConversations = useMemo(() => {
    const q = conversationSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.customer_email.toLowerCase().includes(q) ||
        (c.customer_name ?? "").toLowerCase().includes(q)
    );
  }, [conversations, conversationSearch]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    setCustomerTyping(false);
    setReadIds(new Set());
    setReplyTarget(null);

    const cached = messagesCacheRef.current.get(selectedId);
    if (cached) {
      setMessages(cached);
      setRefreshingMessages(true);
    } else {
      setMessages([]);
      setRefreshingMessages(true);
    }

    async function loadMessages() {
      const res = await fetch(`/api/chat/conversations/${selectedId}/messages`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const json = await res.json();
      const loaded: Message[] = Array.isArray(json.data) ? json.data.map(normalizeMessage) : [];
      messagesCacheRef.current.set(selectedId as number, loaded);
      if (!cancelled) {
        setMessages(loaded);
        setRefreshingMessages(false);
      }
    }
    void loadMessages();

    eventSourceRef.current?.close();
    const es = new EventSource(`/api/chat/conversations/${selectedId}/stream`);

    es.addEventListener("message", (event) => {
      try {
        const msg = normalizeMessage(JSON.parse((event as MessageEvent).data));
        setMessages((prev) => {
          const next = prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
          messagesCacheRef.current.set(selectedId as number, next);
          return next;
        });
        if (msg.sender_type === "customer" && document.hidden && "Notification" in window && Notification.permission === "granted") {
          const conv = conversationsRef.current.find((c) => c.id === selectedId);
          const title = conv?.is_ticket ? `Ticket — Pedido #${conv.order_id ?? "?"}` : "Nova mensagem no chat";
          new Notification(title, { body: msg.body || "Enviou um anexo", icon: "/favicon.ico" });
        }
      } catch {
        // ignora erro de parse
      }
    });

    es.addEventListener("read", (event) => {
      try {
        const { messageId } = JSON.parse((event as MessageEvent).data);
        setReadIds((prev) => new Set(prev).add(Number(messageId)));
      } catch {
        // ignora
      }
    });

    es.addEventListener("typing", (event) => {
      try {
        const { active } = JSON.parse((event as MessageEvent).data);
        setCustomerTyping(!!active);
      } catch {
        // ignora
      }
    });

    eventSourceRef.current = es;

    return () => {
      cancelled = true;
      es.close();
    };
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, customerTyping]);

  const mediaItems = useMemo(() => {
    return messages
      .filter((m) => m.attachment_url && (m.attachment_type?.startsWith("image/") || m.attachment_type?.startsWith("video/")))
      .map((m) => ({ id: m.id, url: m.attachment_url as string, type: m.attachment_type as string, name: m.attachment_name }));
  }, [messages]);

  function notifyTyping() {
    if (!selectedId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    void fetch(`/api/chat/conversations/${selectedId}/typing`, { method: "POST" });
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    notifyTyping();
  }

  function openMessageContextMenu(e: React.MouseEvent, message: Message) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  }

  function startReply(message: Message) {
    const isOwn = message.sender_type === "staff";
    const label = isOwn
      ? "Você"
      : selectedConversation?.customer_name || selectedConversation?.customer_email || message.sender_email || "Cliente";
    const snippet = message.body?.trim() || (message.attachment_name ? `📎 ${message.attachment_name}` : "anexo");
    setReplyTarget({ id: message.id, label, snippet });
  }

  async function copyMessageText(message: Message) {
    if (!message.body) return;
    try {
      await navigator.clipboard.writeText(message.body);
    } catch {
      // Clipboard API pode falhar sem HTTPS/foco — ignora silenciosamente.
    }
  }

  async function sendMessage() {
    if (!selectedId || !draft.trim()) return;
    const text = draft.trim();
    const conversationId = selectedId;
    const activeReply = replyTarget;
    const finalBody = activeReply ? buildReplyBody(activeReply.label, activeReply.snippet, text) : text;
    setDraft("");
    setReplyTarget(null);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_type: "staff",
      sender_email: "",
      body: finalBody,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => {
      const next = [...prev, optimistic];
      messagesCacheRef.current.set(conversationId, next);
      return next;
    });

    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: finalBody }),
      });
      if (!res.ok) throw new Error("Falha ao enviar");
      const json = await res.json();
      const confirmed = normalizeMessage(json.data);
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === tempId ? confirmed : m));
        messagesCacheRef.current.set(conversationId, next);
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m));
        messagesCacheRef.current.set(conversationId, next);
        return next;
      });
    }
  }

  function addFilesToPending(fileList: FileList | File[]) {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;

    const newItems: PendingFile[] = filesArray.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : null,
      status: "pending",
      progress: 0,
    }));

    setPendingFiles((prev) => {
      setPreviewFocusIndex(prev.length);
      return [...prev, ...newItems];
    });
  }

  function updatePendingFile(id: string, patch: Partial<PendingFile>) {
    setPendingFiles((prev) => prev.map((pf) => (pf.id === id ? { ...pf, ...patch } : pf)));
  }

  function removePendingFile(id: string) {
    setPendingFiles((prev) => {
      const target = prev.find((pf) => pf.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((pf) => pf.id !== id);
      setPreviewFocusIndex((idx) => Math.min(idx, Math.max(next.length - 1, 0)));
      return next;
    });
  }

  function cancelPendingFiles() {
    pendingFiles.forEach((pf) => pf.previewUrl && URL.revokeObjectURL(pf.previewUrl));
    setPendingFiles([]);
    setPreviewFocusIndex(0);
  }

  async function confirmSendFiles() {
    if (!selectedId || pendingFiles.length === 0) return;
    const conversationId = selectedId;

    for (const pf of pendingFiles) {
      updatePendingFile(pf.id, { status: "uploading", progress: 0 });
      try {
        const message = await uploadAttachmentWithProgress(conversationId, pf.file, (progress) => {
          updatePendingFile(pf.id, { progress });
        });
        setMessages((prev) => {
          const next = [...prev, message];
          messagesCacheRef.current.set(conversationId, next);
          return next;
        });
        if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
        setPendingFiles((prev) => prev.filter((item) => item.id !== pf.id));
      } catch {
        updatePendingFile(pf.id, { status: "error" });
      }
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (!selectedId) return;
    dragCounterRef.current += 1;
    setIsDraggingOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    if (!selectedId) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToPending(e.dataTransfer.files);
    }
  }

  useEffect(() => {
    if (pendingFiles.length === 0) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setPreviewFocusIndex((i) => Math.min(i + 1, pendingFiles.length - 1));
      if (e.key === "ArrowLeft") setPreviewFocusIndex((i) => Math.max(i - 1, 0));
      if (e.key === "Escape") cancelPendingFiles();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pendingFiles.length]);

  // Busca de clientes pro modal "Nova conversa", com debounce.
  useEffect(() => {
    if (!isNewChatOpen) return;
    const q = newChatQuery.trim();
    if (q.length < 2) {
      setNewChatResults([]);
      return;
    }
    setNewChatSearching(true);
    const delay = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chat/customers/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setNewChatResults(Array.isArray(json.data) ? json.data : []);
        }
      } finally {
        setNewChatSearching(false);
      }
    }, 350);
    return () => clearTimeout(delay);
  }, [newChatQuery, isNewChatOpen]);

  function openNewChat() {
    setNewChatQuery("");
    setNewChatResults([]);
    setIsNewChatOpen(true);
  }

  function closeNewChat() {
    setIsNewChatOpen(false);
  }

  async function startConversationWith(email: string) {
    setNewChatStarting(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) return;
      const json = await res.json();
      await loadConversations(false);
      setSelectedId(Number(json.data.id));
      closeNewChat();
    } finally {
      setNewChatStarting(false);
    }
  }

  function renderAttachment(m: Message) {
    if (!m.attachment_url) return null;
    const isImage = m.attachment_type?.startsWith("image/");
    const isVideo = m.attachment_type?.startsWith("video/");

    if (isImage || isVideo) {
      const mediaIndex = mediaItems.findIndex((item) => item.id === m.id);
      return isImage ? (
        <img
          src={m.attachment_url}
          alt={m.attachment_name ?? "anexo"}
          className="chatAttachmentImg"
          onClick={() => mediaIndex >= 0 && setLightboxIndex(mediaIndex)}
        />
      ) : (
        <div className="chatVideoThumbWrap" onClick={() => mediaIndex >= 0 && setLightboxIndex(mediaIndex)}>
          <video src={m.attachment_url} className="chatAttachmentImg" muted />
          <span className="chatVideoPlayIcon" aria-hidden="true" />
        </div>
      );
    }

    return (
      <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" className="chatAttachmentFile">
        📎 {m.attachment_name ?? "Arquivo"}
      </a>
    );
  }

  const focusedPending = pendingFiles[previewFocusIndex];
  const selectedConversation = conversations.find((c) => c.id === selectedId);

  return (
    <section className="settingsPanel">
      <div className="previewHeader">
        <h3>Chat com clientes</h3>
        {refreshingConversations && <span className="chatSubtleIndicator">atualizando...</span>}
      </div>

      <div className="chatViewSwitch">
        <button className={view === "chats" ? "active" : ""} onClick={() => setView("chats")}>
          Chats
          {unreadByView.chats > 0 && <span className="chatViewSwitchBadge">{unreadByView.chats}</span>}
        </button>
        <button className={view === "tickets" ? "active" : ""} onClick={() => setView("tickets")}>
          Tickets
          {unreadByView.tickets > 0 && <span className="chatViewSwitchBadge">{unreadByView.tickets}</span>}
        </button>

        {view === "tickets" && (
          <>
            <span className="chatViewSwitchDivider" />
            <button className={`chatTicketStatusBtn ${ticketStatus === "open" ? "active" : ""}`} onClick={() => setTicketStatus("open")}>Abertos</button>
            <button className={`chatTicketStatusBtn ${ticketStatus === "closed" ? "active" : ""}`} onClick={() => setTicketStatus("closed")}>Encerrados</button>
          </>
        )}
      </div>

      <div className="chatLayout">
        <aside className="chatConversationList">
          <div className="chatConversationListHeader">
            <input
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="chatConversationSearch"
            />
            <button type="button" className="chatNewConversationBtn" onClick={openNewChat} title="Nova conversa">
              +
            </button>
          </div>

          {initialLoadingConversations && <div>Carregando conversas...</div>}
          {!initialLoadingConversations && filteredConversations.length === 0 && <p>Nenhuma conversa.</p>}
          {filteredConversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chatConversationItem ${selectedId === c.id ? "active" : ""}`}
              onClick={() => setSelectedId(c.id)}
            >
              <strong>{c.customer_name || c.customer_email}</strong>
              {c.order_id && <span className="chatTicketOrderBadge">Pedido #{c.order_id}</span>}
              {c.unread_count > 0 && <span className="chatUnreadBadge">{c.unread_count}</span>}
            </button>
          ))}
        </aside>

        <div
          className="chatThread"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {!selectedId && <p className="emptyMsg">Selecione uma conversa.</p>}

          {selectedId && (
            <>
              {isDraggingOver && (
                <div className="chatDropOverlay">
                  <div className="chatDropOverlayInner">Solte os arquivos para enviar</div>
                </div>
              )}

              <div className="chatThreadHeader">
                <strong>{selectedConversation?.customer_name || selectedConversation?.customer_email}</strong>
                {selectedConversation?.order_id && (
                  <span className="chatTicketOrderBadge">Pedido #{selectedConversation.order_id}</span>
                )}
                {selectedConversation?.is_ticket && (
                  <button
                    type="button"
                    className="btnSecondary chatCloseTicketBtn"
                    onClick={toggleTicketStatus}
                    disabled={closingTicket}
                  >
                    {closingTicket
                      ? "Salvando..."
                      : selectedConversation.status === "open" ? "Encerrar ticket" : "Reabrir ticket"}
                  </button>
                )}
              </div>

              <div className="chatMessages">
                {refreshingMessages && messages.length === 0 && (
                  <p className="chatSubtleIndicator">carregando mensagens...</p>
                )}
                {messages.map((m) => {
                  const isOwn = m.sender_type === "staff";
                  return (
                    <div key={m.id} className={`chatMessageRow ${isOwn ? "own" : "other"}`}>
                      {isOwn ? (
                        storeLogoUrl ? (
                          <img src={storeLogoUrl} className="chatAvatar" alt="Loja" />
                        ) : (
                          <div className="chatAvatarPlaceholder">🏬</div>
                        )
                      ) : (
                        <div className="chatAvatarPlaceholder">👤</div>
                      )}
                      <div
                        className={`chatBubble ${isOwn ? "fromStaff" : "fromCustomer"} ${m.failed ? "chatBubbleFailed" : ""}`}
                        onContextMenu={(e) => openMessageContextMenu(e, m)}
                      >
                        {m.body && <ChatMessageContent text={m.body} />}
                        {renderAttachment(m)}
                        {isOwn && (
                          <span className="chatReadTick">
                            {m.pending
                              ? "enviando..."
                              : m.failed
                                ? "falha ao enviar"
                                : typeof m.id === "number" && readIds.has(m.id)
                                  ? "✓✓"
                                  : "✓"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {customerTyping && <div className="chatTypingIndicator">digitando...</div>}
                <div ref={bottomRef} />
              </div>

              {pendingFiles.length > 0 && (
                <div className="chatStagingOverlay">
                  <div className="chatStagingHeader">
                    <button className="chatStagingClose" onClick={cancelPendingFiles}>✕</button>
                    <span>{pendingFiles.length} arquivo{pendingFiles.length > 1 ? "s" : ""} selecionado{pendingFiles.length > 1 ? "s" : ""}</span>
                  </div>

                  <div className="chatStagingMain">
                    {focusedPending?.previewUrl ? (
                      focusedPending.file.type.startsWith("video/") ? (
                        <video src={focusedPending.previewUrl} controls className="chatStagingMedia" />
                      ) : (
                        <img src={focusedPending.previewUrl} alt="" className="chatStagingMedia" />
                      )
                    ) : (
                      <div className="chatStagingFileIcon">📄 {focusedPending?.file.name}</div>
                    )}

                    {focusedPending?.status === "uploading" && (
                      <div className="chatStagingProgressBar">
                        <div className="chatStagingProgressFill" style={{ width: `${focusedPending.progress}%` }} />
                      </div>
                    )}
                    {focusedPending?.status === "error" && (
                      <p className="chatStagingError">Falha ao enviar este arquivo.</p>
                    )}

                    {pendingFiles.length > 1 && (
                      <>
                        {previewFocusIndex > 0 && (
                          <button className="chatStagingArrow chatStagingArrowLeft" onClick={() => setPreviewFocusIndex((i) => i - 1)}>‹</button>
                        )}
                        {previewFocusIndex < pendingFiles.length - 1 && (
                          <button className="chatStagingArrow chatStagingArrowRight" onClick={() => setPreviewFocusIndex((i) => i + 1)}>›</button>
                        )}
                      </>
                    )}
                  </div>

                  {pendingFiles.length > 1 && (
                    <div className="chatStagingThumbs">
                      {pendingFiles.map((pf, i) => (
                        <div key={pf.id} className={`chatStagingThumbWrapper ${i === previewFocusIndex ? "active" : ""}`}>
                          <button className="chatStagingThumb" onClick={() => setPreviewFocusIndex(i)}>
                            {pf.previewUrl ? (
                              pf.file.type.startsWith("video/") ? (
                                <video src={pf.previewUrl} className="chatStagingThumbMedia" muted />
                              ) : (
                                <img src={pf.previewUrl} alt="" className="chatStagingThumbMedia" />
                              )
                            ) : (
                              <span className="chatStagingThumbFileIcon">📄</span>
                            )}
                            {pf.status === "uploading" && <span className="chatStagingThumbProgress">{pf.progress}%</span>}
                          </button>
                          <button className="chatStagingThumbRemove" onClick={() => removePendingFile(pf.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="chatStagingActions">
                    <button className="btnSecondary" onClick={cancelPendingFiles}>Cancelar</button>
                    <button className="btn" onClick={() => void confirmSendFiles()}>
                      Enviar {pendingFiles.length > 1 ? `(${pendingFiles.length})` : ""}
                    </button>
                  </div>
                </div>
              )}

              {replyTarget && (
                <div className="chatReplyBar">
                  <div className="chatReplyBarInfo">
                    <span className="chatReplyBarLabel">Respondendo a {replyTarget.label}</span>
                    <span className="chatReplyBarSnippet">{replyTarget.snippet}</span>
                  </div>
                  <button type="button" className="chatReplyBarClose" onClick={() => setReplyTarget(null)}>✕</button>
                </div>
              )}

              <div className="chatComposer">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="chatFileInputHidden"
                  onChange={(e) => {
                    if (e.target.files) addFilesToPending(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button type="button" className="chatAttachBtn" onClick={() => fileInputRef.current?.click()}>
                  📎
                </button>
                <input
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void sendMessage(); }}
                  placeholder="Digite uma mensagem..."
                  className="settingsInput"
                />
                <button className="btn" disabled={!draft.trim()} onClick={() => void sendMessage()}>
                  Enviar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {isNewChatOpen && (
        <div className="modalOverlay" onClick={closeNewChat}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <h4>Nova conversa</h4>
            <input
              autoFocus
              value={newChatQuery}
              onChange={(e) => setNewChatQuery(e.target.value)}
              placeholder="Buscar por nome ou email..."
              className="settingsInput"
            />

            <div className="chatNewSearchResults">
              {newChatSearching && <p className="chatSubtleIndicator">buscando...</p>}
              {!newChatSearching && newChatQuery.trim().length >= 2 && newChatResults.length === 0 && (
                <p className="emptyMsg">Nenhum cliente encontrado.</p>
              )}
              {newChatResults.map((customer) => (
                <button
                  key={customer.email}
                  type="button"
                  className="chatNewSearchResultItem"
                  disabled={newChatStarting}
                  onClick={() => void startConversationWith(customer.email)}
                >
                  <strong>{customer.username || customer.email}</strong>
                  {customer.username && <span>{customer.email}</span>}
                </button>
              ))}
            </div>

            <button className="btnSecondary" onClick={closeNewChat}>Fechar</button>
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <ChatLightbox
          items={mediaItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}

      {contextMenu && (
        <ChatContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: "Responder", onClick: () => startReply(contextMenu.message) },
            ...(contextMenu.message.body
              ? [{ label: "Copiar texto", onClick: () => void copyMessageText(contextMenu.message) }]
              : []),
          ]}
        />
      )}
    </section>
  );
}