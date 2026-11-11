# Correção dos dois riscos selecionados

## Escopo
Corrigir somente o bloqueio indevido de contas por tentativas de terceiros e o direcionamento inseguro das verificações de disponibilidade. Não alterar nem ignorar os outros três achados do scanner.

## Decisão necessária: bloqueio de login
O comportamento atual bloqueia uma conta inteira quando qualquer pessoa erra a senha desse e-mail. Manter esse comportamento mantém o risco identificado.

Proponho aplicar os intervalos de 10, 15 e 20 minutos e a liberação administrativa à origem das tentativas, não à conta da vítima. Uma pessoa com a senha correta não ficará bloqueada pelas falhas de terceiros. Bloqueios administrativos existentes serão preservados; sua liberação continuará exclusiva do proprietário. Os alertas continuarão disponíveis, distinguindo bloqueio de origem e bloqueio de conta.

**Efeito funcional:** novas falhas anônimas não poderão gerar um bloqueio global da conta. Esta mudança da regra de segurança precisa da sua aprovação antes da implementação.

## Monitoramento de sites
- Permitir apenas destinos públicos HTTP/HTTPS, bloqueando endereços internos, locais, reservados e serviços de metadados, inclusive IPv6.
- Validar cada redirecionamento antes de segui-lo, com limites de tempo e de redirecionamentos.
- Verificar os endereços de destino e a proteção contra mudanças de DNS antes de usar o transporte de rede do ambiente publicado; não tratar uma verificação isolada de DNS como proteção completa.
- Consultas manuais alcançarão somente projetos que o solicitante pode visualizar; o agendamento continuará funcionando.
- Preservar URLs e projetos cadastrados: uma URL insegura não será acessada nem apagada.

## Preservação e riscos
Não apagar registros, alterar DNS, modificar outros aplicativos ou mudar a identidade visual. Acrescentar apenas armazenamento necessário para controles de tentativas e alertas, com alterações aditivas. A proteção de destinos pode recusar URLs internas anteriormente aceitas; sites públicos legítimos devem continuar funcionando.

## Detalhes técnicos e validação
- Contadores persistentes e atômicos, acessíveis apenas ao servidor, sem senhas ou tokens nos registros.
- Separar as novas tentativas anônimas dos registros globais existentes de `login_security`; ajustar apenas os caminhos relacionados ao achado selecionado.
- Centralizar o acesso seguro de uptime em um módulo exclusivo do servidor, compartilhado pela ação manual e pelo agendamento.
- Testes de isolamento das tentativas, concorrência, preservação dos bloqueios existentes, destinos IPv4/IPv6 e redirecionamentos maliciosos, além dos testes existentes relacionados.
- Verificar os resultados disponíveis das verificações automáticas da plataforma, sem executar manualmente o build.
- Marcar apenas os dois achados selecionados como corrigidos após implementar e verificar; os demais permanecerão intactos.