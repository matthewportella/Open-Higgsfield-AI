# Plugin do Codex · Open Higgsfield Vídeo

Peça ao Codex para criar vídeos na sua plataforma:

> Crie um vídeo vertical de 8 segundos em 720p de um gato astronauta flutuando numa estação espacial.

O Codex usa as ferramentas do servidor MCP da plataforma
(`https://open-higgsfield-flax-one.vercel.app/api/mcp`), gera com **Seedance 2.5**
pela APIMart usando o **saldo da sua conta APIMart**, espera o vídeo ficar pronto
e devolve o link do vídeo e um link **Abrir na plataforma**, que adiciona o vídeo
ao histórico do estúdio.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `create_video` | Cria (`create`), estende (`extend`) ou edita (`edit`) um vídeo: prompt, 4–30 s, proporção, 480p/720p/1080p, som, referências de imagem/vídeo/áudio |
| `wait_for_video` | Espera até 50 s e devolve o andamento; o Codex repete até ficar pronto |
| `get_video_status` | Consulta um vídeo pelo `task_id` |
| `get_balance` | Saldo e gasto da conta APIMart |
| `upload_image` | Envia uma imagem local para usar como referência |

## Instalação

Você precisa da sua chave da APIMart (https://apimart.ai/keys). Cada pessoa pode
usar a própria chave; o gasto sai do saldo da conta a que a chave pertence.

### Opção 1 — Codex CLI pelo terminal (mais simples)

1. Guarde a chave numa variável de ambiente (coloque no `~/.zshrc` para ficar fixa):

   ```bash
   export APIMART_API_KEY="cole-sua-chave-aqui"
   ```

2. Adicione o servidor ao Codex:

   ```bash
   codex mcp add open-higgsfield-video --url https://open-higgsfield-flax-one.vercel.app/api/mcp --bearer-token-env-var APIMART_API_KEY
   ```

   Isso grava em `~/.codex/config.toml`:

   ```toml
   [mcp_servers.open-higgsfield-video]
   url = "https://open-higgsfield-flax-one.vercel.app/api/mcp"
   bearer_token_env_var = "APIMART_API_KEY"
   ```

3. Abra o Codex e peça um vídeo. Para conferir a conexão, rode `/mcp` dentro do Codex.

### Opção 2 — Instalar como plugin (com o guia de uso incluído)

1. Adicione o catálogo deste repositório:

   ```bash
   codex plugin marketplace add matthewportella/Open-Higgsfield-AI
   ```

2. Abra o Codex, digite `/plugins`, instale **Open Higgsfield · Vídeo** e informe a
   chave da APIMart quando o Codex pedir a conexão.
3. Comece uma nova conversa e peça um vídeo.

No aplicativo do Codex/ChatGPT: aba **Plugins** → procure **Open Higgsfield** →
**+** → conecte com a chave da APIMart → nova conversa.

## Dicas de uso

- Sem duração/resolução no pedido, o padrão é 5 s em 480p (≈ $0,48).
- Para imagem local: "use a foto ./produto.png como referência".
- Cite referências no prompt como `@图片1` (imagem 1), `@视频1`, `@音频1`.
- "Estenda o último vídeo por mais 6 segundos" e "edite esse vídeo trocando a
  camiseta para vermelha" usam os modos `extend` e `edit`.
