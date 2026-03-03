"use client";

import Link from "next/link";
import link from "next/link";
import { useEffect, useState } from "react";

type Product = {

    id: number;
    name: string;
    slug: string;
    price: number;
    image_url: string | null;
    category_name: string | null;
};

export default function HighlightsCarousel({highlights}: { highlights: Product[] }) {
    const [index, setindex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setindex((prev) => (prev + 1) % highlights.length);
        }, 2000);

        return () => clearInterval(interval);
    }, [highlights.length]);

    const product = highlights[index];

    return (
        <article key={product.id} className="highlightCard">
            <img src={product.image_url || "/file.svg"} alt={product.name} className="highlightImage"/>
            
            <div className="highlightOverlay">
                <div className="highlightMeta">
                    <span className="productCategory">{product.category_name ?? "Sem categoria"}</span>
                    <h3 className="productTitle">{product.name}</h3>
                    <p className="productPrice">R$ {Number(product.price).toFixed(2)}</p>
                </div>
                <Link href={`/product/${product.slug}`} className="buyButton">
                    Comprar agora
                </Link>
            </div>
        </article>
    );

}
