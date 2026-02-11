"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "./header.css";
import { FaUserCircle } from "react-icons/fa";

export default function Header() {
  const [menuAberto, setMenuAberto] = useState(false);
  const [isLogged, setIsLogged] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function checarLogin() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (!cancelado) setIsLogged(!!data.logged);
      } catch {
        if (!cancelado) setIsLogged(false);
      }
    }

    checarLogin();

    return () => {
      cancelado = true;
    };
  }, []);

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
        <input type="search" placeholder="Pesquisar por produto" />
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
