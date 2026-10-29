"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "./search.css";

type Product = {
    id: number;
    name: string;
    slug: string;
    price: number;
    image_url?: string | null;
    category_name?: string | null;
};

const PAGE_SIZE = 24;

export default function SearchPage() {
    const params = useParams<{ slug?: string | string[] }>();

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    const raw = params?.slug;
    const term = Array.isArray(raw) ? raw.join(" ") : raw ?? "";

    // Novo termo de busca sempre volta pra página 1 — sem isso, trocar de
    // busca enquanto numa página 3 de um termo anterior mostrava "página
    // 3" de um resultado totalmente diferente, ou simplesmente vazio.
    useEffect(() => {
        setPage(1);
    }, [term]);

    useEffect(() => {
        const q = term.trim();
        if (!q) {
            setProducts([]);
            setTotal(0);
            return;
        }

        const timeout = setTimeout(() => {
            async function fetchProducts() {
                setLoading(true);

                try {
                    const url = `/api/products?name=${encodeURIComponent(q)}&page=${page}&pageSize=${PAGE_SIZE}`;
                    const res = await fetch(url, { method: "GET" });
                    const json = await res.json();
                    const data = json?.data;
                    const items = (data?.items ?? []) as Product[];
                    setProducts(Array.isArray(items) ? items : []);
                    setTotal(Number(data?.total ?? 0));
                } catch {
                    setProducts([]);
                    setTotal(0);
                } finally {
                    setLoading(false);
                }
            }

            void fetchProducts();
        }, 300);

        return () => clearTimeout(timeout);
    }, [term, page]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <main className="searchPage">
            <div className="searchContainer">
                {loading && <p className="infoText">Carregando...</p>}

                {!loading && term.trim() && products.length === 0 && (
                    <p className="infoText">Nenhum produto encontrado.</p>
                )}

                <div className="productsGrid">
                    {products.map((product) => (
                        <div key={product.id} className="productCard">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={product.image_url || "/placeholders/product.svg"} alt={product.name} />
                            {product.category_name ? (
                                <span className="productCategory">{product.category_name}</span>
                            ) : null}
                            <h3>{product.name}</h3>
                            <p>R$ {Number(product.price).toFixed(2)}</p>
                            <a href={`/product/${product.slug}`} className="viewButton">
                                Ver produto
                            </a>
                        </div>
                    ))}
                </div>

                {!loading && total > PAGE_SIZE && (
                    <div className="searchPagination">
                        <button
                            type="button"
                            className="searchPageBtn"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            ← Anterior
                        </button>
                        <span className="searchPaginationInfo">
                            Página {page} de {totalPages} · {total} produto(s)
                        </span>
                        <button
                            type="button"
                            className="searchPageBtn"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                            Próxima →
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}