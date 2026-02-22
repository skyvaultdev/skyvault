"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "./search.css";

type Product = {
    id: number;
    name: string;
    slug: string;
    price: number;
    image?: string | null;
};

export default function SearchPage() {
    const params = useParams<{ slug?: string | string[] }>();

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);

    const raw = params?.slug;
    const term = Array.isArray(raw) ? raw.join(" ") : raw ?? "";

    useEffect(() => {
        const q = term.trim();
        if (!q) {
            setProducts([]);
            return;
        }

        const timeout = setTimeout(() => {
            async function fetchProducts() {
                setLoading(true);

                try {
                    const res = await fetch(`/api/products?name=${encodeURIComponent(q)}`, { method: "GET" });
                    const json = await res.json();
                    const data = (json?.data ?? json?.product ?? []) as Product[];
                    setProducts(Array.isArray(data) ? data : []);
                } catch {
                    setProducts([]);
                } finally {
                    setLoading(false);
                }
            }

            void fetchProducts();
        }, 300);

        return () => clearTimeout(timeout);
    }, [term]);

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
                            <img src={product.image || "/download.jpg"} alt={product.name} />
                            <h3>{product.name}</h3>
                            <p>R$ {Number(product.price).toFixed(2)}</p>
                            <a href={`/product/${product.slug}`} className="viewButton">
                                Ver produto
                            </a>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}