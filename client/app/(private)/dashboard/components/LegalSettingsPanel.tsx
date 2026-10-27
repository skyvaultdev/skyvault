"use client";

import { useEffect, useState } from "react";
import "./LegalSettingsPanel.css";
import { normalizeDocument, validateDocument, documentKind } from "@/lib/legal/documentValidation";
import { buildDefaultPrivacyPolicy, buildDefaultReturnsPolicy, buildDefaultStoreTerms } from "@/lib/legal/defaultPolicies";

export default function LegalSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [storeName, setStoreName] = useState("Minha Loja");

  const [legalName, setLegalName] = useState("");
  const [documentValue, setDocumentValue] = useState("");
  const [address, setAddress] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [returnsPolicy, setReturnsPolicy] = useState("");
  const [storeTerms, setStoreTerms] = useState("");
  const [includeDigitalException, setIncludeDigitalException] = useState(true);

  const documentDigits = normalizeDocument(documentValue);
  const documentError = documentDigits.length > 0 && !validateDocument(documentDigits);
  const detectedKind = documentDigits.length > 0 ? documentKind(documentDigits) : null;

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [publicRes, legalRes] = await Promise.all([
        fetch("/api/store-settings", { cache: "no-store" }),
        fetch("/api/store-settings/legal", { cache: "no-store" }),
      ]);
      const publicJson = await publicRes.json();
      const legalJson = await legalRes.json();

      if (publicRes.ok && publicJson.data?.store_name) {
        setStoreName(publicJson.data.store_name);
      }
      if (legalRes.ok && legalJson.data) {
        const d = legalJson.data;
        setLegalName(d.legal_name ?? "");
        setDocumentValue(d.document ?? "");
        setAddress(d.address ?? "");
        setContactEmail(d.contact_email ?? "");
        setContactPhone(d.contact_phone ?? "");
        setPrivacyPolicy(d.privacy_policy ?? "");
        setReturnsPolicy(d.returns_policy ?? "");
        setStoreTerms(d.store_terms ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  function templateParams() {
    return {
      storeName,
      legalName: legalName || null,
      document: documentDigits || null,
      address: address || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
    };
  }

  async function save() {
    if (documentError) {
      setFeedback("O CPF/CNPJ informado não é válido — confira os números.");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      const res = await fetch("/api/store-settings/legal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName, document: documentDigits, address, contactEmail, contactPhone,
          privacyPolicy, returnsPolicy, storeTerms,
        }),
      });
      if (res.ok) {
        setFeedback("Salvo!");
      } else {
        const json = await res.json().catch(() => ({}));
        setFeedback(json?.error === "INVALID_DOCUMENT" ? "O CPF/CNPJ informado não é válido." : "Erro ao salvar.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="settingsPanel"><p>Carregando...</p></section>;

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Informações legais</h3>
        <p className="helperText">
          Esses dados aparecem no rodapé da loja e nas páginas de Privacidade, Trocas e Termos. Enquanto Nome/Razão
          social, CPF/CNPJ e E-mail de contato estiverem vazios, a loja não consegue finalizar vendas.
        </p>
      </div>

      <div className="legalSection">
        <h4>Identificação do responsável</h4>
        <label>
          Razão social ou nome completo
          <input
            className="settingsInput"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Ex: João da Silva ou Minha Loja LTDA"
          />
        </label>

        <label>
          CNPJ ou CPF
          <input
            className="settingsInput"
            value={documentValue}
            onChange={(e) => setDocumentValue(e.target.value)}
            placeholder="Só números"
          />
        </label>
        {documentError && <p className="legalFieldError">CPF/CNPJ inválido — confira os números digitados.</p>}
        {!documentError && detectedKind && (
          <p className="helperText">Identificado como {detectedKind === "cpf" ? "CPF" : "CNPJ"}.</p>
        )}

        <label>
          Endereço
          <textarea
            className="settingsTextarea"
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, número, bairro, cidade/UF, CEP"
          />
        </label>
        <p className="helperText">
          Opcional — mas o Decreto nº 7.962/2013 (Decreto do Comércio Eletrônico) pede um endereço físico visível
          pro consumidor. Deixe em branco se você vende como pessoa física e prefere não expor seu endereço.
        </p>

        <label>
          E-mail de atendimento
          <input
            className="settingsInput"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="contato@sualoja.com"
          />
        </label>

        <label>
          Telefone/WhatsApp de atendimento
          <input
            className="settingsInput"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </label>
      </div>

      <div className="legalSection">
        <h4>Política de Privacidade</h4>
        <p className="helperText">Exibida em /privacidade.</p>
        <textarea
          className="settingsTextarea legalPolicyTextarea"
          value={privacyPolicy}
          onChange={(e) => setPrivacyPolicy(e.target.value)}
          rows={8}
        />
        <button type="button" className="btnSecondary" onClick={() => setPrivacyPolicy(buildDefaultPrivacyPolicy(templateParams()))}>
          Usar modelo padrão
        </button>
      </div>

      <div className="legalSection">
        <h4>Política de Trocas e Devoluções</h4>
        <p className="helperText">Exibida em /trocas-e-devolucoes.</p>
        <textarea
          className="settingsTextarea legalPolicyTextarea"
          value={returnsPolicy}
          onChange={(e) => setReturnsPolicy(e.target.value)}
          rows={8}
        />
        <label className="legalCheckboxRow">
          <input type="checkbox" checked={includeDigitalException} onChange={(e) => setIncludeDigitalException(e.target.checked)} />
          Incluir ressalva pra produto digital já acessado/baixado
        </label>
        <button
          type="button"
          className="btnSecondary"
          onClick={() => setReturnsPolicy(buildDefaultReturnsPolicy(templateParams(), { includeDigitalContentException: includeDigitalException }))}
        >
          Usar modelo padrão
        </button>
      </div>

      <div className="legalSection">
        <h4>Termos de Uso (da loja, para o comprador)</h4>
        <p className="helperText">Exibida em /termos. Não confundir com o contrato da plataforma (/termos-plataforma).</p>
        <textarea
          className="settingsTextarea legalPolicyTextarea"
          value={storeTerms}
          onChange={(e) => setStoreTerms(e.target.value)}
          rows={8}
        />
        <button type="button" className="btnSecondary" onClick={() => setStoreTerms(buildDefaultStoreTerms(templateParams()))}>
          Usar modelo padrão
        </button>
      </div>

      <button className="btn" onClick={() => void save()} disabled={saving}>
        {saving ? "Salvando..." : "Salvar informações legais"}
      </button>
      {feedback && <p className="helperText">{feedback}</p>}
    </section>
  );
}
