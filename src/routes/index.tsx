import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Synex OS — Acesso" },
      { name: "description", content: "Acesse o Synex OS, CRM e Portal de Clientes da Synex Digital Presence." },
      { property: "og:title", content: "Synex OS — Acesso" },
      { property: "og:description", content: "CRM e Portal de Clientes da Synex Digital Presence." },
    ],
  }),
  beforeLoad: () => { throw redirect({ to: "/auth" }); },
});
