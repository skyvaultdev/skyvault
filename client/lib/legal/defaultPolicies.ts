// Modelos padrão em português pra preencher as 3 políticas da loja quando o
// campo ainda está vazio — usados tanto pelas páginas públicas
// (app/(public)/privacidade, /trocas-e-devolucoes, /termos) quanto pelo
// botão "Usar modelo padrão" do LegalSettingsPanel (dashboard). Funções
// puras (sem import de banco/next) pra poderem rodar também no client.
//
// Texto final é só string — cada página divide por linha em branco e
// renderiza um <p> por parágrafo (ver renderPolicyParagraphs em
// lib/legal/renderPolicyParagraphs.tsx), nunca HTML.

export type PolicyTemplateParams = {
  storeName: string;
  legalName?: string | null;
  document?: string | null;
  address?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

function responsibleLine(p: PolicyTemplateParams): string {
  const parts = [p.legalName, p.document].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : p.storeName;
}

function contactLine(p: PolicyTemplateParams): string {
  const parts = [p.contactEmail, p.contactPhone].filter(Boolean);
  return parts.length > 0 ? parts.join(" ou ") : "[e-mail de contato não cadastrado]";
}

// Nenhum template começa com um título repetido — as 3 páginas (e o
// preview do dashboard) já renderizam o próprio <h1>, então o texto
// salvo em store_settings é só o corpo da política.
export function buildDefaultPrivacyPolicy(p: PolicyTemplateParams): string {
  return [
    `Esta Política de Privacidade descreve como a ${p.storeName} coleta, usa e protege os dados pessoais dos clientes que utilizam esta loja virtual, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).`,
    `1. Dados coletados\nColetamos os dados necessários para processar seu pedido e prestar atendimento: nome, e-mail, telefone, endereço de entrega (quando aplicável) e dados de pagamento, processados diretamente pelo provedor de pagamento escolhido no checkout — nunca armazenamos dados completos de cartão. Caso o vendedor precise emitir nota fiscal ou outro documento da venda, ele pode solicitar CPF/CNPJ adicionalmente: essa emissão é responsabilidade exclusiva do vendedor, não da plataforma que hospeda esta loja.`,
    `2. Finalidade do tratamento\nOs dados são usados exclusivamente para processar pedidos, enviar comunicações sobre o pedido, prestar suporte e cumprir obrigações legais e fiscais. Não vendemos nem compartilhamos seus dados com terceiros para fins de marketing sem o seu consentimento.`,
    `3. Compartilhamento com terceiros\nSeus dados podem ser compartilhados com provedores de pagamento, transportadoras e outros prestadores de serviço estritamente necessários para a execução do pedido.`,
    `4. Seus direitos\nVocê pode solicitar a qualquer momento a confirmação, correção, portabilidade ou exclusão dos seus dados, entrando em contato pelo ${contactLine(p)}.`,
    `5. Segurança\nAdotamos medidas técnicas e organizacionais razoáveis para proteger seus dados contra acesso não autorizado, perda ou alteração.`,
    `6. Responsável pelo tratamento\n${responsibleLine(p)}${p.address ? `, ${p.address}` : ""}, é o responsável pelo tratamento dos dados coletados nesta loja. Contato: ${contactLine(p)}.`,
  ].join("\n\n");
}

export function buildDefaultReturnsPolicy(
  p: PolicyTemplateParams,
  options?: { includeDigitalContentException?: boolean }
): string {
  const includeDigitalException = options?.includeDigitalContentException ?? true;

  const paragraphs = [
    `1. Direito de arrependimento\nConforme o art. 49 do Código de Defesa do Consumidor (Lei nº 8.078/1990), você tem o direito de desistir da compra em até 7 (sete) dias corridos, contados do recebimento do produto ou da contratação do serviço, sem necessidade de justificativa, por se tratar de uma compra feita fora do estabelecimento físico.`,
    `2. Como solicitar\nPara exercer esse direito, entre em contato pelo ${contactLine(p)}, informando o número do pedido.`,
    `3. Reembolso\nConfirmada a desistência dentro do prazo, o valor pago será reembolsado integralmente, pelo mesmo meio de pagamento utilizado na compra.`,
    `4. Produtos com defeito\nProdutos com defeito de fabricação podem ser trocados ou ter o valor reembolsado dentro do prazo legal de garantia, conforme o Código de Defesa do Consumidor.`,
  ];

  if (includeDigitalException) {
    paragraphs.push(
      `5. Produtos digitais\nPara produtos digitais (chaves de ativação, arquivos para download ou conteúdo de acesso imediato), o prazo de arrependimento do item 1 deixa de valer depois que o conteúdo já tiver sido acessado ou baixado, dada a natureza do produto — uma vez entregue, o conteúdo digital não pode ser "devolvido". Enquanto o conteúdo não for acessado/baixado, o direito de arrependimento continua valendo normalmente.`
    );
  }

  return paragraphs.join("\n\n");
}

export function buildDefaultStoreTerms(p: PolicyTemplateParams): string {
  return [
    `Estes Termos de Uso regulam a compra de produtos na loja virtual ${p.storeName}, operada por ${responsibleLine(p)}.`,
    `1. Sobre a loja\nA ${p.storeName} é uma loja virtual operada por ${responsibleLine(p)}, com atendimento pelo ${contactLine(p)}.`,
    `2. Pedidos e pagamento\nOs pedidos são confirmados após a aprovação do pagamento pelo provedor escolhido no checkout. Preços e disponibilidade dos produtos podem mudar sem aviso prévio até a confirmação do pedido.`,
    `3. Entrega\nPara produtos digitais, a entrega ocorre automaticamente após a confirmação do pagamento. Para produtos físicos, o prazo de entrega é informado no checkout, de acordo com a transportadora escolhida.`,
    `4. Trocas, devoluções e privacidade\nConsulte nossas páginas de Política de Trocas e Devoluções e Política de Privacidade para mais detalhes sobre esses temas.`,
    `5. Atendimento\nDúvidas, reclamações ou solicitações podem ser enviadas pelo ${contactLine(p)}.`,
  ].join("\n\n");
}
