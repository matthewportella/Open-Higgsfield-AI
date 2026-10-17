# Plugin do Codex · Open Higgsfield Vídeo

Peça ao Codex para criar vídeos na sua plataforma:

> Crie um vídeo vertical de 8 segundos em 720p de um gato astronauta flutuando numa estação espacial.

O Codex usa as ferramentas do servidor MCP da plataforma
(`https://open-higgsfield-flax-one.vercel.app/api/mcp`), gera com **Seedance 2.5**
pela APIMart usando as **APIs ativadas no estúdio**, espera o vídeo ficar pronto
e devolve o link. Todo vídeo entra no histórico compartilhado da equipe.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `create_video` | Cria (`create`), estende (`extend`) ou edita (`edit`) um vídeo: prompt, 4–30 s, proporção, 480p/720p/1080p, som, referências de imagem/vídeo/áudio |
| `wait_for_video` | Espera até 50 s e devolve o andamento; o Codex repete até ficar pronto |
| `get_video_status` | Consulta um vídeo pelo `task_id` |
| `get_balance` | Saldo e gasto da conta APIMart |
| `upload_image` | Envia uma imagem local para usar como referência |

## Instalação

1. Entre no estúdio, abra **APIs → Codex** e clique em **Gerar token**. O token
   começa com `ohf_` e aparece uma vez só. Ele usa as APIs já ativadas no estúdio;
   você não precisa da chave da APIMart.
2. Guarde o token numa variável de ambiente (coloque no `~/.zshrc` para ficar fixa):

   ```bash
   export OHF_TOKEN="ohf_cole-seu-token"
   ```

3. Adicione o servidor ao Codex:

   ```bash
   codex mcp add open-higgsfield-video --url https://open-higgsfield-flax-one.vercel.app/api/mcp --bearer-token-env-var OHF_TOKEN
   ```

   Ou cole direto em `~/.codex/config.toml` (é o bloco que a tela APIs → Codex
   mostra, já com o seu token):

   ```toml
   [mcp_servers.open-higgsfield-video]
   url = "https://open-higgsfield-flax-one.vercel.app/api/mcp"
   tool_timeout_sec = 90

   [mcp_servers.open-higgsfield-video.http_headers]
   Authorization = "Bearer ohf_cole-seu-token"
   ```

4. Reinicie o Codex e peça um vídeo. Os vídeos aparecem no histórico do estúdio
   para toda a equipe, marcados como “via Codex”.

Para instalar também o guia de uso (skill), adicione o catálogo deste repositório:

```bash
codex plugin marketplace add matthewportella/Open-Higgsfield-AI
```

e instale **Open Higgsfield · Vídeo** em `/plugins`.

## Dicas de uso

- Sem duração/resolução no pedido, o padrão é 5 s em 480p (≈ $0,48).
- Para imagem local: "use a foto ./produto.png como referência".
- Cite referências no prompt como `@图片1` (imagem 1), `@视频1`, `@音频1`.
- "Estenda o último vídeo por mais 6 segundos" e "edite esse vídeo trocando a
  camiseta para vermelha" usam os modos `extend` e `edit`.
