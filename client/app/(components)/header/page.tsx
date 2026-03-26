"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./header.css";
import { FaUserCircle, FaPlus, FaMinus, FaTrash } from "react-icons/fa";
import { FiShoppingCart, FiX, FiLogOut, FiPackage } from "react-icons/fi";
import { useRouter } from "next/navigation";

type CartItem = {
  cart_item_id: number;
  product_name: string;
  slug: string;
  variation_name: string;
  unit_price: number;
  quantity: number;
  image_url: string;
  stock_count: number;
  is_unlimited: boolean;
};

export default function Header() {
  const [menuAberto, setMenuAberto] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [cartAberto, setCartAberto] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [dropAberto, setDropAberto] = useState(false);
  const router = useRouter();

  async function fetchData() {
    try {
      const authRes = await fetch("/api/auth/me");
      const authData = await authRes.json();
      setIsLogged(Boolean(authData.logged));
      setIsAdmin(authData.admin === true);


      const cartRes = await fetch("/api/cart");
      const cartData = await cartRes.json();
      if (cartData.ok) {
        setCartItems(cartData.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      fetchData();
      setCartAberto(true);
    };
    window.addEventListener("abrirCarrinho", handleUpdate);
    return () => window.removeEventListener("abrirCarrinho", handleUpdate);
  }, []);

  function searchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    router.push(`/search/${encodeURIComponent(q)}`);
  }

  async function updateQuantity(id: number, newQty: number) {
    try {
      const res = await fetch(`/api/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart_item_id: id, quantity: newQty }),
      });

      const data = await res.json();

      if (res.ok) {
        if (newQty <= 0) {
          setCartItems((prev) => prev.filter((item) => item.cart_item_id !== id));
        } else {
          setCartItems((prev) =>
            prev.map((item) => (item.cart_item_id === id ? { ...item, quantity: newQty } : item))
          );
        }
      } else {
        if (data.message === "INSUFFICIENT_STOCK") {
          alert("Quantidade máxima em estoque atingida.");
        } else {
          console.error("Erro ao atualizar carrinho:", data.message);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  const cartTotal = cartItems.reduce((acc, item) => acc + item.unit_price * item.quantity, 0);

  const CartContent = () => (
    <div className="cartDropdown">
      <div className="cartHeader">
        <h3>Carrinho</h3>
        <button onClick={() => setCartAberto(false)} className="closeBtncart">
          <FiX size={20} />
        </button>
      </div>
      <div className="cartList">
        {cartItems.length === 0 ? (
          <p className="emptyMsg">Seu carrinho está vazio.</p>
        ) : (
          cartItems.map((item) => {
            const canIncrease = item.is_unlimited || item.quantity < item.stock_count;

            return (
              <div key={item.cart_item_id} className="cartItemContainer">
                <div className="cartItemMain">
                  <img src={item.image_url || "/file.svg"} alt={item.product_name} className="cartItemImg" />
                  <div className="cartItemTitle"><h4>{item.product_name}</h4></div>
                </div>
                <div className="cartItemSub">
                  <div className="subDetails">
                    <span className="arrow">↳</span>
                    <div>
                      <p className="varName">{item.variation_name}</p>
                      <p className="itemPrice">R$ {Number(item.unit_price).toFixed(2).replace(".", ",")}</p>
                    </div>
                  </div>
                  <div className="cartActions">
                    <div className="qtyBox">
                      <button
                        className="qtyBtn"
                        onClick={() => updateQuantity(item.cart_item_id, item.quantity - 1)}
                      >
                        <FaMinus size={10} />
                      </button>

                      <span className="qtyValue">{item.quantity}</span>

                      <button
                        className={`qtyBtn ${!canIncrease ? "disabledQty" : ""}`}
                        onClick={() => canIncrease && updateQuantity(item.cart_item_id, item.quantity + 1)}
                        disabled={!canIncrease}
                        title={!canIncrease ? "Limite de estoque atingido" : ""}
                      >
                        <FaPlus size={10} />
                      </button>
                    </div>
                    <button className="deleteBtn" onClick={() => updateQuantity(item.cart_item_id, 0)}><FaTrash size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="cartFooter">
        <div className="cartTotalRow">
          <span>Subtotal</span>
          <strong>R$ {cartTotal.toFixed(2).replace(".", ",")}</strong>
        </div>
        <button className="checkoutBtn" disabled={cartItems.length === 0} onClick={() => { if (cartItems.length > 0) router.push("/checkout"); setCartAberto(false); }}>
          Ir para checkout!
        </button>
      </div>
    </div>
  );

  return (
    <header className="navcontainer">
      <aside className="lateral" onClick={() => setMenuAberto(!menuAberto)}>
        <span></span><span></span><span></span>
      </aside>

      {menuAberto && (
        <>
          <div className="menuOverlay" onClick={() => setMenuAberto(false)}></div>
          <div className="menumob">
            <ul>
              <li onClick={() => setMenuAberto(false)}><Link href="/">Home</Link></li>
              <li onClick={() => setMenuAberto(false)}>
                <button className="cartButton2" onClick={() => setCartAberto(!cartAberto)}>
                  Carrinho <FiShoppingCart size={20} />
                </button>
              </li>
            </ul>
          </div>
        </>
      )}

      <nav className="navleft">
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/contact">Contact</Link></li>
        </ul>
      </nav>

      <nav className="navcenter">
        <form onSubmit={searchSubmit} className="searchForm">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por produto" />
        </form>
      </nav>

      <nav className="navright">
        <div className="cartWrapper">
          <button className="cartButton" onClick={() => setCartAberto(!cartAberto)}>
            <FiShoppingCart size={22} />
            {cartItems.length > 0 && <span className="cartBadge">{cartItems.length}</span>}
          </button>
          {cartAberto && (
            <>
              <div className="cartOverlay" onClick={() => setCartAberto(false)}></div>
              <CartContent />
            </>
          )}
        </div>

        <ul className="userNavList">
          <li>
            {isLogged ? (
              <div className="userMenuWrapper">
                <button
                  type="button"
                  className="userBtn"
                  onClick={() => setDropAberto(prev => !prev)}
                >
                  <FaUserCircle className="userIcon" />
                </button>

                {dropAberto && (
                  <>
                    <div
                      className="dropOverlay"
                      onClick={() => setDropAberto(false)}
                    />

                    <div className="userDropdown">

                      { }
                      {isAdmin && (
                        <>
                          <Link
                            href="/dashboard"
                            className="userDropdownItem"
                            onClick={() => setDropAberto(false)}
                          >
                            <FaUserCircle />
                            Dashboard
                          </Link>

                          <hr className="dropdownDivider" />
                        </>
                      )}

                      { }
                      <Link
                        href="/orders"
                        className="userDropdownItem"
                        onClick={() => setDropAberto(false)}
                      >
                        <FiPackage />
                        Orders
                      </Link>

                      <hr className="dropdownDivider" />

                      {/* LOGOUT */}
                      <button
                        className="userDropdownItem"
                        onClick={async () => {
                          try {
                            await fetch("/api/auth/logout", {
                              method: "POST",
                            });

                            setDropAberto(false);
                            setIsLogged(false);
                            setIsAdmin(false);
                            setCartItems([]);

                            router.refresh();
                            router.push("/");
                          } catch (err) {
                            console.error("Erro ao fazer logout:", err);
                          }
                        }}
                      >
                        <FiLogOut />
                        Logout
                      </button>

                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/login" className="loginbtn">Login</Link>
            )}
          </li>
        </ul>
      </nav>
    </header>
  );
}