"use client";

import "./ShippingQuoteList.css";

export type ShippingQuote = {
  carrierId: number | null;
  carrierName: string;
  serviceName: string;
  price: number;
  etaDays: number;
};

type Props = {
  quotes: ShippingQuote[];
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
};

// Reaproveitado pelo checkout (seleção via radio, alimenta o pedido) e pela
// calculadora avulsa da página do produto (só exibição, sem onSelect).
export default function ShippingQuoteList({ quotes, selectedIndex = null, onSelect }: Props) {
  if (quotes.length === 0) return null;

  return (
    <div className="shippingQuoteList">
      {quotes.map((quote, i) => (
        <label
          key={i}
          className={`shippingQuoteItem ${selectedIndex === i ? "active" : ""} ${!onSelect ? "readOnly" : ""}`}
        >
          {onSelect && (
            <input
              type="radio"
              name="shippingQuote"
              checked={selectedIndex === i}
              onChange={() => onSelect(i)}
            />
          )}
          <div className="shippingQuoteInfo">
            <strong>{quote.carrierName} — {quote.serviceName}</strong>
            <span>até {quote.etaDays} dias úteis</span>
          </div>
          <span className="shippingQuotePrice">
            R$ {quote.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </label>
      ))}
    </div>
  );
}
