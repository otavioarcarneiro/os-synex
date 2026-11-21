# Etapa 5 — Finalizar App Instalável + Notificações no celular

Já existe: ícones, manifesto, receptor de notificações no app. Falta apenas o abaixo. Nada fora desta lista será feito.

## Passo 1 — Convite de instalação (1x por login)
- Aviso discreto só para Proprietário, Sócio e Administrador (cliente não vê).
- Android/Chrome/PC: botão "Instalar app".
- iPhone/Safari: instrução "Compartilhar > Adicionar à Tela de Início".
- Some se o app já estiver instalado ou se a pessoa fechar o aviso (volta no próximo login).

## Passo 2 — Ativar notificações no aparelho
- Botão "Ativar notificações" no menu do perfil e no aviso de instalação.
- Cada aparelho autorizado fica salvo para aquele usuário; botão para desativar.
- iPhone: funciona só com o app instalado na tela inicial (limitação da Apple).

## Passo 3 — Enviar notificações nos eventos que já geram e-mail
- Site fora do ar / voltou → Proprietários.
- Chamado SAC ("não tenho acesso ao e-mail") → Proprietários.
- Bloqueio administrativo de login → Proprietários.
- Fatura paga → Proprietários.
- Os e-mails continuam iguais; a notificação é adicional. Falha no envio nunca bloqueia a ação.

## Passo 4 — Verificação
- Testes automáticos de quem recebe cada aviso.
- Conferir o app sem erros. Envio real no celular só pode ser confirmado por você após publicar.

## Detalhes técnicos
- Chaves VAPID geradas e guardadas como segredos do servidor.
- Tabela `push_subscriptions` (user_id → profiles, endpoint único, chaves), RLS: usuário gerencia só as próprias; envio via servidor.
- Envio Web Push com assinatura VAPID usando Web Crypto (compatível com Workers), em `src/lib/push.server.ts`, chamado junto de `sendDownAlert`, `sendLockAlert`, SAC e `sendPaymentThanks`. Inscrições expiradas (404/410) são removidas.
- Registro do service worker existente mantido, sem cache offline; não registrar em preview.

Estimativa: ~2 a 3 créditos.
