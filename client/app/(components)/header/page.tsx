"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "./header.css";
import { FaUserCircle } from "react-icons/fa";
import { useRouter } from "next/navigation";

export default function Header() {
  const [menuAberto, setMenuAberto] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [search, setSearch] = useState(""); // ✅ estado do input
  const router = useRouter(); // ✅ navegação client-side

  useEffect(() => {
    let cancelado = false;

    async function checarLogin() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const data = await res.json();
        if (!cancelado) setIsLogged(Boolean(data.logged));
      } catch {
        if (!cancelado) setIsLogged(false);
      }
    }

    checarLogin();

    return () => {
      cancelado = true;
    };
  }, []);

  function searchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    router.push(`/search/${encodeURIComponent(q)}`);
  }

  return (
    <header className="navcontainer">
      <aside className="lateral" onClick={() => setMenuAberto(!menuAberto)}>
        <span></span>
        <span></span>
        <span></span>
      </aside>

      {menuAberto && (
        <div className="menumob">
          <ul>
            <li onClick={() => setMenuAberto(false)}>
              <Link href="/">Home</Link>
            </li>
            <li onClick={() => setMenuAberto(false)}>
              <Link href="/contact">Contact</Link>
            </li>
          </ul>
        </div>
      )}

      <nav className="navleft">
        <ul>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/contact">Contact</Link>
          </li>
        </ul>
      </nav>

      <nav className="navcenter">
        <form onSubmit={searchSubmit} className="searchForm">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por produto"
          />
        </form>
      </nav>

      <nav className="navright">
        <ul>
          <li>
            {isLogged ? (
              <Link href="/dashboard" aria-label="Minha conta" className="userBtn">
                <FaUserCircle className="userIcon" />
              </Link>
            ) : (
              <Link href="/login">Login</Link>
            )}
          </li>
        </ul>
      </nav>
    </header>
  );
}