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
├── index.html          # Estrutura principal + navegação por abas
├── styles.css          # Design system (dark theme, glassmorphism)
├── app.js              # Lógica de UI, tabela, processamento
├── utils.js            # Validação CNPJ, auditoria, scoring Distribuidora, exportação
├── insights.js         # Motor de INFERÊNCIAS AGREGADAS (cruzamentos da base)
├── dashboard.js        # Camada analítica: abas, gráficos e painéis de inteligência
├── api.js              # Integração BrasilAPI + web intelligence
├── run_local.js        # Suite de testes automatizados locais para regras de negócio
├── sample_data.csv     # Dados de exemplo para testes
├── mcp-server/         # Servidor MCP para integração com Agentes IAs (ex: Claude)
└── README.md           # Este arquivo
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

## 🤖 Integração IA: Servidor MCP (Model Context Protocol)

O projeto inclui um **Servidor MCP nativo** localizado na pasta `mcp-server/`. Este servidor expõe toda a lógica de negócio pesada (validações matemáticas de CNPJ e o pipeline do `generateAuditResult`) para IAs agenticas (como o Claude Desktop). 

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
- **Node.js** (Servidor MCP e Suite de Testes Automáticos `run_local.js`)
- **Model Context Protocol SDK** (`@modelcontextprotocol/sdk`)
- **SheetJS** (CDN) — Leitura de arquivos Excel
- **Chart.js** (CDN) — Gráficos analíticos
- **BrasilAPI** — Consulta pública de CNPJs na Receita Federal

## ▶️ Como Executar

### Interface Gráfica (Dashboard Web)
```bash
# Opção 1: Python
python3 -m http.server 8080

# Opção 2: Node.js
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

## 📄 Licença

Projeto acadêmico — Pós-graduação FIAP.

## 👥 Equipe

- Daniel Roecker —
- Daniel Carrança (danieldchm) — RM370526
- Henrique 'Padawan' Gomes Pedroso (pedrosohgp) — RM374303
- Thiago Bezerra
- Fabio Correa
- Vini da JOYn
