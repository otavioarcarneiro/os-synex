# Synex OS — acompanhamento técnico

Este arquivo registra frentes de trabalho conhecidas. O estado de cada item deve ser confirmado no código e no ambiente publicado antes de ser considerado concluído.

## Manutenção e qualidade
- [ ] Executar testes automatizados e build de produção após cada rodada de alterações.
- [ ] Revisar erros de consulta e estados de carregamento/erro nas telas principais.
- [ ] Revisar dependências e corrigir advisories sem atualizar versões indiscriminadamente.
- [ ] Revisar arquivos sem referência antes de qualquer remoção.

## Segurança — pendente de validação
- [ ] PIN mestre armazenado e validado exclusivamente no servidor, com derivação de chave apropriada.
- [ ] Revalidação de identidade da Área Restrita aplicada no servidor a cada ação protegida.
- [ ] Revogação e suspensão de sessões aplicadas também nas operações protegidas e políticas do banco.
- [ ] Restringir permissões financeiras por operação e por campo.
- [ ] Corrigir vulnerabilidades de dependências e revisar proteção SSRF.
- [ ] Executar testes autenticados com contas sintéticas para os perfis de acesso.
- [ ] Fazer implantação coordenada somente após validação em ambiente isolado e autorização explícita.

## Produto e integrações — validar no ambiente publicado
- [ ] Confirmar envio de e-mails operacionais e financeiros com domínio de envio configurado.
- [ ] Confirmar notificações push em dispositivos reais após publicação.
- [ ] Confirmar coleta do Synex Analytics nos sites externos que instalarem o código de acompanhamento.
- [ ] Validar fluxos de autenticação Google com interação real do usuário.

## Histórico de decisões
- O módulo de Analytics próprio substitui a integração GA4 prevista inicialmente.
- O envio manual de cobrança registra a fatura como pendente, evita duplicidade por projeto/mês e permite a baixa manual.
- Migrações já aplicadas são histórico do banco e não devem ser removidas como limpeza de arquivos.
