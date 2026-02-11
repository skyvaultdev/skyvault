import "./dashboard.css";
import Link from "next/link";

type Product = {
  id: number;
  name: string;
};

export default function Dashboard() {
  const products: Product[] = [
    { id: 1, name: "PRODUTO 1" },
    { id: 2, name: "PRODUTO 2" },
    { id: 3, name: "PRODUTO 3" },
    { id: 4, name: "PRODUTO 4" },
    { id: 5, name: "PRODUTO 5" },
  ];

  const stats = {
    acessos: 50000,
    vendidos: 500,
    arrecadados: 1000,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="stats">
          <div className="statCard">
            <div className="statValue">{stats.acessos.toLocaleString("pt-BR")}</div>
            <div className="statLabel">
              ACESSOS
              <br />
              REGISTRADOS
            </div>
          </div>

          <div className="statCard">
            <div className="statValue">{stats.vendidos.toLocaleString("pt-BR")}</div>
            <div className="statLabel">
              PRODUTOS
              <br />
              VENDIDOS
            </div>
          </div>

          <div className="statCard">
            <div className="statValue">
              R$ {stats.arrecadados.toLocaleString("pt-BR")}
            </div>
            <div className="statLabel">ARRECADADOS</div>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="mainArea">
          <div className="actions">
            <button className="btn btnAdd" type="button">
              <Link href="/dashboard/products/add">ADICIONAR PRODUTO</Link>
            </button>

            <button className="btn btnEdit" type="button">
              EDITAR PRODUTO
            </button>

            <button className="btn btnRemove" type="button">
              REMOVER PRODUTO
            </button>
          </div>
        </section>

        <aside className="sidebar">
          <div className="searchRow">
            <input className="searchInput" type="text" placeholder="Pesquisar..." />
            <button className="searchBtn" type="button">
              PESQUISAR PRODUTO
            </button>
          </div>

          <div className="productList">
            {products.map((p) => (
              <div className="productItem" key={p.id}>
                <span className="productName">{p.name}</span>

                <div className="productActions">
                  <button
                    className="iconBtn iconEdit"
                    type="button"
                    aria-label={`Editar ${p.name}`}
                  >
                    ✎
                  </button>

                  <button
                    className="iconBtn iconRemove"
                    type="button"
                    aria-label={`Remover ${p.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
