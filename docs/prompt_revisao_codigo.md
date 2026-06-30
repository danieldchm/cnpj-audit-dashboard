# Tarefa: Revisão de Código Completa — cnpj-audit-dashboard

Você é um engenheiro sênior fazendo uma revisão de código abrangente do repositório
`cnpj-audit-dashboard`. Revise TODO o código-fonte do projeto e produza um relatório
estruturado, acionável e priorizado. Não altere nenhum arquivo — apenas analise e reporte
(a menos que eu peça explicitamente para aplicar correções).

## Contexto do Projeto

AuditBase é um dashboard client-side (HTML/CSS/JavaScript vanilla, zero frameworks) para
auditoria cadastral de CNPJs B2B. Ele importa bases de clientes (CSV/XLSX), valida CNPJs
matematicamente offline, consulta a Receita Federal via BrasilAPI, compara dados internos
vs. oficiais, aplica um motor duplo de scoring (Vendas e Higiene) e exporta relatórios
enriquecidos. Há persistência local via IndexedDB. O projeto também inclui um servidor MCP
(Model Context Protocol) em Node.js que expõe a lógica de negócio para agentes de IA.
É um projeto acadêmico (FIAP MBA), mas deve ser avaliado com rigor de produção.

## Arquivos a revisar (ignore `mcp-server/node_modules/` e `.git/`)

Front-end / lógica (raiz):
- `index.html`        — Interface web estática (~29 KB)
- `styles.css`        — Design system próprio (~53 KB)
- `app.js`            — Controller: UI, tabela, orquestração (~64 KB, arquivo mais crítico)
- `utils.js`          — Validação matemática de CNPJ, parser de datas, scoring (~59 KB)
- `insights.js`       — Motor de inferências agregadas e QSA (~20 KB)
- `dashboard.js`      — Renderização de abas, painéis e gráficos Chart.js (~17 KB)
- `api.js`            — Integração BrasilAPI, lotes/workers (~14 KB)
- `run_local.js`      — Suíte de testes unitários locais (~7 KB)

Servidor / IA:
- `mcp-server/index.js`   — Servidor MCP nativo
- `mcp-server/package.json`

Dados / config (verificar, não revisar a fundo):
- `dados/` (CSVs e resultados), `api_response.json`, `test_api.js`
- `.gitignore`, `README.md`

## Dimensões da revisão

Para cada dimensão, aponte problemas concretos com `arquivo:linha`, explique o impacto e
proponha a correção.

1. **Correção / Bugs**
   - Erros de lógica, edge cases não tratados, off-by-one, comparações frágeis.
   - Validação matemática de CNPJ (dígitos verificadores) — confirme que o algoritmo está
     correto, inclusive CNPJs alfanuméricos (novo padrão 2026, se aplicável).
   - Parsing de CSV/XLSX: encoding, separadores, campos com vírgula/aspas, linhas vazias.
   - Parsing de datas e formatação de números/moeda (pt-BR).
   - Tratamento de respostas e erros da BrasilAPI (404, 429 rate-limit, timeout, payload
     inesperado), retries e concorrência dos "workers"/lotes em `api.js`.
   - IndexedDB: migrações de schema, versões, falhas de transação, estado corrompido.

2. **Segurança**
   - XSS via `innerHTML`/template strings com dados externos (BrasilAPI) ou input do usuário
     (CSV). Procure por interpolação não sanitizada no DOM.
   - Exposição de dados sensíveis (CNPJs, sócios/QSA, telefones) em logs ou exports.
   - Servidor MCP: validação de input das tools, injeção, leitura de arquivos arbitrários.
   - Dependências do `mcp-server` (auditoria de versões conhecidas vulneráveis).

3. **Performance**
   - Comportamento com 70.000+ linhas: re-render da tabela, paginação, recálculo de scores.
   - Reflows/layout thrashing, listeners duplicados, vazamentos de memória.
   - Eficiência das consultas em lote à API (paralelismo vs. rate limit).

4. **Qualidade / Manutenibilidade**
   - `app.js` e `utils.js` são grandes — avalie coesão, funções longas, duplicação,
     acoplamento, números mágicos, código morto.
   - Consistência de nomenclatura e padrões entre os arquivos.
   - Tratamento de erros e feedback ao usuário.

5. **Acessibilidade / UX (index.html + styles.css)**
   - Semântica HTML, labels/ARIA, contraste, navegação por teclado, foco.
   - Responsividade.

6. **Testes**
   - Cobertura de `run_local.js`: o que está testado vs. o que deveria estar (scoring,
     validação, parsing, edge cases). Sugira casos faltantes.

## Procedimento

1. Comece lendo `README.md` e `run_local.js` para entender contratos e comportamento esperado.
2. Leia os arquivos de lógica (`utils.js`, `app.js`, `insights.js`, `dashboard.js`, `api.js`)
   e o `mcp-server/index.js`.
3. Rode `node run_local.js` para ver se os testes passam e use isso como baseline.
4. Procure padrões de risco com grep (ex.: `innerHTML`, `eval`, `fetch`, `catch`, `localStorage`,
   `indexedDB`, manipulação de datas).

## Formato do output

Entregue um relatório em Markdown com:

- **Resumo executivo** — saúde geral do código e os 3–5 riscos mais importantes.
- **Achados priorizados** — agrupados por severidade: 🔴 Crítico / 🟠 Alto / 🟡 Médio / 🔵 Baixo.
  Cada achado: título, `arquivo:linha`, descrição do problema, impacto e correção sugerida
  (com trecho de código quando útil).
- **Pontos positivos** — o que está bem feito.
- **Quick wins** — correções rápidas de alto valor.
- **Recomendações estratégicas** — refatorações maiores e melhorias de arquitetura/testes.

Seja específico e cite sempre o local exato no código. Priorize sinal sobre volume.
