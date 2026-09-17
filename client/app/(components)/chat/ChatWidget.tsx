"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import "./ChatWidget.css";
import "@/components/chat/ChatShared.css";
import ChatLightbox from "./ChatLightbox";
import ChatContextMenu from "@/components/chat/ChatContextMenu";
import ChatMessageContent from "@/components/chat/ChatMessageContent";
import { buildReplyBody } from "@/lib/chat/chatShared";

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

// Guarda em localStorage o instante em que o cliente viu a conversa pela
// última vez, pra podermos calcular quantas mensagens da loja ainda não
// foram vistas mesmo antes do widget ser aberto pela primeira vez nesta
// sessão (antes disso o badge só contava mensagens chegando via SSE
// depois do primeiro carregamento, então nunca aparecia se já existiam
// mensagens não lidas de antes ou após um reload da página).
const LAST_SEEN_KEY = "chatWidgetLastSeenAt";

function getLastSeenAt(): number {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(LAST_SEEN_KEY) || 0);
}

function markSeenNow() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
}

function uploadAttachmentWithProgress(file: File, onProgress: (pct: number) => void): Promise<Message> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/chat/attachments");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText).data);
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

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [staffTyping, setStaffTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);
  const messagesCacheRef = useRef<Message[] | null>(null);

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [previewFocusIndex, setPreviewFocusIndex] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  useEffect(() => {
    function handleAbrirChat() {
      setIsOpen(true);
    }
    window.addEventListener("abrirChat", handleAbrirChat);
    return () => window.removeEventListener("abrirChat", handleAbrirChat);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Mostra o cache na hora ao abrir (se existir) e atualiza por trás, sem
  // apagar a tela — só a primeira vez mostra o estado de "carregando".
  const loadMessages = useCallback(async () => {
    if (messagesCacheRef.current) {
      setRefreshing(true);
    }
    const res = await fetch("/api/chat/messages", { cache: "no-store" });
    if (!res.ok) {
      setRefreshing(false);
      return;
    }
    const json = await res.json();
    const loaded: Message[] = Array.isArray(json.data) ? json.data : [];
    messagesCacheRef.current = loaded;
    setMessages(loaded);
    setHasLoadedOnce(true);
    setRefreshing(false);
  }, []);

  // Carrega em segundo plano assim que o componente monta, independente
  // do widget estar aberto — é o que permite o badge de não lidas
  // aparecer para mensagens que já existiam antes desta sessão.
  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!isOpen) return;
    if (messagesCacheRef.current) setMessages(messagesCacheRef.current);
    void loadMessages();
    setUnread(0);
    markSeenNow();
  }, [isOpen, loadMessages]);

  // Recalcula o badge a partir do "último visto" salvo localmente sempre
  // que a lista de mensagens muda (carregamento inicial ou SSE), enquanto
  // o widget está fechado. Isso cobre tanto mensagens chegando ao vivo
  // quanto mensagens que já estavam não lidas antes de um reload da página.
  useEffect(() => {
    if (isOpen) return;
    const lastSeenAt = getLastSeenAt();
    const unreadFromStaff = messages.filter(
      (m) => m.sender_type === "staff" && new Date(m.created_at).getTime() > lastSeenAt
    ).length;
    setUnread(unreadFromStaff);
  }, [messages, isOpen]);

  useEffect(() => {
    const es = new EventSource("/api/chat/stream");

    es.addEventListener("message", (event) => {
      try {
        const msg: Message = JSON.parse((event as MessageEvent).data);
        setMessages((prev) => {
          const next = prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
          messagesCacheRef.current = next;
          return next;
        });
        if (msg.sender_type === "staff" && (!isOpen || document.hidden)) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Nova resposta da loja", { body: msg.body || "Enviou um anexo", icon: "/favicon.ico" });
          }
        }
      } catch {
        // ignora
      }
    });

    es.addEventListener("read", (event) => {
      try {
        const { messageId } = JSON.parse((event as MessageEvent).data);
        setReadIds((prev) => new Set(prev).add(messageId));
      } catch {
        // ignora
      }
    });

    es.addEventListener("typing", (event) => {
      try {
        const { active } = JSON.parse((event as MessageEvent).data);
        setStaffTyping(!!active);
      } catch {
        // ignora
      }
    });

    eventSourceRef.current = es;
    return () => es.close();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen, staffTyping]);

  const mediaItems = useMemo(() => {
    return messages
      .filter((m) => m.attachment_url && (m.attachment_type?.startsWith("image/") || m.attachment_type?.startsWith("video/")))
      .map((m) => ({ id: m.id, url: m.attachment_url as string, type: m.attachment_type as string, name: m.attachment_name }));
  }, [messages]);

  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    void fetch("/api/chat/typing", { method: "POST" });
  }

  function openMessageContextMenu(e: React.MouseEvent, message: Message) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  }

  function startReply(message: Message) {
    const label = message.sender_type === "customer" ? "Você" : "Loja";
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
    if (!draft.trim()) return;
    const text = draft.trim();
    const activeReply = replyTarget;
    const finalBody = activeReply ? buildReplyBody(activeReply.label, activeReply.snippet, text) : text;
    setDraft("");
    setReplyTarget(null);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: 0,
      sender_type: "customer",
      sender_email: "",
      body: finalBody,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => {
      const next = [...prev, optimistic];
      messagesCacheRef.current = next;
      return next;
    });

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: finalBody }),
      });
      if (!res.ok) throw new Error("Falha ao enviar");
      const json = await res.json();
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === tempId ? json.data : m));
        messagesCacheRef.current = next;
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m));
        messagesCacheRef.current = next;
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
    if (pendingFiles.length === 0) return;

    for (const pf of pendingFiles) {
      updatePendingFile(pf.id, { status: "uploading", progress: 0 });
      try {
        const message = await uploadAttachmentWithProgress(pf.file, (progress) => {
          updatePendingFile(pf.id, { progress });
        });
        setMessages((prev) => {
          const next = [...prev, message];
          messagesCacheRef.current = next;
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

  return (
    <div className="chatWidgetRoot">
      {isOpen && (
        <div
          className="chatWidgetPanel"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="chatWidgetHeader">
            <span>Fale conosco</span>
            {refreshing && <span className="chatSubtleIndicator">atualizando...</span>}
            <button className="chatWidgetClose" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          {isDraggingOver && (
            <div className="chatDropOverlay">
              <div className="chatDropOverlayInner">Solte os arquivos para enviar</div>
            </div>
          )}

          <div className="chatWidgetMessages">
            {!hasLoadedOnce && messages.length === 0 && (
              <p className="chatSubtleIndicator">carregando mensagens...</p>
            )}
            {hasLoadedOnce && messages.length === 0 && (
              <p className="chatWidgetEmpty">Envie uma mensagem, nossa equipe vai te responder por aqui.</p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`chatBubble ${m.sender_type === "staff" ? "fromStaff" : "fromCustomer"} ${m.failed ? "chatBubbleFailed" : ""}`}
                onContextMenu={(e) => openMessageContextMenu(e, m)}
              >
                {m.body && <ChatMessageContent text={m.body} />}
                {renderAttachment(m)}
                {m.sender_type === "customer" && (
                  <p className="chatReadTick">
                    {m.pending
                      ? "enviando..."
                      : m.failed
                        ? "falha ao enviar"
                        : typeof m.id === "number" && readIds.has(m.id)
                          ? "✓✓"
                          : "✓"}
                  </p>
                )}
              </div>
            ))}
            {staffTyping && <div className="chatTypingIndicator">digitando...</div>}
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

          <div className="chatWidgetComposer">
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
              onChange={(e) => { setDraft(e.target.value); notifyTyping(); }}
              onKeyDown={(e) => { if (e.key === "Enter") void sendMessage(); }}
              placeholder="Digite sua mensagem..."
              className="chatWidgetInput"
            />
            <button className="chatWidgetSend" disabled={!draft.trim()} onClick={() => void sendMessage()}>
              ➤
            </button>
          </div>
        </div>
      )}

      <button
        className="chatWidgetToggle"
        style={{ display: isOpen ? "none" : "block" }}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        💬
        {unread > 0 && !isOpen && <span className="chatWidgetBadge">{unread}</span>}
      </button>

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
    </div>
  );
}