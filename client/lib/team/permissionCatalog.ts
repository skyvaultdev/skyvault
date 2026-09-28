// Catálogo das permissões que a equipe pode receber — os ids são exatamente
// as strings já checadas pelas rotas (requirePermission) e pela sidebar da
// dashboard, então cargos novos funcionam sem mexer em nenhuma delas.
export type PermissionDef = { id: string; label: string; description: string; group: string };

export const PERMISSION_CATALOG: PermissionDef[] = [
  { id: "dashboard.access", label: "Acessar a dashboard", description: "Entrar no painel da loja (necessário pra qualquer outra permissão ter efeito).", group: "Geral" },
  { id: "store.customize", label: "Personalizar a loja", description: "Cores, background, logo, nome, promoções, avisos e configurações gerais.", group: "Geral" },
  { id: "chat.access", label: "Atender chat e tickets", description: "Ver e responder conversas e tickets de suporte.", group: "Atendimento" },
  { id: "products.read", label: "Ver produtos", description: "Visualizar produtos e arquivos cadastrados.", group: "Catálogo" },
  { id: "products.write", label: "Gerenciar produtos e estoque", description: "Criar/editar produtos, estoque, perguntas e avaliações.", group: "Catálogo" },
  { id: "orders.read", label: "Ver pedidos", description: "Consultar pedidos e o que foi entregue.", group: "Vendas" },
  { id: "orders.manage", label: "Gerenciar pedidos", description: "Cancelar, reembolsar, marcar pago/entregue e atualizar envios.", group: "Vendas" },
  { id: "shipping.manage", label: "Gerenciar frete", description: "Transportadoras e configurações de envio.", group: "Vendas" },
  { id: "shipping.credentials", label: "Credenciais de frete", description: "Ver/alterar credenciais do Melhor Envio.", group: "Vendas" },
  { id: "payments.manage", label: "Gerenciar pagamentos", description: "Métodos aceitos e markup de frete.", group: "Financeiro" },
  { id: "resellers.manage", label: "Gerenciar revendedores", description: "Convidar revendedores, comissões e saques.", group: "Financeiro" },
  { id: "users.manage", label: "Gerenciar usuários", description: "Administração de contas de clientes.", group: "Equipe" },
  { id: "team.manage", label: "Gerenciar equipe", description: "Criar cargos, editar permissões e membros (respeitando a hierarquia).", group: "Equipe" },
];

export const ALL_PERMISSION_IDS = PERMISSION_CATALOG.map((p) => p.id);
