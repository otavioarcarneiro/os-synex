# Os Synex

Construir o Synex OS (CRM da Synex e Portal de Clientes integrado) seguindo a especificação técnica completa em anexo (synex_crm_especificacao_completa.md), as logos fornecidas e a referência visual da tela de login.

Pontos principais definidos:
- Tela de login com divisão diagonal assimétrica: lado esquerdo com a marca Synex em destaque em fundo escuro com textura e glow sutil; lado direito em superfície #1A1E27 com campos de e-mail e senha, botão de alternar visualização de senha (ícone de olho), checkbox 'Lembrar de mim', link de 'Esqueceu sua senha?' (recuperação por e-mail com redefinição de senha), botão 'Entrar' estilizado em degradê e botão flutuante de suporte WhatsApp.
- Paleta visual: grafite escuro (#111318), superfícies (#1A1E27), destaque azul (#3478F6), azul-marinho complementar (#0D1930) e acentos funcionais discretos (verde #10B981, âmbar #F59E0B e vermelho #EF4444).
- Níveis de acesso e RBAC: Proprietário (e-mails blindados otavio.arcarneiro@gmail.com e synex.presence@gmail.com), Sócio, Administrador com subdepartamento (Jurídico e Execução) e Cliente.
- Perfil de usuário no canto superior direito: avatar circular com foto ou ícone padrão, upload de foto, campos cadastrais (nome completo, e-mail, telefone/WhatsApp), resumo de permissões ativas, modal protegido com confirmação para alterar senha e botão de logoff.
- Segurança de login: proteção contra força bruta com backoff progressivo (3 erros -> 10min, 4 erros -> 15min, 5 erros -> 20min, 6ª falha -> Bloqueio Administrativo total) gerando alerta forense (IP, hardware, OS, navegador, horário exato) com pop-up azul-marinho e vermelho no canto inferior esquerdo para liberação manual pelo proprietário após checagem no WhatsApp (11) 9 7492-7803. Sessão única simultânea para usuários comuns e multidispositivo para o proprietário.
- Gestão de usuários e auditoria: suspensão temporária reversível vs. remoção definitiva (soft delete), com obrigatoriedade de informar motivo para toda ação em trilha imutável de auditoria.
- Área Restrita exclusiva do proprietário: confirmação de identidade com revalidação e PIN mestre (que o proprietário define no primeiro acesso e pode alterar quando quiser nas configurações), com toggles liga/desliga para modo manutenção, cobrança e monitoramento.
- Módulo de Projetos e Portal do Cliente multiprojeto: relação 1:N (um cliente para múltiplos sites e perfis de Instagram), com métricas GA4, semáforo de uptime a cada 30min e documentos do projeto.
- Financeiro e Recorrência: cobrança desligada por padrão, regra de mensalidade (R$ 147 para contratos a partir de agosto, R$ 200 antes de agosto, com virada para R$ 200 em 1º de janeiro), lembretes por e-mail 3 dias antes e no vencimento, chave PIX (synex.presence@gmail.com) em nome da responsável legal, baixa manual e e-mail de agradecimento.
- Comunicação interna: canais de chat (Geral, Jurídico, Execução, Parceiros e DMs) com supervisão total do proprietário e controle de envio; aba de anotações (potenciais clientes e ideias); e widget de suporte com IA e transbordo manual.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://os-synex.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9c712e27-acf4-4bd5-9c4d-203ff12b2519).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
