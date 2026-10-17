# Banco de dados (Supabase)

Projeto: `open-higgsfield` (região sa-east-1). As migrações foram aplicadas
pelo painel/MCP do Supabase com estes nomes:

1. `studio_core_schema` — equipe por convite (`members` + gatilho que bloqueia
   e-mails não convidados), motores (`engines`, chaves criptografadas pelo
   servidor), histórico compartilhado (`generations`, com realtime), tokens do
   Codex (`access_tokens`), RLS em todas as tabelas e as funções `mcp_*`
   usadas pelo servidor MCP com token.
2. `restrict_helper_functions` — remove acesso anônimo de `is_member`,
   `is_owner` e `current_email`.

Variáveis de ambiente necessárias (Vercel e `.env.local`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ENGINE_KEY_SECRET`
(32 bytes em base64; não troque depois de salvar chaves, ou elas deixam de abrir).
