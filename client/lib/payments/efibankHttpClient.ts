import https from "https";

export type EfibankRequestOptions = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  host: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  pfx: Buffer;
  passphrase: string;
};

// EfiBank exige mTLS (certificado de cliente) em toda chamada — o `fetch`
// global do Node não expõe uma forma direta de anexar um certificado por
// requisição, então usamos o módulo `https` nativo (pfx/passphrase são
// opções de primeira classe dele) em vez de brigar com a API de agente
// customizado do undici.
export function efibankRequest<T = any>(opts: EfibankRequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

    const req = https.request(
      {
        host: opts.host,
        path: opts.path,
        method: opts.method,
        pfx: opts.pfx,
        passphrase: opts.passphrase,
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed: any = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = data;
          }

          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve(parsed as T);
          } else {
            const message =
              parsed && typeof parsed === "object"
                ? parsed.mensagem || parsed.message || JSON.stringify(parsed)
                : String(data);
            reject(new Error(`EfiBank ${opts.method} ${opts.path} -> ${status}: ${message}`));
          }
        });
      }
    );

    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
