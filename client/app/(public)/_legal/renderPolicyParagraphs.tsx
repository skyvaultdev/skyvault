// Divide um texto de política em parágrafos (separados por linha em
// branco) e renderiza cada um como um <p>. `whiteSpace: pre-line` cuida das
// quebras de linha simples dentro do parágrafo — nunca HTML, nunca
// dangerouslySetInnerHTML, só texto.
export function renderPolicyParagraphs(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs.map((paragraph, i) => (
    <p key={i} className="termos-content" style={{ whiteSpace: "pre-line" }}>
      {paragraph}
    </p>
  ));
}
