# Synex OS — Correção conservadora de segurança

## Objetivo e limites
Corrigir a implementação atual, sem reconstruir o sistema, alterar o design, apagar dados ou mudar sites, DNS, domínio e outros projetos. Preservar identificadores, relacionamentos, usuários, regras comerciais e histórico.

**Nenhuma correção foi aplicada nesta etapa.** Este plano solicita autorização para preparar e testar as mudanças em uma versão separada. Não autoriza aplicação no banco em produção, aceitação dessa versão nem publicação.

## Análise e impactos identificados
- O banco atual atende à prévia e ao aplicativo publicado. Alterar suas políticas agora afetaria usuários reais mesmo sem publicar código.
- As funções administrativas verificam papel, mas não uma autorização recente do PIN; várias telas também escrevem diretamente no banco. Corrigir apenas as funções deixaria caminhos alternativos abertos.
- `has_role`, `is_staff` e as políticas são compartilhados por todos os módulos. Exigir sessão antes de corrigir o registro inicial causaria bloqueio circular no login.
- As sessões atuais não armazenam o identificador verificável da sessão de autenticação. Não é seguro associar dispositivos antigos por suposição. A ativação estrita pode exigir novo login para sessões antigas não vinculáveis; esse impacto precisa de autorização antes da implantação.
- O PIN atual só pode ser convertido para Argon2id após uma verificação legítima do PIN: não é possível derivar um hash Argon2id equivalente apenas do hash SHA-256. Não redefinir o PIN silenciosamente.
- Administradores de Execução têm escrita ampla em projetos. Restringir campos financeiros também afeta o formulário de criação, que hoje aceita preço e contrato para esses administradores.
- Convites, envio de e-mails e alterações no provedor de autenticação não participam de uma transação do banco. Não prometer atomicidade impossível entre esses serviços.
- A revisão das migrações encontrou limite de 4.000 caracteres já existente no chat. Confirmar sua presença no banco real; a auditoria anterior não comprovou ausência dessa proteção. A lacuna de frequência é separada.
- A análise aprofundada terminou: confirmou bloqueio malicioso de contas, SSRF, consulta de papéis/departamentos e exposição do estado de bloqueio na recuperação. Seus resultados não substituem os demais achados manuais.

## Etapas de execução

### 1. Preparação isolada e inventário
Criar uma versão separada do Synex OS e confirmar que dispõe de banco de testes próprio antes de qualquer migração ou teste de escrita. Se o isolamento falhar, parar: não usar dados reais como alternativa.

Registrar esquema, políticas, privilégios, funções, triggers, dependências e todos os pontos de leitura/escrita. Usar contas e dados sintéticos dos cinco perfis. Testar os dois proprietários sem alterar suas contas reais. Não enviar e-mails, convites, mensagens ou chamadas pagas durante testes sem autorização específica.

### 2. PIN e Área Restrita
- Adicionar armazenamento do verificador acessível somente ao servidor; remover acesso direto ao hash antigo em uma transição compatível. Não retirar as configurações não sensíveis usadas pelas telas.
- Usar Argon2id de biblioteca mantida, compatível com o ambiente publicado. Medir memória, tempo e concorrência antes de fixar parâmetros; começar a avaliação com 19 MiB, duas iterações e paralelismo 1. Se não for viável, apresentar alternativa e impacto antes de adotá-la.
- Migrar o verificador antigo no próximo acesso válido, sem mudar o PIN, com atualização condicional/atômica. Considerar que o hash antigo pode ter sido copiado: uma troca voluntária do PIN será recomendada, nunca imposta silenciosamente.
- Emitir autorização restrita no servidor, vinculada ao usuário e ao identificador autenticado da sessão, com validade de 15 minutos. Revogação, suspensão e troca do PIN invalidam a autorização. `sessionStorage` deixa de decidir permissões.
- Verificar essa autorização em ações sensíveis e também em políticas/procedimentos que permitem escritas diretas. Preparar retorno ao fluxo de confirmação ao expirar, sem mudar navegação/design.
- Inicialização, alteração e contagem de falhas protegidas contra concorrência. Não registrar PIN, senha ou verificador em auditoria/logs.

### 3. Sessões e autorização
Adicionar vínculo confiável ao `session_id` autenticado e manter o registro de revogação, evitando que o mesmo token registre novamente uma sessão revogada. Registrar sessão única de equipe/clientes atomicamente; proprietários mantêm múltiplos dispositivos.

Aplicar status ativo, papel e validade da sessão em funções protegidas e RLS, inclusive regras de acesso próprio. Manter uma entrada de registro inicial limitada que não exija a sessão do CRM já criada e não conceda acesso aos dados privados.

Preservar blindagem recíproca dos proprietários e impedir revogação do próprio último acesso sem recuperação segura. Definir e testar a transição de sessões antigas antes de ativar a exigência em produção.

### 4. Financeiro e funções SQL
Separar escrita operacional de escrita financeira. Somente proprietário, com confirmação restrita recente quando exigida, altera cobrança, preços, contrato e condições financeiras. Impedir alteração indevida de `client_id`; criação operacional continua possível, sem aceitar condições financeiras arbitrárias de Execução.

Reduzir EXECUTE público/anônimo e consultas arbitrárias nas funções auxiliares; preservar chamadas necessárias das políticas. Usar `search_path` fixo, referências qualificadas e helpers que não causem recursão RLS. Conferir acessos legítimos de Jurídico a documentos sem ampliar dados financeiros.

### 5. Dependências e SSRF
Atualizar versões diretas e transitivas vulneráveis: `source-map-js >=1.2.2`, `js-yaml >=4.3.2`, `zod >=4.6.6`, `seroval >=1.6.11`, após verificar disponibilidade, compatibilidade e variantes transitivas. Não forçar Zod 4 sobre consumidores que exijam Zod 3 sem adaptação suportada. Confirmar lockfile, pacote final e scanner após atualização.

Mover o helper de uptime para módulo exclusivamente servidor. Restringir consulta aos projetos visíveis ao chamador; cron conserva seu escopo autenticado próprio. Validar HTTP(S), IPv4, IPv6, faixas privadas/reservadas, metadados, DNS e cada redirecionamento. Usar limites de tempo, bytes, redirecionamentos e concorrência. A defesa deve considerar DNS rebinding, não apenas validar o texto da URL; verificar o mecanismo de conexão disponível antes de declarar proteção completa.

### 6. Login, origens e limites de uso
Manter a regra existente: terceira falha → 10 minutos; quarta → 15; quinta → 20; sexta → bloqueio administrativo, preservando as exceções e recuperação dos proprietários. Aplicar decisões atômicas e proteção a login, registro pós-Google, convite/recuperação e revalidação. Respostas públicas não devem revelar cadastro ou bloqueio.

Há um conflito a resolver com evidências: bloqueio global por e-mail após senha errada permite bloquear vítimas. Combinar conta e origem confiável, sem aceitar IP arbitrário de cabeçalhos, e apresentar o comportamento proposto antes de alterar a regra de bloqueio global. Login direto do provedor pode continuar emitindo token; isso não pode permitir acesso ao CRM nem contornar bloqueio. Verificar recursos nativos disponíveis sem prometer interceptar caminhos gerenciados não suportados.

Convites/recuperação usam origem oficial definida no servidor: `https://os-synex.lovable.app`, atualmente publicada. Não usar o domínio personalizado ainda pendente de DNS. Verificar configuração real de redirecionamentos antes de propor mudança no provedor.

**Limites de frequência:** não existe mecanismo padrão de limitação no backend. A aprovação deste plano autoriza preparar limites próprios persistentes e atômicos no banco de testes, com custo de manutenção e contenção adicional; valores e orçamento de IA serão apresentados antes de ativar em produção. Usar tetos de entrada/saída e reserva de consumo; não inventar preços para afirmar um limite monetário garantido.

Limitar mensagens, suporte e IA por usuário/período; ler corpos por bytes com interrupção antecipada; sanitizar logs. Manter Analytics como métrica observacional, não identidade ou prova de pagamento.

### 7. Auditoria consistente
Usar procedimentos/transações e triggers apropriados para gravar alteração e auditoria juntas, incluindo ação, responsável, motivo, horário, alvo e resultado. Falha de auditoria aborta a alteração no banco. Evitar payloads com credenciais ou conteúdo privado desnecessário.

Para operações externas, usar estados pendente/concluído/falhou, idempotência e reconciliação; jamais marcar convite como concluído antes de confirmar cada etapa. Não apagar contas como compensação automática. Preservar registros existentes e evitar duplicação de faturas sob concorrência sem eliminar faturas antigas.

**Exclusão de auditoria:** manter a funcionalidade owner-only, sem alteração silenciosa. Apresentar separadamente a opção de registrar a exclusão em evidência independente ou exportação prévia; nenhuma delas será ativada sem decisão específica.

## Testes e critérios de conclusão
Para cada regra, reproduzir a falha antes da correção e repetir o mesmo teste depois. Não classificar como validado apenas por teste unitário ou compilação.

Executar matriz real em banco isolado: proprietário, sócio, Jurídico, Execução e cliente; dois clientes para isolamento e dois proprietários para blindagem. Verificar leituras cruzadas, APIs diretas, hash, autorização expirada/ausente, sessões revogadas, suspensão, financeiro, origem externa, login/PIN concorrentes, limites, SSRF/redirecionamentos/DNS e integridade da auditoria.

Executar regressão de login, recuperação, convites, usuários, PIN, projetos, documentos, faturas, chat, portal, monitoramento, Analytics e perfil. E-mails, Google e IA reais permanecem bloqueados para teste externo até autorização/recurso disponível. Usar simulações explicitamente identificadas, sem apresentá-las como validação de entrega real.

Rodar testes focados e suíte de regressão; verificar compilação automática da plataforma, erros de execução e scanners. Não executar manualmente builds do projeto. Não ignorar achados de autorização/SSRF; limites próprios exigem a autorização expressa descrita acima.

## Implantação: aprovação separada obrigatória
Antes de tocar produção, entregar diferenças, evidências, inventário de dados preservados, plano de recuperação/restauração verificável e ordem coordenada de código/banco. Não afirmar que existe backup sem confirmar.

Apresentar riscos: novo login para sessões antigas não vinculáveis; confirmação de PIN em ações antes diretas; campos financeiros indisponíveis para Execução; consumo de recursos do Argon2id e limites próprios. Não aceitar a versão separada, ativar políticas estritas no banco compartilhado, mudar configurações de autenticação ou publicar sem autorização posterior.

## Relatório final
Listar cada achado, causa, arquivos/funções/tabelas/políticas alterados, versões exatas, testes e evidências; classificar como **Corrigido e validado**, **Corrigido, mas não validado**, **Pendente** ou **Bloqueado**. Declarar explicitamente o que não foi testado e o que aguarda implantação autorizada. Não declarar o sistema livre de vulnerabilidades.