# dsh-paste-dock

> Plugin do DeepSeek Harness: texto longo colado vira automaticamente `pastes/*.txt`, a informação completa vai para o **cartão dock acima do campo de entrada**, e no rascunho fica apenas um selo mínimo reconhecível.

## O que ele faz

1. **Colagem grande vira anexo**: ao colar no campo de entrada um texto acima do limiar (500 caracteres por padrão), o cliente intercepta a colagem e, via RPC, entrega ao host a gravação em `pastes/<timestamp>.txt` no workspace da sessão atual (teto de 1 MiB por padrão, byte a byte fiel a CRLF/BOM/UTF-8); se salvar falhar, o texto original é reinserido no campo e a falha é explicada com honestidade. O host registra em paralelo a ferramenta `save_paste` como garantia de disciplina.

2. **No rascunho fica só um selo mínimo reconhecível**: o que se insere no campo é um chip de referência atômico nativo do dsh (mesmo conjunto de nós dos anexos oficiais), exibido por padrão como `📄 primeiras letras…` (colagens sucessivas viram `📄2`, `📄3`…, cada uma com sua prévia inicial) —
   - Backspace/Delete apaga o inteiro de uma vez, sem estado intermediário letra a letra;
   - clicar no selo faz o núcleo do dsh roteá-lo para a pré-visualização na barra lateral direita (editável se dsh-better-sidebar estiver instalado);
   - caminho de envio inalterado: o chip é serializado como `@"pastes/x.txt"` cru, **sem acrescentar token à requisição**, e o modelo lê o arquivo sozinho; a mensagem enviada renderiza o mesmo cartão clicável.

3. **Dock acima do campo de entrada** (order 0, cartão centralizado): a informação completa mora no slot `conversation.input.dock` — 📄, nome do arquivo, `prévia inicial… · N caracteres · caminho`, **✕ remover do rascunho** (o arquivo fica), **abrir o texto** (com dsh-better-sidebar usa o editor dele; em implantação loopback local o host pode abrir pelo aplicativo do sistema; sem nenhum dos dois, orienta a clicar no selo do rascunho).
   - o dock é uma **projeção** das referências do rascunho: remover o selo no rascunho faz o cartão sumir junto; o ✕ do cartão apaga junto a mention no rascunho;
   - reivindicamos apenas referências criadas por este plugin; um `@"pastes/…"` digitado na mão não é reivindicado;
   - o espelho do registro vive em sessionStorage: ao sair e voltar numa sessão os cartões continuam lá; após recarregar a página inteira as referências seguem válidas, mas o dock pode ter esquecido os metadados dos cartões.

4. **Degradação automática quando a fachada falta**: em linhas antigas do dsh, ou com o campo de entrada ocupado, volta à referência textual ` @"pastes/x.txt" (N caracteres)` — depois de enviada renderiza igualmente como cartão clicável, e o dock também a reconhece.

## Instalação

```sh
# Instalação por diretório local (execute no diretório-pai deste repositório):
dsh plugin --profile web add ./dsh-paste-dock
dsh --profile web          # após reiniciar, o console mostra [dsh-paste-dock] …
```

Publicado no npm, dá para `dsh plugin --profile <p> add dsh-paste-dock`. No Desktop é preciso instalar uma vez a mais, no profile próprio dele.

## Configuração (cordis.patch.yml, padrão da implantação; depois de mudar, reinicie o dsh, sem rebuild)

| Campo       | Padrão  | Descrição                                                                                                     |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `minChars`  | 500     | limiar de colagem grande (UTF-16 code units). O usuário pode sobrepor em Settings → General (vale na hora)    |
| `maxBytes`  | 1048576 | teto de bytes por colagem, imposto pelo host; teto duro 64 MiB                                                |
| `chipBadge` | `true`  | o chip do rascunho aparece como selo mínimo; `false` volta ao label completo `nome do arquivo · N caracteres` |
| `dock`      | `true`  | dock acima do campo de entrada; `false` não injeta o slot (salvar continua funcionando)                       |

O bundle do cliente não alcança row config; os valores acima chegam pela RPC `pasteStore/getConfig`, e os padrões locais são só fallback.

## Diretório de pastes e limpeza automática (desde 0.1.27)

O padrão continua sendo `pastes/` dentro do workspace — comportamento inalterado.
Dois novos campos permitem movê-lo ou definir retenção:

| Campo        | Padrão | Significado                                                                                                                                                                                            |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pasteDir`   | `''`   | vazio = `pastes/` no workspace; relativo = subdiretório do workspace (ex. `scratch/pastes`); absoluto = diretório fora dele (ex. `/tmp/dsh-pastes`). Um `..` é erro, nunca redirecionamento silencioso |
| `retainDays` | `0`    | janela de limpeza em dias. `0` = nunca apagar (padrão); teto 3650. Roda após uma gravação bem-sucedida                                                                                                 |

O escopo é estreito de propósito: **somente os pastes deste plugin**
(`YYYYMMDD-HHMMSSmmm[-label].txt`), somente esse diretório (nunca recursivo); seus
próprios arquivos ali nunca são tocados.

Dentro do workspace a referência continua relativa (`pastes/x.txt`); fora dele ela
passa a ser **absoluta** — a gramática `@` do dsh resolve caminhos relativos a
partir da raiz do workspace e trata caminhos absolutos como arquivos do host.

Se `pastes/` aparece como `?? pastes/` no `git status`, escolha uma:

```bash
# 1) manter fora do repositório
echo 'pastes/' >> .gitignore

# 2) ignorar apenas nesta máquina
echo 'pastes/' >> .git/info/exclude

# 3) apontar pasteDir para fora do workspace
# cordis.patch.yml → pasteDir: 'C:/temp/dsh-pastes'
```

## Não interceptar: as saídas de texto cru (desde 0.1.28)

Duas saídas independentes:

| Como                     | Escopo                      | Uso                                                                                                                                                                                            |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alwaysRaw: true`        | global até voltar a `false` | defina `alwaysRaw: true` em `cordis.patch.yml` e reinicie o dsh. O plugin passa a **não** interceptar nenhuma colagem: sem arquivo, sem chip, sem card — o conteúdo vai direto para o composer |
| segurar `Shift` ao colar | só esta colagem             | sem mudar configuração. A próxima volta a ser interceptada                                                                                                                                     |

`alwaysRaw` é `false` por padrão, ou seja, exatamente o comportamento 0.1.27. É
configuração comum (não volatile): decisão de implantação, não algo para alternar
sem querer numa linha.

## Disciplina sugerida no AGENTS.md

```markdown
## disciplina dsh-paste-dock

Quando o usuário colar um bloco grande de texto (aprox. acima de 500 caracteres): se o hook do campo de entrada não interceptar, chame ativamente a ferramenta save_paste
para guardar o texto em pastes/<timestamp>.txt e, na resposta, referencie o caminho relativo ao workspace — sem repetir o texto original.
```

## Limitações conhecidas

- **Após trocar de sessão o chip degrada a referência textual**: o espelho de rascunho do dsh guarda só texto (limitação do host upstream); o `@"…" (N caracteres)` degradado continua enviável e continua renderizando como cartão, e o dock o reconhece.
- **Salvar pela edição no better-sidebar dá 400**: upstream [DSH-better-sidebar#646](https://github.com/omdsh-dev/DSH-better-sidebar/issues/646) (caminho relativo/absoluto divergindo), nada a ver com este plugin; abrir o mesmo arquivo pela árvore de arquivos dele salva normalmente.
- **O «abrir» do cartão do dock**: a detecção do better-sidebar tenta os nomes de método `openFile`/`openPath`/`open`; se o serviço não os expor, cai no `openWorkspacePath` do host (somente loopback).
- Colagem de arquivo/imagem comuns **não é interceptada**: o pipeline nativo de anexos do DSH já cobre.

## Desenvolvimento

```sh
pnpm install            # ou npx pnpm@10 install --frozen-lockfile
npm run build:all       # tsc (host) + tsdown (bundle único do client) → dist/, sincroniza lib/ (cópia dupla no repositório)
npm test                # node --test (112 itens: unit do host + guardas de contrato em nível de fonte do cliente)
npm run typecheck       # verificação estrita dos dois tsconfig (host + cliente)
npm run lint && npm run format:check && npm run privacy && npm run metrics
```

Estrutura do código-fonte: `src/index.ts` + `src/typert.host.ts` (metade host, tsc); `src/client/*.ts` (metade web, modularizada por shared/rpc/composer/chip/registry/dock/toast/hint/settings, empacotada pelo tsdown num único `dist/client.js`, preservando o contrato de carregamento `window.__ModuleLoader__.load`).

O intervalo peer `0.1.0-rc.2` || `0.1.0-rc.3` || `0.1.0-rc.6` || `0.1.0-rc.7` || `0.1.0-rc.8` || `0.1.1-rc.1` || `0.1.1-rc.2` || `0.1.2-rc.1` || `0.1.5-rc.1` || `0.1.5-rc.2` || `0.1.5-rc.3` || `0.1.7-rc.1` || `0.1.7-rc.2` || `0.2.0-rc.1` || `0.2.0-rc.2` || `0.2.1-rc.1` || `0.2.1-rc.2` || `0.2.1-rc.3` || `0.2.1-rc.4` || `0.2.1-rc.5` || `0.2.2-rc.1` é uma whitelist enumerada — distribuída por scripts/hosts.mjs via `node scripts/sync-hosts.mjs --write`, mesma fonte do `engines.dsh`; antes de montar o dsh cada pacote é validado por semver e, se não bater, o pacote inteiro é recusado; não edite na mão.

## License

MIT — Copyright (c) 2026 drscrewdriver
