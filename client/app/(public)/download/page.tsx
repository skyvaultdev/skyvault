"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";
import "./download.css";
import { downloadFile } from "@/lib/files/downloadFile";

type Status = "loading" | "done" | "error";

// Página intermediária pro link de download do email — abrir a rota da
// API direto (fora do app, num app de email) só navegava até o arquivo e
// mostrava/baixava sem contexto nenhum, deixando uma aba solta sem
// explicação nenhuma. Essa página dispara o download via blob (mesma
// técnica de lib/files/downloadFile.ts) e diz claramente que já pode
// fechar a aba — "fechar sozinho" só funciona se o navegador permitir
// (nem sempre, é restrição de segurança do próprio navegador quando a
// aba foi aberta fora de um script nosso), por isso sempre mostra a
// instrução em texto também.
export default function DownloadPage() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const file = params.get("file");
      if (!token || !file) {
        setStatus("error");
        return;
      }
      try {
        await downloadFile(`/api/files/products/uploads/${file}?token=${token}`, file);
        setStatus("done");
      } catch {
        setStatus("error");
      }
    }
    void run();
  }, []);

  return (
    <main className="downloadPage">
      <div className="downloadCard">
        {status === "loading" && <p className="downloadHint">Preparando seu download...</p>}

        {status === "done" && (
          <>
            <div className="downloadIcon"><Icon name="check" /></div>
            <h1>Download iniciado</h1>
            <p className="downloadHint">Você já pode fechar esta aba.</p>
            <button className="downloadCloseBtn" onClick={() => window.close()}>Fechar aba</button>
          </>
        )}

        {status === "error" && (
          <>
            <h1>Não foi possível baixar</h1>
            <p className="downloadHint">
              O link pode ter expirado ou o pedido não está mais disponível. Acesse &quot;Meus pedidos&quot; no site
              pra baixar de novo.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
