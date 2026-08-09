"use client";

import { useRouter } from "next/navigation";

type Category = { name: string; slug: string };

export default function CategoryAutoSelect(props: {
  categories: Category[];
  current?: string;
}) {
  var { categories, current } = props;
  var router = useRouter();

  return (
    <div className="selectShell">
      <select
        className="homeSelect"
        value={current ?? ""}
        onChange={(e) => {
          var value = e.target.value;
          if (!value) {
            router.push("/");
            return;
          }
          router.push(`/catalog?category=${encodeURIComponent(value)}`);
        }}
        aria-label="Selecionar categoria"
      >
        <option value="">Todas categorias</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}