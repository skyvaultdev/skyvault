// Conteúdo puro do contrato (sem "use client"/"use server", sem hooks) —
// reaproveitado pela página pública (app/(public)/termos-plataforma/page.tsx,
// Server Component) E pelo gate de aceite do dashboard (client component,
// ver app/(private)/dashboard/components/AcceptPlatformTermsGate.tsx).
// platformName/platformContactEmail vêm de PLATFORM_LEGAL_NAME/
// PLATFORM_CONTACT_EMAIL (config/configuration.ts) — nunca texto fixo aqui.
export default function PlatformTermsContent({
  platformName,
  platformContactEmail,
}: {
  platformName: string;
  platformContactEmail: string;
}) {
  return (
    <>
      <h1 className="termos-title">TERMOS E CONDIÇÕES DE USO DA PLATAFORMA</h1>
      <span className="termos-span"></span>

      <p className="termos-content">
        Estes Termos e Condições de Serviço regulam o uso da plataforma de criação de lojas virtuais disponibilizada por {platformName}, doravante denominada simplesmente "Plataforma", e o usuário contratante ("Lojista"). Ao contratar, acessar ou utilizar a Plataforma, o Lojista concorda expressamente com os termos abaixo. Caso não concorde, não deverá utilizar os serviços. Dúvidas sobre este contrato podem ser enviadas para {platformContactEmail}.
      </p>
      <span className="termos-span"></span>

      <h1 className="termos-title">CLÁUSULAS</h1>

      <h2 className="termos-clausulas">1. DO OBJETO</h2>
      <p className="termos-content">
        1.1. A Plataforma consiste no fornecimento de um software como serviço (SaaS) / infraestrutura tecnológica para que o Lojista crie, personalize e gerencie a sua própria loja virtual na internet para comercialização de produtos e/ou serviços próprios.
      </p>
      <span className="termos-span"></span>

      <h2 className="termos-clausulas">2. DA ISENÇÃO DE RESPONSABILIDADE DA PLATAFORMA</h2>
      <p className="termos-content">
        2.1. <strong>Papel Tecnológico:</strong> A Plataforma atua estritamente como provedora de tecnologia e infraestrutura de hospedagem e e-commerce. Não participamos, intermediamos, co-produzimos ou revisamos as transações comerciais realizadas entre o Lojista e os consumidores finais.
      </p>

      <p className="termos-content">
        2.2. <strong>Exclusão de Responsabilidade por Vendas e Produtos:</strong> A Plataforma não se responsabiliza por:
      </p>

      <ul className="termos-list">
        <li>Qualquer dano, prejuízo, atraso, defeito, vício, falta de entrega ou inadequação dos produtos e serviços vendidos pelo Lojista em sua loja virtual.</li>
        <li>A veracidade, legalidade, procedência ou qualidade dos itens anunciados pelo Lojista.</li>
        <li>O cumprimento das obrigações fiscais, tributárias, trabalhistas ou previdenciárias por parte do Lojista.</li>
      </ul>

      <p className="termos-content">
        2.3. <strong>Litígios com Consumidores:</strong> O Lojista é o único e exclusivo responsável por atender e solucionar reclamações, procon, judiciais ou administrativas originadas de seus clientes finais (consumidores). Caso a Plataforma seja acionada judicialmente por atos atribuídos exclusivamente ao Lojista, este se obriga a requerer a imediata exclusão da Plataforma do polo passivo, arcando integralmente com custas, honorários e eventuais condenações.
      </p>
      <span className="termos-span"></span>

      <h2 className="termos-clausulas">3. DAS OBRIGAÇÕES E RESPONSABILIDADES DO LOJISTA</h2>
      <p className="termos-content">
        O Lojista compromete-se a:
      </p>

      <ul className="termos-list">
        <li><strong>3.1. Uso Legal:</strong> Utilizar a Plataforma exclusivamente para fins lícitos, sendo expressamente proibida a comercialização de produtos falsificados, roubados, contrabandeados, armas, drogas, substâncias controladas, materiais pornográficos ilegais, serviços financeiros não autorizados ou qualquer item cuja comercialização seja vedada pelas leis brasileiras.</li>
        <li><strong>3.2. Conformidade Legal:</strong> Inserir obrigatoriamente em sua loja virtual as suas próprias Políticas de Privacidade, Termos de Troca e Devolução e os Dados de Identificação da Empresa/CNPJ, em conformidade com o Código de Defesa do Consumidor (Lei nº 8.078/1990) e o Decreto do Comércio Eletrônico (Decreto nº 7.962/2013).</li>
        <li><strong>3.3. Privacidade e LGPD:</strong> Tratar os dados pessoais dos seus clientes finais (compradores) em estrita conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD), na qualidade de controlador desses dados — ver cláusula 4 abaixo.</li>
      </ul>
      <span className="termos-span"></span>

      <h2 className="termos-clausulas">4. DA PROTEÇÃO DE DADOS PESSOAIS (LGPD)</h2>
      <p className="termos-content">
        4.1. <strong>Papéis das partes:</strong> Para os fins da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), o Lojista é o <strong>CONTROLADOR</strong> dos dados pessoais dos seus clientes finais (compradores) coletados através da loja virtual, cabendo a ele decidir as finalidades e os meios de tratamento desses dados. A {platformName} atua como <strong>OPERADORA</strong>, tratando esses dados exclusivamente em nome do Lojista e segundo as instruções dele, apenas para viabilizar o funcionamento técnico da Plataforma (hospedagem, processamento de pedidos, envio de e-mails transacionais e suporte técnico).
      </p>
      <p className="termos-content">
        4.2. <strong>Finalidade restrita:</strong> A {platformName} não utiliza os dados pessoais tratados nas lojas dos Lojistas para finalidades próprias, não os vende e não os compartilha com terceiros, exceto quando estritamente necessário para prestar o serviço contratado (ex: provedores de pagamento e transportadoras escolhidos pelo próprio Lojista) ou por obrigação legal.
      </p>
      <p className="termos-content">
        4.3. <strong>Medidas de segurança:</strong> A {platformName} adota medidas técnicas e administrativas razoáveis para proteger os dados pessoais tratados na Plataforma contra acessos não autorizados e situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão.
      </p>
      <p className="termos-content">
        4.4. <strong>Exclusão ao término do contrato:</strong> Encerrada a conta do Lojista na Plataforma (por rescisão, suspensão definitiva ou solicitação do próprio Lojista), a {platformName} exclui ou anonimiza os dados pessoais dos compradores sob sua guarda dentro de um prazo razoável, salvo quando a retenção for exigida por obrigação legal ou regulatória.
      </p>
      <p className="termos-content">
        4.5. <strong>Responsabilidade do Lojista:</strong> Cabe ao Lojista, como controlador, garantir base legal adequada para o tratamento dos dados dos seus clientes, atender a eventuais solicitações de titulares de dados (confirmação, correção, exclusão, portabilidade) e manter sua própria Política de Privacidade publicada na loja, nos termos da cláusula 3.3.
      </p>
      <span className="termos-span"></span>

      <h2 className="termos-clausulas">5. DOS MEIOS DE PAGAMENTO E INTEGRAÇÕES</h2>
      <p className="termos-content">
        5.1. As transações financeiras realizadas dentro da loja do Lojista ocorrem por meio de gateways ou intermediadores de pagamento de terceiros (ex: Mercado Pago, Stripe, Pagar.me, etc.) configurados pelo próprio Lojista.
      </p>
      <p className="termos-content">
        5.2. A Plataforma não armazena dados sensíveis de cartões de crédito e não se responsabiliza por falhas, retenções de saldo, bloqueios de contas ou instabilidades ocorridas nos gateways de pagamento de terceiros.
      </p>
      <p className="termos-content">
        5.3. <strong>Documentos fiscais e tributos:</strong> a {platformName} apenas disponibiliza o espaço (a infraestrutura tecnológica) para o Lojista anunciar e vender seus produtos — ela não participa, processa nem intermedeia o pagamento das vendas, que ocorre diretamente entre o Lojista e o gateway de pagamento escolhido por ele (cláusula 5.1). O Lojista é o único e exclusivo responsável pela emissão de notas fiscais (NF-e/NFS-e) ou qualquer outro documento fiscal relativo às suas vendas, bem como pelo recolhimento de todos os tributos incidentes sobre elas. A Plataforma não emite, não intermedeia a emissão e não se responsabiliza por documentos fiscais do Lojista.
      </p>
      <span className="termos-span"></span>

      <h2 className="termos-clausulas">6. DA PROPRIEDADE INTELECTUAL</h2>
      <p className="termos-content">
        6.1. Todos os códigos-fonte, designs estruturais base, marcas, logotipos e tecnologias da Plataforma pertencem exclusivamente à {platformName}.
      </p>
      <p className="termos-content">
        6.2. O Lojista mantém todos os direitos sobre sua própria marca, logotipos, fotos e conteúdos inseridos por ele na loja, concedendo à Plataforma licença temporária estritamente necessária para a exibição técnica do site.
      </p>
      <span className="termos-span"></span>

      <h2 className="termos-clausulas">7. DA SUSPENSÃO E RESCISÃO</h2>
      <p className="termos-content">
        7.1. A Plataforma reserva-se o direito de suspender ou cancelar imediatamente a loja virtual do Lojista, sem direito a reembolso e sem aviso prévio, caso seja identificada qualquer atividade suspeita, fraudulenta, denúncias de golpes, venda de produtos ilegais ou violação destes Termos.
      </p>
      <span className="termos-span"></span>

      <h2 className="termos-clausulas">8. DO FORO E LEGISLAÇÃO APLICÁVEL</h2>
      <p className="termos-content">
        8.1. Estes Termos são regidos pelas leis da República Federativa do Brasil.
      </p>
      <p className="termos-content">
        8.2. Fica eleito o foro da Comarca de São Paulo - SP para dirimir quaisquer dúvidas ou litígios oriundos deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
      </p>
    </>
  );
}
