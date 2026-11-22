# Synex OS

Aplicação CRM da Synex Digital Presence e Portal de Clientes, desenvolvida com TanStack Start, React, TypeScript e Supabase.

**Aplicação:** https://os-synex.lovable.app  
**Projeto no Lovable:** https://lovable.dev/projects/9c712e27-acf4-4bd9-9c4d-203ff12b2519

## Desenvolvimento

O projeto utiliza Bun e mantém o arquivo `bun.lock` para registrar as versões das dependências.

```bash
git clone <url-do-repositorio>
cd os-synex
bun install
bun run dev
```

## Comandos disponíveis

```bash
bun run dev       # ambiente local
bun run build     # build de produção
bun run preview   # visualizar o build
bun run lint      # análise estática
bun run test      # testes automatizados
```

## Variáveis de ambiente

Configure as variáveis necessárias no ambiente local e nos serviços de hospedagem/Lovable. Não coloque chaves privadas, tokens ou credenciais no Git. Arquivos `.env` e `.env.*` são ignorados pelo Git; use `.env.example` apenas para documentar nomes de variáveis, sem valores secretos.

## Banco de dados

As migrações versionadas ficam em `drizzle/migrations/`. Não apague, renomeie ou edite migrações já aplicadas no banco de produção como parte de uma limpeza de arquivos. Novas alterações de estrutura devem ser feitas em novas migrações.

## Sincronização com Lovable

O repositório GitHub é a referência do código versionado. Alterações feitas no Lovable, Claude ou em outros ambientes só passam a integrar a versão compartilhada depois de serem sincronizadas/commitadas no repositório. Antes de iniciar uma nova alteração, confira a branch `main` para evitar trabalhar sobre uma cópia desatualizada.
