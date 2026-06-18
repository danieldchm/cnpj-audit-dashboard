# AuditBase — Do Brief ao Valor em 7 Passos
### Vibe Coding aplicado a um problema comercial real

> **Conteúdo da apresentação (entrega da atividade)** — MBA 3ABL · AI Leadership · *Strategy, Governance & Scale*
> Este arquivo contém **somente o conteúdo**. O design/layout dos slides será aplicado depois.

---

## Slide 0 — Capa

**AuditBase**
Dashboard de Auditoria Cadastral e Reativação Comercial de CNPJs

*Um MVP construído em 7 passos, com Vibe Coding*

- **Equipe:** Daniel Roecker · Daniel Carrança (RM370526) · Henrique "Padawan" Gomes Pedroso (RM374303) · Thiago Bezerra · Fabio Correa · Vini (JOYn)
- **Stack:** HTML5 / CSS3 / JavaScript (Vanilla, zero frameworks) · Node.js · Model Context Protocol
- **Fonte de dados:** Receita Federal via BrasilAPI

**Frase de abertura (mote):** *"Não programamos uma ferramenta. Nós a dirigimos — por intenção — e em poucas noites entregamos algo que normalmente levaria meses."*

---

## Slide 1 — O problema (Passo 1: Definir o problema)

> *"Um desafio real, pequeno e mensurável."*

**Contexto:** distribuidora atacadista (ICP = pequeno varejo: papelarias, livrarias, escolas).

**A dor concreta:**
- Base com **10.000+ CNPJs** cadastrados, muitos **sem compra recente**.
- O time comercial **não sabe** quais empresas ainda estão ativas, quais têm dados de contato corretos, e **por quem começar**.
- Resultado: vendedores gastam tempo ligando para empresas **baixadas**, com telefone errado, ou de baixo potencial — enquanto oportunidades quentes ficam paradas na planilha.

**Por que é um bom problema para um MVP:**
- ✅ **Real** — dor diária do time comercial.
- ✅ **Pequeno** — recorte claro: "auditar e priorizar a base inativa".
- ✅ **Mensurável** — dá para medir: % de cadastros válidos, nº de oportunidades quentes, capital em base inativa, lista priorizada gerada.

**Pergunta de negócio que o MVP responde:**
*"De toda a minha base inativa, em quem eu ligo primeiro, com qual abordagem, e o que está errado no cadastro?"*

---

## Slide 2 — O brief (Passo 2: Escrever o brief)

> *"Intenção, usuário, dados e restrições."*

**Intenção:** transformar uma planilha morta de CNPJs em uma **fila de ação priorizada** para o vendedor, enriquecida com dados oficiais da Receita.

**Usuário-alvo:**
- **Vendedor / SDR** → recebe a lista priorizada e o ângulo de abordagem.
- **Coordenação comercial** → visão de carteira, capital em risco, concentração por vendedor.

**Dados:**
- **Entrada:** CSV/XLSX da base interna (CNPJ, razão, contato, CNAE, última compra, vendedor).
- **Enriquecimento:** dados oficiais da **Receita Federal via BrasilAPI** (situação cadastral, porte, capital social, QSA/sócios, CNAEs, contatos).

**Restrições assumidas no brief:**
- **Client-side / privacidade:** a base do cliente **não sai do navegador** — processamento local, sem servidor de dados.
- **Zero custo de infra:** roda como página estática.
- **Resiliência de rede:** a API pública tem limites — precisa tolerar `429`, falhas e timeouts.
- **Calibrado ao ICP** (pequeno varejo), não a "grande empresa".

**Critério de sucesso do MVP:** ao final do processamento, o time recebe um **CSV/lista acionável** com classificação, score e próxima ação por cliente.

---

## Slide 3 — O protótipo (Passo 3: Gerar o protótipo)

> *"Primeira versão."*

**O que a primeira versão entregou:**
- Upload de CSV/XLSX (drag & drop) → tabela de clientes.
- Consulta à BrasilAPI por CNPJ → dados oficiais ao lado dos internos.
- Primeira classificação de prioridade e exportação.

**Arquitetura modular desde o início** (não um "monolito de prompt"):

| Módulo | Papel | Linhas |
|---|---|---|
| `index.html` | Estrutura + navegação por abas | 539 |
| `styles.css` | Design system próprio (dark, glassmorphism) | 2.467 |
| `utils.js` | Validação, datas, CSV, **engine de scoring**, export | 1.290 |
| `api.js` | Integração BrasilAPI + processamento em lote | 366 |
| `insights.js` | **Motor de inferências agregadas** da base | 529 |
| `dashboard.js` | Camada analítica (abas, gráficos, painéis) | 438 |
| `app.js` | Orquestração de UI, tabela, estado | 1.374 |

**Decisão técnica relevante:** separação de responsabilidades em **6 módulos** com `IIFE`/namespaces (`Utils`, `API`, `Insights`, `Dashboard`, `App`) — algo incomum em protótipos vibe-coded, que tendem a virar um arquivo único.

---

## Slide 4 — Conectar dados reais (Passo 4: Conectar dados)

> *"Sair do mockado para algo persistente."*

**De mock → dados oficiais da Receita Federal:**
- Integração real com **BrasilAPI** (`/api/cnpj/v1/{cnpj}`).
- Cada cliente é cruzado com a **fonte da verdade** (RFB): situação cadastral, porte, capital, sócios, CNAEs.

**Engenharia de resiliência (acima do padrão de vibe code):**
- **Retry com backoff exponencial** (1s → 2s → 4s, até 3 tentativas).
- Tratamento dedicado de **HTTP 429** (rate limit) com espera de 5s.
- **404 / dígito inválido** → sem retry, classificado como permanente.
- **Validação matemática de CNPJ offline** (dígitos verificadores) **antes** de chamar a rede → evita requisições desperdiçadas.

**Processamento em lote concorrente:**
- **Pool de 20 workers** consumindo uma fila compartilhada (não sequencial).
- **Cancelamento** cooperativo no meio do lote.
- `throttle` na renderização para não disparar **10.000 reflows** durante o batch.

**Persistência / continuidade do trabalho:**
- Export **CSV / XLSX / JSON** + **reimportação** do estado (JSON/XLSX) → o analista retoma uma auditoria anterior sem reprocessar.

---

## Slide 5 — Iterar por intenção (Passo 5: Iterar por intenção)

> *"Refinar pedindo ajustes claros."*

A evolução **v1 → v2** do motor de scoring é o melhor exemplo de iteração guiada por **intenção de negócio**, não por código:

**Intenção comunicada → ajuste técnico entregue:**

1. *"Cliente que comprou há 6 meses não pode valer igual a um de 3 anos."*
   → **Recência contínua** com decaimento exponencial `100·e^(−dias/730)` (sem efeito-penhasco em 180/365 dias).

2. *"Empresa suspensa não pode subir no ranking só porque comprou recente."*
   → **Situação cadastral como gate multiplicativo** (modelo **não-compensatório**): ATIVA ×1.0, SUSPENSA ×0.4, INAPTA ×0.25, BAIXADA ×0.0.

3. *"Quero saber quem contatar (vendas) separado de qual cadastro está sujo (operação)."*
   → **Dois scores independentes:** `score_oportunidade` (comercial) e `score_higiene` (qualidade do cadastro).

4. *"Nosso cliente é o pequeno varejo, não a multinacional."*
   → Pesos de **porte calibrados ao ICP** (EPP/ME no topo) + **bônus de tração** (empresa jovem capitalizada).

5. *"A abordagem do vendedor tem que mudar conforme o segmento."*
   → **Ângulo de abordagem contextual por CNAE** (papelaria, livraria, escola, gráfica…) escrito direto na ação recomendada.

**Cada commit é uma rodada de intenção** — 25 commits documentam a conversa "pedido de negócio → ajuste".

---

## Slide 6 — Revisar criticamente (Passo 6: Revisar criticamente)

> *"Segurança, dados, o que a IA escondeu."*

**Bugs reais que a revisão crítica caçou (e o que a "IA tinha escondido"):**

- 🐛 **Datas brasileiras quebradas:** `"05/03/2024"` virava 3 de maio (padrão US) e `"15/03/2024"` virava *Invalid Date* — **zerava ~30% do score** silenciosamente.
  → **Parser de datas próprio** (dd/mm/aaaa, ISO, serial do Excel, ano de 2 dígitos).

- 🐛 **CSV corrompido** por quebras de linha dentro de aspas (razões sociais/endereços multilinha).
  → **Parser reescrito como máquina de estados**, varrendo o texto inteiro + auto-detecção de delimitador (`,` vs `;`) + remoção de BOM.

- 🐛 **Divergência de CNAE inflada:** comparar texto livre com a descrição oficial divergia em ~100% dos registros, **achatando o score** de toda a base.
  → Comparação **código-com-código** (prefixo numérico), não substring de descrição.

- 🐛 **`ReferenceError` no export** (função exportada mas não definida) quebrava o módulo inteiro no load.
  → Wrappers de compatibilidade + **suíte de testes automatizada** (`run_local.js`).

**Segurança e dados:**
- **Privacidade by design:** a base nunca sai do navegador (client-side).
- **Escape de HTML** na renderização (proteção contra injeção via dados da planilha).
- **Tratamento explícito de estados de erro** da API (não "engole" falha).
- **Modelo não-compensatório:** BAIXADA/NULA não poluem o topo da fila do vendedor.

**Qualidade documentada:** ~**400+ linhas de JSDoc** explicam *por que* cada decisão foi tomada (relatório de revisão embutido no código).

---

## Slide 7 — Demonstrar & decidir (Passo 7: Demonstrar & decidir)

> *"Mostrar para alguém e capturar o aprendizado."*

**O que se demonstra ao time comercial (4 abas):**
- 📊 **Visão Geral** — KPIs (receita potencial, oportunidades quentes, capital em base inativa) + **8 gráficos** (situação, prioridade, regime, cohorts de recência, score, porte, UF, segmento).
- 📋 **Carteira** — tabela operacional com busca, filtros, paginação e painel de detalhe.
- 🧠 **Inteligência** — inferências cruzadas da base inteira.
- 🎯 **Plano de Ação** — **fila priorizada por vendedor, exportável em CSV** para distribuir.

**Inteligência agregada (10 módulos de inferência) — o "pulo do gato":**
- **Cruzamento de sócios (QSA)** → identifica **grupos econômicos** (mesmo dono em vários clientes) e **empresas reabertas** (sócio com CNPJ baixado + CNPJ ativo).
- **Redes matriz/filial** por raiz de CNPJ.
- **Cohorts de recência**, **scorecard por vendedor** (risco de concentração), **capital em risco × receita potencial**.
- **Painel de anomalias:** oportunidades dormentes, recém-reativadas, sem canal de contato, grande capital preso em inativa.

**Aprendizado capturado → roadmap de evolução para CRM** (persistência local, funil de reativação, integração ERP/webhooks).

**Bônus de governança (Passo 7 ampliado):** **Servidor MCP nativo** expõe a lógica de negócio (validação + pipeline de auditoria) como **3 ferramentas para agentes de IA** (ex.: Claude Desktop) — a ferramenta vira uma *capability* reutilizável por IA.

---

## Slide 8 — Big Numbers

> Números que dimensionam o que foi entregue.

| Métrica | Valor |
|---|---|
| **Linhas de código** (HTML+CSS+JS, sem dependências) | **≈ 7.300** |
| Linhas de **JavaScript** (lógica pura) | **≈ 4.150** |
| Linhas de **CSS** (design system próprio) | **2.467** |
| **Módulos** arquiteturados | **6** (+ servidor MCP) |
| **Funções** implementadas | **255+** |
| **Commits** (histórico da iteração) | **25** |
| **Campos enriquecidos** no export | **40+** |
| **Gráficos** analíticos | **8** |
| **Módulos de inferência** agregada | **10** |
| **Ferramentas MCP** expostas a IA | **3** |
| **Workers concorrentes** no batch | **20** |
| **Códigos CNAE** calibrados (+ 9 fallbacks por palavra-chave) | **19** |
| **Formatos de export** (+ reimport de estado) | **3** (CSV/XLSX/JSON) |
| Linhas de **documentação JSDoc** (utils + api) | **400+** |
| **Frameworks** de UI usados | **0** (Vanilla) |
| **Suíte de testes** automatizada | **1** (`run_local.js`) |

---

## Slide 9 — Sofisticações além do "vibe code comum"

> O que normalmente **não** aparece em um protótipo vibe-coded — e aqui apareceu.

1. **Engine de scoring de dois eixos** (oportunidade × higiene) com **modelo não-compensatório** e **gate multiplicativo** por situação cadastral.
2. **Decaimento exponencial** de recência (`100·e^(−dias/τ)`) com **redistribuição de pesos** quando falta dado + desconto de confiança — em vez de faixas com "efeito-penhasco".
3. **Afinidade de CNAE por prefixo** (o prefixo mais longo vence: 7 > 5 > 4 > 2 dígitos) com fallback por palavra-chave; secundários valem 60%.
4. **Parser de CSV como máquina de estados** (campos com aspas, quebras de linha internas, auto-detecção de `,`/`;`, BOM).
5. **Parser de datas brasileiro robusto** (dd/mm/aaaa, ISO, serial do Excel, anos de 2 dígitos, detecção de data futura como flag de qualidade).
6. **Normalização fuzzy** para comparação de divergências (acentos, `LTDA→LIMITADA`, `S/A→SA`).
7. **Clustering de grafo de sócios (QSA)** → grupos econômicos e empresas reabertas; **detecção de redes matriz/filial** por raiz de CNPJ.
8. **Resiliência de rede:** backoff exponencial, tratamento de 429, validação offline antes da chamada.
9. **Concorrência controlada** (pool de 20 workers, cancelamento cooperativo) + **throttle/debounce** de UI para milhares de registros.
10. **Servidor MCP nativo** carregando a lógica via **VM sandbox** — expõe a inteligência do app a agentes de IA.
11. **Arquitetura modular** (6 namespaces) + **suíte de testes** + **400+ linhas de JSDoc** com justificativa de design.

**Conclusão da seção:** o nível de *engineering* (calibração estatística, resiliência, testes, modularidade) é o de um produto, não o de um protótipo descartável.

---

## Slide 10 — Tempo de desenvolvimento: vibe code × desenvolvimento tradicional

> *Estimativas para um escopo equivalente (dashboard + engine de scoring + integração + analítica + MCP + design system).*

**Desenvolvimento tradicional (1 dev pleno):**

| Frente | Estimativa |
|---|---|
| Descoberta / requisitos | ~1 semana |
| Validação CNPJ + integração API + resiliência | ~3–5 dias |
| Engine de scoring (duplo, calibrado) | ~1–2 semanas |
| Motor de inferências (QSA, redes, cohorts) | ~1–2 semanas |
| Dashboard (8 gráficos, 4 abas, tabela) | ~2–3 semanas |
| Export/Import (CSV/XLSX/JSON) | ~3–5 dias |
| Servidor MCP | ~3–5 dias |
| Design system (2.467 linhas de CSS) | ~1–2 semanas |
| Testes / QA | ~1 semana |
| **Total** | **≈ 8–12 semanas (≈ 320–480 h)** |

**Com Vibe Coding (este projeto):**
- Núcleo construído essencialmente em **2 sessões intensivas** (noites de 10 e 11/jun) + **1 sessão de refino** (18/jun: MCP e correções).
- Esforço ativo estimado: **≈ 15–20 horas guiadas**.

**Compressão de tempo:**

> **≈ 320–480 h → ≈ 15–20 h** ⇒ **aceleração de ~20× a ~30×.**

*O gargalo deixou de ser "escrever código" e passou a ser "ter clareza de intenção".*

---

## Slide 11 — Time to Value

> Não é uma solução completa — mas entrega **valor imediato**.

**O que muda no dia seguinte para o time comercial:**
- A planilha morta de **10.000+ CNPJs** vira uma **fila priorizada e exportável**, com **classificação, score e próxima ação** por cliente.
- O vendedor recebe **telefone, e-mail e ângulo de abordagem por segmento** prontos — menos garimpo, mais ligação.
- A coordenação enxerga **capital em base inativa, oportunidades quentes e concentração por vendedor** em segundos.
- Cadastros **baixados/inválidos** saem do caminho; **empresas reabertas** e **grupos econômicos** viram oportunidade de upsell.

**A curva de valor:**

```
Valor entregue
  ▲
  │                         ┌─ CRM completo (roadmap)
  │                    ┌────┘
  │          ┌─────────┘  ← evolução incremental
  │     ┌────┘
  │ ████  ← MVP vibe-coded: VALOR JÁ AQUI
  └─────────────────────────────────────────►  Tempo
   ~2 noites
```

**Mensagem-chave:**
- **Time to value medido em dias, não em trimestres.**
- O MVP **não resolve tudo** — mas **otimiza imediatamente** a lista e os insights, gerando retorno **quase no mesmo dia** em que foi construído.
- É a diferença entre **esperar o produto perfeito** e **começar a capturar valor agora**, iterando com base em uso real.

---

## Slide 12 — Encerramento

**O método dos 7 passos, na prática:**

1. **Problema** real, pequeno e mensurável (base inativa).
2. **Brief** com intenção, usuário, dados e restrições (client-side, ICP varejo).
3. **Protótipo** modular desde o início (6 módulos).
4. **Dados** reais da Receita (BrasilAPI) com resiliência de produção.
5. **Iteração por intenção** (v1 → v2 do scoring, 25 commits).
6. **Revisão crítica** que caçou bugs silenciosos e blindou segurança/privacidade.
7. **Demonstrar & decidir** → 4 abas, inteligência agregada, plano de ação, MCP.

**A tese da apresentação:**

> Com **Vibe Coding guiado por intenção**, um time não-dedicado entregou em **~2 noites** uma ferramenta com sofisticação de produto (≈ 7.300 linhas, scoring estatístico, resiliência de rede, inferência de grafo, MCP) que tradicionalmente levaria **2–3 meses** — e que já **gera valor comercial imediato**, mesmo sem ser a solução final.

**Frase de fechamento:** *"O futuro do desenvolvimento não é escrever mais código. É ter clareza de intenção — e deixar a IA executar na velocidade da conversa."*

---

## Apêndice A — Roteiro de demonstração ao vivo (3 min)

1. **Upload** do `sample_data.csv` (drag & drop). *(10s)*
2. **Processar** → mostrar a barra de progresso e o batch concorrente rodando. *(30s)*
3. Abrir **Visão Geral** → ler 1 KPI (capital em base inativa) e 2 gráficos (cohorts + score). *(30s)*
4. **Carteira** → abrir o painel de detalhe de 1 cliente (mostrar score, divergências, contato). *(30s)*
5. **Inteligência** → mostrar um **grupo econômico** (sócios) ou uma **empresa reaberta**. *(40s)*
6. **Plano de Ação** → filtrar por vendedor e **exportar o CSV** da fila. *(30s)*
7. *(Opcional)* Mostrar o **servidor MCP** respondendo a um agente de IA. *(20s)*

## Apêndice B — Glossário rápido (para a banca)

- **ICP** — *Ideal Customer Profile*; aqui, o pequeno varejo (papelaria/livraria/escola).
- **QSA** — Quadro de Sócios e Administradores (Receita Federal).
- **Gate multiplicativo / não-compensatório** — fator que multiplica o score; um fator 0 zera, e bons componentes não "compram de volta" uma empresa baixada.
- **Cohort de recência** — agrupamento por tempo desde a última compra.
- **MCP (Model Context Protocol)** — protocolo que expõe ferramentas/capacidades para agentes de IA.
- **Vibe Coding** — desenvolvimento guiado por intenção em linguagem natural, com a IA gerando e iterando o código.

## Apêndice C — Fonte dos números (rastreabilidade)

- Linhas de código: `wc -l` sobre os arquivos versionados (exclui `node_modules`).
- Commits e datas: histórico `git log` (10–18/jun/2026).
- Funções, módulos, gráficos, ferramentas MCP, CNAEs: contagem direta no código-fonte (`utils.js`, `api.js`, `insights.js`, `dashboard.js`, `app.js`, `mcp-server/index.js`).
- Tempo tradicional: **estimativa** por frente de trabalho (não medição) — apresentar como ordem de grandeza, não como número exato.
