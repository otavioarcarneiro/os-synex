# Synex OS — Auditoria de segurança

**Data:** 11/11/2026 UTC. **Estado:** revisão manual inicial concluída; análise automatizada aprofundada em andamento. Não é certificado de segurança nem pentest completo. Nenhuma correção, rotação de chave ou alteração de permissões foi aplicada nesta auditoria.

## Resumo executivo
A verificação básica automatizada não encontrou problemas. A revisão do código, das permissões reais e das dependências encontrou riscos altos que essa verificação básica não cobre. Não considerar o sistema seguro ou a auditoria encerrada enquanto estes pontos e os testes autenticados não forem tratados.

### Riscos altos

1. **Hash do PIN mestre acessível à equipe.** `system_settings` possui política SELECT para `is_staff(auth.uid())` sem isolamento de coluna. A consulta de privilégios confirmou SELECT de `master_pin_hash` para authenticated. A interface selecionar apenas outras colunas não protege a API. O PIN usa SHA-256 simples com salt, inadequado para PIN curto; uma cópia do hash permite tentativas offline. **Prioridade:** separar o verificador em armazenamento exclusivamente servidor, revogar leitura da coluna, trocar para derivação de chave resistente e limitar tentativas. Evidências: `src/lib/admin.functions.ts:123–130`, política `staff read settings`.

2. **Confirmação da Área Restrita existe apenas na tela.** `synex_sudo_until` em sessionStorage libera a interface. `verifySudo` não emite autorização verificável no servidor; criar usuários, alterar papéis e configurações não exigem confirmação recente de PIN. O proprietário autenticado continua autorizado pela regra de papel, mas a proteção adicional prometida é contornável. **Prioridade:** autorização curta vinculada à identidade e sessão, verificada em cada ação e também nos caminhos de escrita direta. Evidências: `app.restrita.tsx:24–34`, `admin.functions.ts:8–10,19–49,115–132`. UPDATE da coluna de hash também está concedido a authenticated, limitado pela política owner, permitindo ao owner alterar o hash fora do fluxo de senha/PIN.

3. **Revogação, suspensão e sessão única não são impostas em todas as operações.** O guard consulta `active_sessions` a cada 30s, mas a validação dos pedidos protegidos verifica o token, não a sessão do CRM. `has_role`/`is_staff` consultam papéis sem status ativo nem vínculo a sessão. Políticas de dados não verificam revogação. Excluir uma linha de sessão não invalida automaticamente o token de acesso já emitido. **Prioridade:** impor status ativo e revogação nos pedidos e nas políticas, com vínculo confiável à sessão de autenticação. Evidências: `session-guard.tsx:29–38`, `auth-middleware.ts:94–108`, funções SQL `has_role` e `is_staff`. Confirmação de exploração com usuário real ainda pendente.

4. **Execução pode alterar campos financeiros.** A política `projects write` concede ALL a proprietário ou admin de Execução sem separar colunas. Logo, admin de Execução pode modificar `billing_enabled`, `setup_price`, `contract_start` e vinculação de cliente por pedido direto, embora o botão de cobrança esteja desabilitado para ele. **Prioridade:** restringir colunas e separar operações financeiras exclusivas do proprietário. Evidências: política real `projects write`; `app.projetos.tsx`, controle `billing_enabled`.

5. **Vulnerabilidades conhecidas nas dependências.** Scanner de produção encontrou 12 entradas de dependência/advisory, não 12 falhas independentes: source-map-js (negação de serviço, correção 1.2.2), js-yaml (consumo CPU, correção 4.3.2 cobrindo dois avisos), Zod (exaustão de memória, correção indicada 4.6.6), Seroval (injeção ao serializar objetos especiais, correção 1.6.11 cobrindo dois avisos). Dependências diretas afetadas: @tailwindcss/vite, @tanstack/react-start, @tanstack/router-plugin, @tanstack/react-router e zod. Há duplicação por caminho transitivo. O scanner classifica os primeiros como altos e Seroval como moderado. A exploração na aplicação não foi demonstrada; atualizar com compatibilidade e testes, sem assumir que trocar apenas a dependência direta remove todas as versões transitivas.

### Outros riscos importantes

6. **Uptime sem proteção contra SSRF.** `runUptimeCheck` busca URL cadastrada com `redirect: follow`, sem bloquear IPs privados, loopback ou destinos após redirecionamento. Admin de Execução pode cadastrar/modificar projetos; `checkUptimeNow` usa leitura privilegiada e permite qualquer staff, sem limitar projetos pela visibilidade do chamador. **Impacto:** requisições a destinos indevidos e consumo de recursos. Acesso real a rede interna depende do ambiente e não foi explorado. Prioridade: destinos HTTP(S) públicos validados, revalidar redirecionamentos, ler projetos com permissões do chamador e limitar frequência/concor­rência. Evidência: `admin.functions.ts:152–179`.

7. **Backoff pode ser contornado por login direto.** A proteção progressiva está em `secureLogin`; o serviço de autenticação aceita senha diretamente e o próprio aplicativo faz isso ao trocar senha. As políticas não impõem `login_security` nem registro obrigatório de sessão. Há também leitura e atualização separadas do contador, sujeitas a concorrência, e bloqueio baseado apenas no e-mail permite tentativas maliciosas bloquearem uma vítima. Limites nativos de autenticação podem mitigar parte do risco, mas suas configurações não foram verificadas. Prioridade: proteção atômica, limites por origem/conta e exigir as mesmas condições para todos os caminhos de acesso.

8. **Rastreabilidade incompleta.** Baixa de fatura, mudanças de configuração, revogação individual, congelamento de canal, projetos e documentos fazem escrita direta sem registro obrigatório de motivo. Em `createUser`/`userAction`, várias escritas e a inserção de auditoria não verificam os erros retornados nem formam uma transação; pode haver sucesso parcial sem trilha íntegra. Prioridade: operações atômicas e auditoria obrigatória. A exclusão de auditoria por proprietário é requisito explícito e não foi tratada como falha de autorização; contudo elimina evidência, inclusive o motivo da limpeza. Recomenda-se discutir trilha independente para uso real.

9. **Convites e recuperação aceitam origem enviada pelo cliente.** `data.origin` passa apenas validação de URL, sendo usado na geração do link. Não há lista local de origens autorizadas. O serviço de autenticação pode restringir redirecionamentos; essa configuração não foi verificada. Não foi enviado e-mail de teste. Prioridade: origem confiável determinada pelo servidor/lista permitida. Evidências: `auth.functions.ts:103–118`, `admin.functions.ts:24–32`.

10. **Mensagens e IA sem limites suficientes de uso.** Suporte limita corpo a 2.000 caracteres e verifica titularidade do atendimento; porém não limita frequência/custo por usuário. Chat aceita escrita direta, e o limite de 4.000 da interface pode ser contornado. Collector lê o corpo inteiro antes de verificar seu tamanho quando Content-Length não está presente. Prioridade: limites no servidor/banco, orçamento da IA e leitura de corpo limitada por bytes. Origin do collector é forjável por clientes não navegador; métricas permanecem observacionais, nunca prova de pagamento.

11. **Funções auxiliares acessíveis sem necessidade.** `has_role`, `is_staff`, `user_department` e `can_revoke_session` possuem EXECUTE público/anon e são SECURITY DEFINER, permitindo consultar informações de autorização com UUID conhecido. Não devolvem diretamente listas de perfis nem concedem papel. Prioridade: reduzir EXECUTE a quem precisa e limitar consulta de identidades conforme o uso legítimo.

12. **PIN e revalidação sem limitação própria de tentativas.** `verifySudo` e `changePin` não mantêm contador/bloqueio de PIN. Tentativas repetidas de senha reutilizam autenticação direta sem backoff do CRM. Primeiro cadastro do PIN também faz leitura e escrita separadas, sujeitas a concorrência entre proprietários. Prioridade: limites persistentes, inicialização atômica e validação recente.

## Chaves e dados visíveis no navegador
- Identifiquei configuração pública de conexão e chave publishable. Sua presença no navegador é prevista; não é chave administrativa. A segurança depende das políticas de acesso, que apresentaram as falhas acima.
- IDs de projetos e código Synex Analytics são públicos por desenho; não autenticam pagamentos.
- E-mails dos proprietários, contato e PIX aparecem no código como dados de negócio; não são credenciais.
- Os acessos de IA, administração e agendamento são lidos de variáveis de servidor. Não encontrei segredo administrativo literal no código frontend revisado. Isso **não** é comprovação sobre todos os arquivos já publicados: o pacote final de produção e histórico completo não foram examinados.
- Tokens de acesso/renovação da própria sessão ficam no navegador como parte do login. Não foram exibidos, copiados para relatório ou enviados a terceiros. Não há evidência de vazamento confirmado nesta auditoria.
- O hash do PIN é dado sensível efetivamente alcançável pela política de equipe, ainda que não seja mostrado pela interface.

## Inventário por função
| Função/caminho | Avaliação |
|---|---|
| secureLogin | Backoff existente; contorno por outros caminhos, concorrência; aceita perfil ausente no servidor antes do bloqueio da interface |
| registerSession | Verifica perfil, papel, e-mail e bloqueio; exclusão/inserção de sessão não atômicas; erros de escrita não tratados |
| touchSession | Confere sessão/usuário/status; não é barreira para demais pedidos |
| requestPasswordReset | Resposta geralmente genérica; origem não restrita; sem limite próprio; bloqueio administrativo revela estado |
| createUser | Checagem de proprietário e e-mail blindado presentes; sem autorização recente PIN; escrita parcial/auditoria sem tratamento de erro |
| userAction | Checagem owner e blindagem mútua presentes; sem autorização recente PIN; operação parcial possível |
| releaseLock | Owner necessário; sem confirmação recente PIN; erros de escrita não tratados |
| sudoStatus | Owner necessário; não devolve hash; coluna segue legível diretamente por staff |
| verifySudo | Revalida senha/PIN; não cria autorização servidor para próximas ações; hash fraco, sem contador PIN |
| changePin | Revalida senha/PIN; ausência de limite PIN e alternativa de escrita direta owner |
| runUptimeCheck | Helper com acesso privilegiado; SSRF e ausência de delimitação pela visibilidade |
| checkUptimeNow | Staff necessário, mas escopo amplo e sem frequência máxima |
| generateMonthInvoices | Owner necessário; concorrência pode duplicar fatura e inserção não tem erro tratado; sem confirmação recente PIN/auditoria |
| sendSupportMessage | Autenticado e titularidade do ticket verificada; ausência de limite de custo/frequência; logs de erro da IA não são sanitizados por conteúdo |
| /api/public/jobs/uptime | Segredo de agendamento obrigatório; rejeição sem credencial verificada; herda riscos do helper uptime |
| /api/public/analytics/collect | Schema estrito, origem registrada, limite/deduplicação no banco; corpo lido inteiro; origem não prova identidade |
| Perfil e troca de senha | Campos sensíveis protegidos por trigger; campos pessoais gravados diretamente; revalidação chama login direto |
| Google | Cadastro de identidade nova não autorizada bloqueado por trigger; fluxo real e configurações do provedor não testados |
| Reset de senha | Atualização pela sessão de autenticação; sucesso e erros posteriores não testados com link real |

## Proteções encontradas e verificações feitas
- Todas as 16 tabelas públicas consultadas possuem RLS ativo; isso não garante correção das políticas.
- Papéis ficam em tabela própria, sem escrita disponível à equipe pela política consultada.
- Trigger protege status/departamento/e-mail do perfil contra usuário não proprietário e protege papel proprietário.
- Revogação de proprietário contra outro proprietário é negada tanto na ação quanto na política específica; não executada com duas sessões reais.
- Middleware CSRF para server functions está instalado; testes de ataque CSRF completos não foram executados.
- Teste em navegador: `/app/restrita` e `/portal` sem sessão redirecionam para `/auth`; login renderiza.
- Pedido sem credencial para uptime retornou **401**.
- Payload inválido para analytics retornou **400**.
- Mensagens são renderizadas como texto React, sem HTML bruto encontrado nas áreas revisadas.

## Limites e próximos passos
A análise aprofundada automatizada foi iniciada e notificará ao terminar; não foi tratada como concluída. Sem sessão de teste disponível nesta etapa, não foram executados login real, matriz de permissões owner/sócio/jurídico/execução/cliente, revogação real, Google, convites, recuperação ou exploração autenticada. Não houve teste invasivo, envio de mensagens/e-mails, exclusão de registros, alteração financeira ou ataque a rede interna. Configuração hospedada de cadastro, MFA, senha, redirecionamentos, proteção contra senhas vazadas e limites nativos permanece não verificada.

Ordem recomendada: isolar hash/PIN e reforçar autorização adicional; revogação/status em todos os acessos; restringir campos financeiros; corrigir dependências; bloquear SSRF; tornar ações/auditoria atômicas; completar testes reais de cada papel e consolidar os resultados da análise aprofundada. As correções não foram implementadas porque o pedido foi auditar e notificar.
