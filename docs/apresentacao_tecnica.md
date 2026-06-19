# AuditBase — Do Brief ao Valor em 7 Passos
### Vibe Coding aplicado a um problema comercial real

> **Conteúdo da apresentação (entrega da atividade)** — MBA 3ABL · AI Leadership · *Strategy, Governance & Scale*
> Este arquivo contém **somente o conteúdo**. O design/layout dos slides será aplicado depois.

---

## Slide 0 — Capa

**AuditBase**
Dashboard de Auditoria Cadastral e Reativação Comercial de CNPJs

*Um MVP construído em 7 passos, com Vibe Coding*

- **Equipe:** Daniel Roecker · Daniel Carrança (RM370526) · Henrique "Padawan" Gomes Pedroso (RM374303) · Thiago Bezerra · Fabio Correa · Vinicius Costa (JOYn)
- **Stack:** HTML5 / CSS3 / JavaScript (Vanilla, zero frameworks no app) · Node.js · Model Context Protocol · Ollama/Qwen (LLM local)
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
| `index.html` | Estrutura + navegação por abas | 550 |
| `styles.css` | Design system próprio (dark, glassmorphism) | 2.505 |
| `utils.js` | Validação, datas, CSV, **engine de scoring**, export | 1.690 |
| `api.js` | Integração BrasilAPI + processamento em lote | 412 |
| `insights.js` | **Motor de inferências agregadas** da base | 529 |
| `dashboard.js` | Camada analítica (abas, gráficos, painéis) | 455 |
| `app.js` | Orquestração de UI, tabela, estado | 1.697 |

**Decisão técnica relevante:** separação de responsabilidades em **módulos** com `IIFE`/namespaces (`Utils`, `API`, `Insights`, `Dashboard`, `App`) — algo incomum em protótipos vibe-coded, que tendem a virar um arquivo único.

> A arquitetura cresceu depois (Passo 7 ampliado) com o **Assistente MCP**: `chat.html` (405) + `chat.js` (644) no front e o bridge local `mcp-bridge/server.js` (240) no back — detalhados no Slide 7.

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
- **Validação matemática de CNPJ offline** (dígitos verificadores) **antes** de chamar a rede → evita requisições desperdiçadas. Já preparada para o **novo CNPJ alfanumérico** previsto pela Receita para **julho/2026**.

**Processamento em lote concorrente:**
- **Pool de 3 workers concorrentes com delay de 300ms** (evitando bloqueios e rate limits na BrasilAPI/Cloudflare).
- **Cancelamento** cooperativo no meio do lote.
- `throttle` na renderização para não disparar **10.000 reflows** durante o batch.

**Persistência / continuidade do trabalho:**
- **Persistência local robusta via IndexedDB** → salvamento automático de sessões de processamento grandes (5.000+ CNPJs) no navegador, contornando o limite de 5MB do localStorage e suportando recarregamento de gráficos/dados.
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

**Cada commit é uma rodada de intenção** — mais de 100 commits documentam a conversa "pedido de negócio → ajuste".

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

- 🐛 **Race condition no lote concorrente:** CNPJs ficavam travados em "Processando" para sempre quando o worker terminava fora de ordem.
  → Reconciliação de estado por índice + status final garantido ao fim do batch.

- 🐛 **Zeros à esquerda perdidos** na reimportação de XLSX (o Excel tratava o CNPJ como número e comia o `0` inicial).
  → Re-padding do CNPJ no import + round-trip de planilha validado por teste.

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
- 🎯 **Plano de Ação** — **fila priorizada por vendedor, exportável em CSV e XLSX**.

**Exportação Avançada Multi-aba (XLSX):**
- Planilha Excel gerada com **4 abas organizadas** (Visão Geral, Carteira, Inteligência, Plano de Ação), garantindo a entrega de 100% das informações e análises inferidas pelo app de forma estruturada.

**Inteligência agregada (10 módulos de inferência) — o "pulo do gato":**
- **Cruzamento de sócios (QSA)** → identifica **grupos econômicos** (mesmo dono em vários clientes) e **empresas reabertas** (sócio com CNPJ baixado + CNPJ ativo).
- **Redes matriz/filial** por raiz de CNPJ.
- **Cohorts de recência**, **scorecard por vendedor** (risco de concentração), **capital em risco × receita potencial**.
- **Painel de anomalias:** oportunidades dormentes, recém-reativadas, sem canal de contato, grande capital preso inativo.

**Aprendizado capturado → roadmap de evolução para CRM** (persistência local, funil de reativação, integração ERP/webhooks).

**Bônus de governança (Passo 7 ampliado) — integração com IA por dois lados:**

1. **Servidor MCP nativo** (`mcp-server/index.js`) — expõe a lógica de negócio como **3 ferramentas** para agentes externos (ex.: Claude Desktop): `validate_cnpj`, `fetch_cnpj_data` e `generate_audit_result` (pipeline completo). A lógica do app vira uma *capability* reutilizável por qualquer IA agêntica.

2. **Assistente MCP local integrado** (`chat.html` + `mcp-bridge/`) — uma aba dedicada de **chat com IA rodando 100% na máquina**: um **LLM local via Ollama** (`qwen2.5-coder:7b`) conversa com a base através do protocolo MCP, intermediado por uma **ponte Express local**. Tudo client-side/local — nenhum dado vai para a nuvem.
   - **Console "MCP Inspector" de alta fidelidade** (UI prototipada no **Stitch**): três painéis com **splitters redimensionáveis** (sidebar 220–600px, rodapé de logs 64–450px).
   - **Terminal de logs em tempo real** (`USER_INPUT`, `API_CALL`, `MCP_CALL`, `REASONING`) com timestamps e latência em ms.
   - **Reasoning Core** — o bloco `[Raciocínio MCP]` é extraído e exibido em destaque, tornando o raciocínio da IA transparente.
   - **Simulador gráfico de carga de CPU** + **diagnóstico de conectividade** (polling de 5s nos badges Bridge / Ollama / MCP Server, com alertas `SYSTEM_OPERATIONAL` / `SYSTEM_DEGRADED`).

---

## Slide 8 — Big Numbers

> Números que dimensionam o que foi entregue.

| Métrica | Valor |
|---|---|
| **Linhas de código** (HTML+CSS+JS, sem dependências) | **≈ 8.900** |
| Linhas de **JavaScript** (lógica pura) | **≈ 5.400** |
| Linhas de **CSS** (design system próprio) | **2.505** |
| **Módulos** client-side arquiteturados | **7** (+ servidor MCP + bridge local) |
| **Funções** implementadas | **255+** |
| **Commits** (histórico da iteração) | **100+** (≈110 somando todas as branches) |
| **Campos enriquecidos** no export | **40+** |
| **Gráficos** analíticos | **8** |
| **Módulos de inferência** agregada | **10** |
| **Ferramentas MCP** expostas a IA | **3** |
| **Assistente MCP local** (chat + bridge Ollama/Qwen) | **1** |
| **Workers concorrentes** no batch | **3 (com delay de 300ms)** |
| **Códigos CNAE** calibrados (+ 9 fallbacks por palavra-chave) | **19** |
| **Formatos de export** (+ reimport de estado) | **3** (CSV/multi-sheet XLSX/JSON) |
| Linhas de **documentação JSDoc** (módulos do app) | **350+** |
| **Frameworks** de UI no app principal | **0** (Vanilla — Tailwind só no console MCP) |
| **Suíte de testes** automatizada | **1** (`run_local.js`) |

---

## Slide 8B — Resultados reais (estudo de caso: ~5.000 CNPJs)

> Números extraídos de uma **execução real** da ferramenta sobre uma base de ~5.000 clientes (export `auditbase_state`, 19/jun). **3.602 CNPJs efetivamente auditados** (1.394 ficaram pendentes por rate-limit da BrasilAPI nesta rodada).

**O funil gerado — de planilha morta a alvos acionáveis:**

| Etapa | Volume | % dos auditados |
|---|---|---|
| Cadastros na planilha | 4.999 | — |
| CNPJs auditados | 3.602 | 100% |
| Empresas **ATIVAS** (universo trabalhável) | 1.501 | 41,7% |
| **Fila priorizada** (score ≥ 40 — vale ligar) | 442 | 12,3% |
| 🔥 **Oportunidades quentes** (score ≥ 70) | 64 | 1,8% |

**Esforço perdido eliminado:**
- **2.097 empresas (58,2%) mortas/irregulares** filtradas automaticamente (1.411 BAIXADAS, 670 INAPTAS, 16 SUSPENSAS) → ~6 de cada 10 ligações deixaram de ser desperdiçadas.

**Higiene cadastral:**
- **65,1%** dos cadastros inválidos/desatualizados (2.346) · **523 divergências** interno × Receita (14,5%).

**Recuperação de contato:**
- Telefone oficial recuperado para **1.822 empresas (50,6%)**; **1.780 (49,4%) sem canal** sinalizadas de antemão (a API não retornou e-mails).

**Inteligência de grafo (QSA) — o "pulo do gato", comprovado:**
- **354 grupos econômicos** (mesmo sócio em 2+ clientes → 388 empresas) → upsell / negociação de volume.
- **115 sinais de reabertura** (sócio com CNPJ baixado **+** ativo) → resgate de cliente "perdido".

**Escala:** cruzar 3.602 CNPJs manualmente (~2–3 min/consulta) custaria **~120–180 h** — feito em uma execução, client-side, sem a base sair do navegador.

> **Leitura:** de ~5 mil linhas mortas, a ferramenta entregou **64 alvos quentes + 442 prioritários**, evitou **~2.100 ligações inúteis**, corrigiu 2/3 da base e revelou **354 grupos econômicos** e **115 reaberturas** — numa só execução.

*Ressalvas de rastreabilidade: dataset de teste/anonimizado; o campo "vendedor" não estava preenchido (scorecard por vendedor não exercido nesta amostra); capital social absoluto descartado por outliers (mediana R$ 50.000, coerente com o ICP de pequeno varejo).*

---

## Slide 9 — Sofisticações além do "vibe code comum"

> O que normalmente **não** aparece em um protótipo vibe-coded — e aqui apareceu.

1. **Engine de scoring de dois eixos** (oportunidade × higiene) com **modelo não-compensatório** e **gate multiplicativo** por situação cadastral.
2. **Decaimento exponencial** de recência (`100·e^(−dias/?).`) com **redistribuição de pesos** quando falta dado + desconto de confiança — em vez de faixas com "efeito-penhasco".
3. **Afinidade de CNAE por prefixo** (o prefixo mais longo vence: 7 > 5 > 4 > 2 dígitos) com fallback por palavra-chave; secundários valem 60%.
4. **Parser de CSV como máquina de estados** (campos com aspas, quebras de linha internas, auto-detecção de `,`/`;`, BOM).
5. **Parser de datas brasileiro robusto** (dd/mm/aaaa, ISO, serial do Excel, anos de 2 dígitos, detecção de data futura como flag de qualidade).
6. **Normalização fuzzy** para comparação de divergências (acentos, `LTDA→LIMITADA`, `S/A→SA`).
7. **Clustering de grafo de sócios (QSA)** → grupos econômicos e empresas reabertas; **detecção de redes matriz/filial** por raiz de CNPJ.
8. **Resiliência de rede:** backoff exponencial, tratamento de 429 com fila e delay controlado, validação offline antes da chamada.
9. **Concorrência controlada** (pool de 3 workers com delay de 300ms, cancelamento cooperativo) + **throttle/debounce** de UI para milhares de registros.
10. **Persistência local robusta via IndexedDB** → salvamento automático de progresso, gráficos e dados mesmo após recarregamento da página.
11. **Exportação dividida (XLSX)** contendo 100% das informações e inferências distribuídas em 4 abas estruturadas (Visão Geral, Carteira, Inteligência, Plano de Ação).
12. **Servidor MCP nativo** carregando a lógica via **VM sandbox** — expõe a inteligência do app como 3 ferramentas para agentes de IA externos.
13. **Assistente MCP local** (`chat.html` + bridge Express) com **LLM rodando na máquina** (Ollama/`qwen2.5-coder`): console "MCP Inspector" (UI Stitch) com **splitters redimensionáveis**, **logs de protocolo em tempo real**, **Reasoning Core** transparente, simulador de CPU e **diagnóstico de conectividade** por polling — IA conversando com a base sem sair do local.
14. **Future-proofing regulatório:** algoritmo de validação já compatível com o **CNPJ alfanumérico** (jul/2026), coberto por testes no `run_local.js`.
15. **Arquitetura modular** (7 módulos client-side + namespaces) + **suíte de testes** + **350+ linhas de JSDoc** com justificativa de design.

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
| Servidor MCP + assistente de chat com LLM local (bridge) | ~1–2 semanas |
| Design system (2.505 linhas de CSS) + console MCP Inspector | ~1–2 semanas |
| Testes / QA + future-proofing (CNPJ alfanumérico) | ~1 semana |
| **Total** | **Análise Geral: ≈ 10–14 semanas (≈ 400–560 h)** |

**Com Vibe Coding (este projeto):**
- Construído em **algumas sessões intensivas** ao longo de **10–19/jun**: núcleo nas noites de 10–11/jun + sessões de refino (MCP, IndexedDB, segurança, CNPJ alfanumérico e o assistente MCP com console Inspector).
- Esforço ativo estimado: **≈ 20–28 horas guiadas**.

**Compressão de tempo:**

> **Análise Geral: ≈ 400–560 h → ≈ 20–28 h** ⇒ **aceleração de ~20× a ~30×.**

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
- É a diferença entre **esperar o produto perfeito** e **começar a começar a capturar valor agora**, iterando com base em uso real.

---

## Slide 12 — Encerramento

**O método dos 7 passos, na prática:**

1. **Problema** real, pequeno e mensurável (base inativa).
2. **Brief** com intenção, usuário, dados e restrições (client-side, ICP varejo).
3. **Protótipo** modular desde o início (6 módulos).
4. **Dados** reais da Receita (BrasilAPI) com resiliência de produção.
5. **Iteração por intenção** (v1 → v2 do scoring, 100+ commits).
6. **Revisão crítica** que caçou bugs silenciosos e blindou segurança/privacidade.
7. **Demonstrar & decidir** → 4 abas, inteligência agregada, plano de ação, servidor MCP **e assistente MCP local com LLM**.

**A tese da apresentação:**

> Com **Vibe Coding guiado por intenção**, um time não-dedicado entregou em **poucas noites** uma ferramenta com sofisticação de produto (Scoring estatístico, resiliência de rede, persistência IndexedDB, exportação XLSX dividida, inferência de grafo, servidor MCP + assistente de IA local) que tradicionalmente levaria **2–3 meses** — e que já **gera valor comercial imediato**, mesmo sem ser a solução final.

**Frase de fechamento:** *"O futuro do desenvolvimento não é escrever mais código. É ter clareza de intenção — e deixar a IA executar na velocidade da conversa."*

---

## Apêndice A — Roteiro de demonstração ao vivo (3 min)

1. **Upload** do `sample_data.csv` (drag & drop). *(10s)*
2. **Processar** → mostrar a barra de progresso e o batch concorrente com 3 workers ativos. *(30s)*
3. Abrir **Visão Geral** → ler 1 KPI (capital em base inativa) e 2 gráficos (cohorts + score). *(30s)*
4. **Carteira** → abrir o painel de detalhe de 1 cliente (mostrar score, divergências, contato). *(30s)*
5. **Inteligência** → mostrar um **grupo econômico** (sócios) ou uma **empresa reaberta**. *(40s)*
6. **Plano de Ação** → filtrar por vendedor e **exportar o XLSX** com as 4 planilhas geradas. *(30s)*
7. *(Opcional)* Abrir o **Assistente MCP** (`chat.html`): fazer uma pergunta sobre a base e mostrar o **console Inspector** — logs em tempo real, Reasoning Core e badges de conexão (Bridge/Ollama/MCP). *(30s)*

## Apêndice B — Glossário rápido (para a banca)

- **ICP** — *Ideal Customer Profile*; aqui, o pequeno varejo (papelaria/livraria/escola).
- **QSA** — Quadro de Sócios e Administradores (Receita Federal).
- **Gate multiplicativo / não-compensatório** — fator que multiplica o score; um fator 0 zera, e bons componentes não "compram de volta" uma empresa baixada.
- **Cohort de recência** — agrupamento por tempo desde a última compra.
- **MCP (Model Context Protocol)** — protocolo que expõe ferramentas/capacidades para agentes de IA.
- **Ollama / Qwen** — runtime de LLM local (modelo `qwen2.5-coder:7b`) que roda o assistente de chat na própria máquina, sem enviar dados à nuvem.
- **Bridge (ponte MCP)** — servidor Express local que liga o chat ao Ollama e ao servidor MCP, orquestrando as chamadas de ferramenta.
- **Vibe Coding** — desenvolvimento guiado por intenção em linguagem natural, com a IA gerando e iterando o código.

## Apêndice C — Fonte dos números (rastreabilidade)

- Linhas de código: `wc -l` sobre os arquivos versionados (exclui `node_modules`).
- Commits e datas: histórico `git log` (10–19/jun/2026). **≈110 commits no total** considerando todas as branches de desenvolvimento (68 na branch `main` publicada + a branch `feature/mcp-chat` do assistente).
- Funções, módulos, gráficos, ferramentas MCP, CNAEs: contagem direta no código-fonte (`utils.js`, `api.js`, `insights.js`, `dashboard.js`, `app.js`, `chat.js`, `mcp-server/index.js`, `mcp-bridge/server.js`).
- Tempo tradicional: **estimativa** por frente de trabalho (não medição) — apresentar como ordem de grandeza, não como número exato.
