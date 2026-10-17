---
name: criar-video
description: Use when the user asks to create, generate, extend or edit a video (Seedance 2.5) on the Open Higgsfield platform, or asks about the APIMart video balance. Runs the open-higgsfield-video MCP tools, waits for the result and returns the video link plus a link that opens it in the platform history.
---

# Criar vídeos na plataforma Open Higgsfield

Este plugin gera vídeos com **Seedance 2.5** pela APIMart, usando o saldo da
conta APIMart do usuário. Cada vídeo custa dinheiro, então siga o fluxo abaixo.

## Antes de gerar

1. Se o usuário não disse **duração** e **resolução**, use 5 s e 480p e diga
   isso na resposta. Para mais de 10 s ou 1080p, confirme antes, mostrando o
   custo estimado (480p ≈ $0,096/s · 720p ≈ $0,216/s · 1080p ≈ $0,385/s).
2. Se fizer sentido, chame `get_balance` e avise se o saldo não cobre o vídeo.
3. Formato padrão: `9:16` (vertical). Use `16:9` para YouTube/horizontal.

## Referências

- Imagens, vídeos e áudios de referência precisam ser **links públicos**.
- Para uma **imagem local**, leia o arquivo, converta para base64 e chame
  `upload_image`; use o `url` retornado em `image_urls`.
- Cite as referências no prompt pela ordem dos arrays: `@图片1`, `@图片2`
  (imagens), `@视频1` (vídeos), `@音频1` (áudios).
  Ex.: "@图片1 caminhando na praia ao pôr do sol, câmera na mão".

## Modos de `create_video`

| Pedido do usuário | `mode` | Campos |
|---|---|---|
| Vídeo novo | `create` | `prompt`, `duration` (4–30), `aspect_ratio`, `resolution` |
| Continuar um vídeo | `extend` | `source_video_url`, `prompt`, `duration` |
| Alterar um vídeo (4–30 s) | `edit` | `source_video_url`, `prompt` (duração = a do original) |

`generate_audio` vem ligado; desligue se pedirem vídeo sem som.

## Depois de enviar

1. `create_video` devolve `task_id` e `open_in_studio`.
2. Chame `wait_for_video` com o `task_id` (espera até 50 s). Repita enquanto o
   status for `pending` ou `processing`. A geração leva de 1 a 10 minutos.
3. Quando `completed`, responda com:
   - o link do vídeo (`video_url`),
   - o link **Abrir na plataforma** (`open_in_studio`), que adiciona o vídeo ao
     histórico do estúdio,
   - o custo real (`cost_usd`).
4. Se `failed`, mostre o `error` e sugira o ajuste (ex.: link de referência
   inválido, conteúdo recusado).

Gere vários vídeos em paralelo chamando `create_video` várias vezes e depois
acompanhando cada `task_id`.
