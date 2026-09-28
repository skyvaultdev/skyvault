"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icons/Icon";
import "./review-form.css";

const MAX_IMAGES = 4;

type Props = {
  productId: number;
  productName: string;
  onClose: () => void;
  onDone: (productId: number) => void;
};

// Modal de avaliação: nota 1-5, texto opcional e até 4 fotos/prints.
export default function ReviewForm({ productId, productName, onClose, onDone }: Props) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/"));
    const tooBig = picked.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) {
      setError("Cada imagem pode ter no máximo 5MB.");
      return;
    }
    setError("");
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
  }

  async function submit() {
    if (rating < 1) {
      setError("Escolha uma nota de 1 a 5 estrelas.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const form = new FormData();
      form.append("rating", String(rating));
      form.append("comment", comment.trim());
      files.forEach((f) => form.append("images", f));
      const res = await fetch(`/api/products/${productId}/reviews`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json.error === "ALREADY_REVIEWED" ? "Você já avaliou esse produto."
          : json.error === "NOT_A_BUYER" ? "Só quem comprou o produto pode avaliar."
          : json.error === "INVALID_IMAGE_TYPE" ? "Use imagens PNG, JPG, WEBP ou GIF."
          : json.error === "TOO_MANY_REQUESTS" ? "Muitas tentativas seguidas. Aguarde um pouco."
          : "Não foi possível enviar a avaliação. Tente de novo."
        );
        if (json.error === "ALREADY_REVIEWED") onDone(productId);
        return;
      }
      onDone(productId);
    } finally {
      setSending(false);
    }
  }

  const shown = hover || rating;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent rfModal" onClick={(e) => e.stopPropagation()}>
        <h4>Avaliar produto</h4>
        <p className="rfProduct">{productName}</p>

        <div className="rfStars" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={n <= shown ? "on" : ""}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              aria-label={`${n} estrela(s)`}
            >
              <Icon name="star" fill />
            </button>
          ))}
        </div>

        <textarea
          className="rfText"
          rows={4}
          maxLength={1500}
          placeholder="Conte como foi sua experiência (opcional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <div className="rfImages">
          {previews.map((src, i) => (
            <div key={src} className="rfThumb">
              <img src={src} alt="" />
              <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}><Icon name="x" /></button>
            </div>
          ))}
          {files.length < MAX_IMAGES && (
            <label className="rfAdd">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <span>＋ Foto / print</span>
            </label>
          )}
        </div>
        <p className="rfHint">Até {MAX_IMAGES} imagens de 5MB cada.</p>

        {error && <p className="rfError">{error}</p>}

        <div className="rfActions">
          <button type="button" className="rfCancel" onClick={onClose} disabled={sending}>Cancelar</button>
          <button type="button" className="rfSend" onClick={() => void submit()} disabled={sending}>
            {sending ? "Enviando..." : "Enviar avaliação"}
          </button>
        </div>
      </div>
    </div>
  );
}
