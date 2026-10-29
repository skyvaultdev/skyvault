"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./favoritos.css";

type WishlistItem = {
  product_id: number;
  name: string;
  slug: string;
  price: number;
  active: boolean;
  image_url: string | null;
};

export default function FavoritosPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/wishlist", { cache: "no-store" });
      const json = await res.json();
      setItems(res.ok && Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }

  async function remove(productId: number) {
    await fetch(`/api/wishlist/${productId}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  return (
    <main className="favoritosPage">
      <h1>Meus favoritos</h1>

      {loading && <p className="favoritosHint">Carregando...</p>}
      {!loading && items.length === 0 && <p className="favoritosHint">Você ainda não favoritou nenhum produto.</p>}

      <div className="favoritosGrid">
        {items.map((item) => (
          <div key={item.product_id} className="favoritosCard">
            <Link href={`/product/${item.slug}`} className="favoritosCardLink">
              <img src={item.image_url || "/placeholders/product.svg"} alt={item.name} className="favoritosThumb" />
              <p className="favoritosName">{item.name}</p>
              <p className="favoritosPrice">R$ {Number(item.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              {!item.active && <span className="favoritosInactive">Indisponível</span>}
            </Link>
            <button type="button" className="favoritosRemoveBtn" onClick={() => void remove(item.product_id)}>
              Remover
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
