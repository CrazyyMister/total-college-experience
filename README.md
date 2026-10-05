# Venus University

A personal, private build of Venus University: a single-player, AI-driven dating sim in visual-novel form. A cloud LLM writes the scenes and a locally managed ComfyUI renders the character art. It is an Electron desktop app (React, TypeScript, Zustand).

## What it needs

- Windows, with an NVIDIA GPU or an AMD RDNA 3/4 GPU for ComfyUI.
- Node 22.
- An API key for the text model, entered in Settings.

## Running in development

```
npm install
npm run dev
```

Everything the player sets up lives in `data/` (settings, saves and the characters made in the game); it is gitignored and there is no server.

Before committing, `npm run typecheck` and `npm test` have to pass.

## O executável para jogar

Para jogar sem o `npm run dev`, gere a pasta do jogo e atualize uma pasta fora do projeto (por padrão `D:\Venus University`):

```
npm run release
npm run exe:update -- --dry-run
npm run exe:update
```

- `npm run release` gera `release\win-unpacked` (apaga `release\` antes; nunca jogue de dentro dela).
- `npm run exe:update` cria a pasta na primeira vez e, nas seguintes, troca os arquivos do jogo pelos da versão nova, apagando o que a versão nova não tem. Nunca mexe na pasta `data` do executável (saves, configurações e log). Com `-- --dry-run` ele só mostra o que faria. Com `-- --to "D:\outra pasta"` usa outra pasta.
- Ele recusa trabalhar com o jogo aberto (o do `npm run dev` ou o `.exe`), com a pasta dentro do projeto e com qualquer atalho (junction ou link) dentro da pasta fora de `data`.
- `npm run exe:remove` apaga a pasta do executável, também aceita `-- --to` e `-- --dry-run`, e pede para você digitar o nome da pasta.

O que é compartilhado e o que não é:

- Saves, `settings.json` (com a chave) e log do executável são **só dele**. O dev tem os seus.
- `data\services` (o ComfyUI instalado, com os modelos) e `data\characters` (os seus personagens) são **atalhos para a pasta `data` do dev**: o executável e o dev usam os mesmos arquivos.
- Por isso, apagar um personagem num lado apaga nos dois, e restaurar um backup no `.exe` troca os seus personagens, dos dois lados, pela versão que está no backup.
- Se o `.exe` pedir para instalar o ComfyUI, **não aceite**: isso quer dizer que o atalho `data\services` não está no lugar. Feche o jogo e rode `npm run exe:update -- --dry-run`, que mostra o estado dos dois atalhos.
- Não abra o executável e o `npm run dev` ao mesmo tempo: o jogo não deixa (o segundo a abrir não faz nada), e o script também recusa.

**Nunca apague a pasta do executável por outro caminho que não seja o `npm run exe:remove`.** Em especial: nem o truque de espelhar uma pasta vazia com `robocopy /MIR` (testado: apaga o ComfyUI e os personagens do dev), nem `rd /s`, `del /s`, limpadores de disco ou o Excluir do Explorador de Arquivos, que eu não testei. Se for apagar na mão, remova antes os dois atalhos `data\services` e `data\characters` (apagar um atalho não apaga o que há do outro lado).

## Where things are written down

- `DESIGN_GUIDE.md` — what the game is, where things live and the rules every change keeps. Start here.
- `UI_STYLE_GUIDE.md` — how anything on screen looks and moves.
- `TESTING_PLAN.md` — the steps for testing the game by hand.
- `ROTEIRO_COLLEGE_SIM.md` and the `PLANO_*.md` files — the roadmap and the plans for each stage of it.

## Licence

- Code is licensed under AGPL-3.0-only — see `LICENSE`.
- Image, audio and video files are all rights reserved — see `LICENSE-ASSETS.md`.
