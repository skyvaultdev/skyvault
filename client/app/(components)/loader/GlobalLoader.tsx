export default function GlobalLoader() {
  return (
    <div className="loader-overlay">
      <div className="loader-spinner"></div>
      <p>Carregando...</p>
      <style jsx>{`
        .loader-overlay {
          position: fixed;
          top: 0; left: 0;
          width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.7);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          z-index: 9999;
          color: white;
        }
        .loader-spinner {
          width: 50px; height: 50px;
          border: 5px solid #f3f3f3;
          border-top: 5px solid var(--primary, #3498db);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}