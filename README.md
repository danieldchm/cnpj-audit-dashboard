# AuditBase — Dashboard de Auditoria Cadastral de CNPJs

> Protótipo funcional para sanitização e reativação de base de clientes B2B inativos.

## 🎯 Problema

Base com 10.000+ CNPJs cadastrados sem histórico de compras recente. O time comercial não sabe se essas empresas continuam ativas ou se os dados de contato estão corretos.

## 🚀 Solução

Dashboard client-side que:
1. **Importa** base de clientes (CSV/XLSX)
2. **Valida** matematicamente o CNPJ de forma local para evitar requisições desnecessárias
3. **Consulta** cada CNPJ na Receita Federal via BrasilAPI
4. **Compara** dados internos vs oficiais (divergências)
5. **Classifica** prioridade de ação por cliente usando um motor duplo de Scoring (Vendas e Higiene)
6. **Extrai** Inteligência Web e Perfil Operacional para enriquecer a abordagem de vendas
7. **Exporta** relatório completo com 40+ campos enriquecidos

## 📁 Estrutura do Projeto

```
cnpj-audit-dashboard/
├── index.html                    # Interface Web estática
├── styles.css                    # Design System próprio (CSS)
├── app.js                        # Lógica de UI, tabela e orquestração (Controller)
├── utils.js                      # Validações matemáticas, parser de datas e scoring
├── insights.js                   # Motor de inferências agregadas e QSA
├── dashboard.js                  # Renderização de abas, painéis e gráficos (Chart.js)
├── api.js                        # Integração com a BrasilAPI e lotes de workers
├── chat.html                     # Interface dedicada do Assistente MCP
├── chat.js                       # Lógica de interação do chat e status MCP
├── run_local.js                  # Suite de testes unitários locais
├── docs/                         # Documentos de design, apresentação e relatórios
│   ├── apresentacao_tecnica.md   # Conteúdo técnico da apresentação (MBA)
│   ├── apresentacao_business.md  # Apresentação executiva comercial
│   ├── relatorio_vibe_coding.md  # Relatório de engenharia de confiabilidade/vibe coding
│   └── contexto_dump.md          # Dump de contexto complementar de IA
├── dados/                        # Datasets de entrada e resultados
│   ├── amostra_clientes.csv      # Base teste de exemplo para importação
│   └── resultados/               # Resultados gerados (CSV, JSON, KPI)
├── mcp-bridge/                   # Ponte de integração local (Ollama <-> MCP Client)
├── mcp-server/                   # Servidor Model Context Protocol nativo
└── README.md                     # Este arquivo
```


## 🧭 Navegação (UI/UX v2)

O dashboard é organizado em quatro abas principais:

- **📊 Visão Geral** — KPIs estratégicos (receita potencial, oportunidades quentes, capital em base inativa) e gráficos de distribuição: situação cadastral, prioridade, regime tributário, cohorts de recência, score de oportunidade, porte, UFs e segmentos (CNAE).
- **📋 Carteira** — A tabela operacional com busca, filtros, paginação e painel de detalhe por cliente.
- **🧠 Inteligência** — Inferências cruzadas da base inteira (ver abaixo).
- **🎯 Plano de Ação** — Fila priorizada filtrável por vendedor e exportável em CSV para distribuir ao time comercial.

## 🔎 Inferências Comerciais (insights.js) & Engine V2

O projeto conta com um Motor de Scoring V2 avançado, separando **Score de Vendas / Oportunidade** do **Score de Higiene Cadastral**. Além disso, o motor extrai inteligência agregada:

- **Cruzamento de sócios (QSA)** → Identifica **grupos econômicos** (mesmo sócio em vários clientes) e **empresas reabertas**.
- **Perfil Operacional Ativo** → Analisa a situação na Receita, capital social e meios de contato para indicar se a empresa opera ativamente.
- **Redes matriz/filial** → Agrupa CNPJs com a mesma raiz.
- **Contato Imediato** → Extração de telefones com discador dinâmico e e-mails rápidos para facilitar o outreach.
- **Visibilidade de Cross-Sell** → Avaliação de afinidade de CNAEs (primários e secundários) para recomendar oportunidades de novos negócios.

## 🤖 Integração IA: Servidor & Assistente MCP (Model Context Protocol)

O projeto possui integração completa com o ecossistema **Model Context Protocol (MCP)**, atuando tanto como servidor de ferramentas para IAs externas quanto contendo um assistente de chat local e dinâmico.

### 1. Servidor MCP Nativo (`mcp-server/`)
Expõe toda a lógica pesada de negócio (validações matemáticas de CNPJ e a pipeline completa do `generateAuditResult`) para IAs agenticas externas (como o Claude Desktop).

**Como configurar no Claude Desktop:**
```json
{
  "mcpServers": {
    "auditbase": {
      "command": "node",
      "args": [
        "/caminho/absoluto/para/cnpj-audit-dashboard/mcp-server/index.js"
      ]
    }
  }
}
```

### 2. Assistente MCP Local Integrado (`chat.html` & `mcp-bridge/`)
Criamos uma aba standalone e interativa para chat com IA. Ela se comunica com o **Ollama local** rodando o modelo `qwen2.5-coder:7b` (ou similar) e utiliza o protocolo MCP via uma ponte local (`mcp-bridge/`) para buscar dados do AuditBase em tempo real.
- **Design UI de Alta Fidelidade (MCP Inspector):** O visual premium de console/inspetor hacker de alta tecnologia foi concebido e prototipado utilizando a ferramenta **Stitch** (stitch.withgoogle.com).
- **Três Painéis com Splitters Dinâmicos (Redimensionamento):** Alças verticais (`#sidebar-resizer`) e horizontais (`#footer-resizer`) permitem redimensionar a barra lateral (220px a 600px) e o rodapé de logs (64px a 450px) dinamicamente via clique-e-arrasto. Os splitters contam com efeitos visuais e cursor interativo. Em dispositivos móveis, as alças de redimensionamento são ocultadas automaticamente e o painel lateral vira uma gaveta colapsável.
- **Terminal de Logs de Atividade em Tempo Real:** Rodapé interativo com um feed contínuo que registra cada transação e evento do protocolo MCP (ex: `USER_INPUT`, `API_CALL`, `MCP_CALL`, `REASONING`), exibindo timestamps precisos, latência em ms e status de execução.
- **Simulador de Carga de CPU:** Widget gráfico no painel lateral direito que exibe o monitoramento dinâmico e simulado de processamento de CPU da máquina local, subindo para 70-90% quando a IA gera respostas e voltando a 1% quando ociosa.
- **Atalhos Rápidos e Triggers na Sidebar:** A barra lateral expõe a lista de ferramentas registradas no servidor MCP, permitindo clicar sobre qualquer uma delas para preencher ou rodar consultas automáticas no chat.
- **Storytelling Acadêmico & Reasoning Core:** O assistente expõe seu fluxo de pensamentos de forma transparente. O bloco de marcação `[Raciocínio MCP]` é extraído da conversa e exibido de forma destacada em tempo real em um painel fixo ("Reasoning Core") na lateral direita e em balões estilizados no histórico.
- **Diagnóstico de Conectividade:** Monitoramento automatizado (via polling de status de 5 segundos) da integridade da *Node Bridge*, do *Ollama local* e do *MCP Server*, com badges verdes/vermelhos e alertas globais (`SYSTEM_OPERATIONAL` / `SYSTEM_DEGRADED`).

## 🗺️ Roadmap: Evolução em Direção a CRM

Embora o **AuditBase** não tenha o objetivo de se tornar um CRM completo de mercado, a ferramenta estabelece a **fundação e os canais de dados necessários** para uma futura implementação corporativa de maior escala.

### 📍 Fase 1: Persistência Local & Histórico de Interação (Fundação de Dados)
*   **Banco de Dados Local (`IndexedDB`)**: Salvamento automático do progresso de auditoria no navegador.
*   **Registros de Contato (Logs)**: Funcionalidade para registrar logs de interações (ex: "Tentativa de contato via WhatsApp") na ficha do cliente.
*   **Campos de Anotações**: Texto livre para o vendedor registrar feedback ou propostas.

### 📍 Fase 2: Funil de Reativação & Gestão de Agenda (Operação de Vendas)
*   **Pipeline Visual (Kanban)**: Visualização dos clientes em colunas conforme estágio de reativação (*Fila de Espera*, *Contato Iniciado*, etc).
*   **Lembretes de Retorno (Follow-up)**: Sistema de alerta local para agendar retornos.
*   **Filtros Avançados de Fila**: Filtros rápidos por "Último Contato".

### 📍 Fase 3: Integração e Sincronização (Conectividade ERP)
*   **Webhooks de Atualização**: Sincronização de dados corrigidos via API com o sistema de retaguarda (ERP) da Distribuidora Atacadista.
*   **Importação Dinâmica por API**: Conexão com o ERP para buscar clientes inativos automaticamente.

## 🛠️ Tecnologias

- **HTML5 / CSS3 / JavaScript** (Vanilla — zero frameworks)
- **Tailwind CSS** (Utilizado na interface do MCP Inspector)
- **Stitch** (stitch.withgoogle.com) — Utilizado para concepção do design UI e prototipagem da interface de alta fidelidade
- **Node.js** (Servidor MCP e Suite de Testes Automáticos `run_local.js`)
- **Model Context Protocol SDK** (`@modelcontextprotocol/sdk`)
- **SheetJS** (CDN) — Leitura de arquivos Excel
- **Chart.js** (CDN) — Gráficos analíticos
- **BrasilAPI** — Consulta pública de CNPJs na Receita Federal

## ▶️ Como Executar

### Opção 1: Execução Completa da Stack Local (Recomendado)
Para rodar a interface web, a ponte do assistente, a execução local do Ollama e o MCP server simultaneamente:

1. **Pré-requisitos:** Certifique-se de ter o [Ollama](https://ollama.com/) instalado na máquina.
2. **Modelo:** Baixe o modelo recomendado executando:
   ```bash
   ollama pull qwen2.5-coder:7b
   ```
3. **Instalação:** Instale as dependências npm na raiz:
   ```bash
   npm install
   ```
4. **Execução:** Rode a stack inteira com o comando:
   ```bash
   npm start
   ```
   * Acesse o Dashboard em: `http://localhost:8000`
   * Acesse o Assistente MCP em: `http://localhost:8000/chat.html` (ou clique em **Assistente MCP** no cabeçalho do Dashboard)

### Opção 2: Apenas o Dashboard Web Estático (Hospedagem Simples)
Caso queira apenas auditar CNPJs via API pública da BrasilAPI diretamente na interface estática:
```bash
# Opção A: Python
python3 -m http.server 8080

# Opção B: Node.js
npx serve .

# Acesse: http://localhost:8080
```

### Testes Automatizados (Engine Lógica)
```bash
node run_local.js
```

## 📋 Funcionalidades Consolidadas

- [x] Upload de CSV e XLSX (drag & drop)
- [x] Motor de Scoring V2 (Vendas e Higiene)
- [x] Validação matemática de CNPJ (Offline) e Prevenção de Erros de Rede
- [x] Classificação Inteligente de Status de Inativos e Erros de API
- [x] Tabela com busca, filtros, paginação e distribuição de carteira de vendedores
- [x] Exportação CSV com 40+ campos da Receita Federal enriquecidos
- [x] Painel de Insights Inteligentes (Perfil Operacional e Ligações Diretas)
- [x] Servidor MCP (Integração de Agentes IAs)
- [x] Assistente MCP Local com Chat High-Tech Polish (Stitch)
- [x] Três painéis redimensionáveis via Splitters interativos (Sidebar e Terminal de Logs)
- [x] Terminal de logs de atividade dinâmico com timestamps e latências em ms
- [x] Monitor de status de conexões em tempo real (Bridge, Ollama, MCP Server)
- [x] Bloco de Raciocínio (Reasoning Core) e simulador gráfico de carga de CPU

## 📄 Licença

Projecto Acadêmico FIAP - MBA 3ABL - AI LEADERSHIP
Strategy, Governance & Scale

## 👥 Equipe

- Daniel Roecker — RM375285
- Daniel Carrança (danieldchm) — RM370526
- Henrique 'Padawan' Gomes Pedroso (pedrosohgp) — RM374303
- Thiago Bezerra — RM370486
- Fabio Correa — RM374274
- Vinicius Costa — RM375648
