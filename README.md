# AuditBase — Dashboard de Auditoria Cadastral de CNPJs

> Protótipo funcional para sanitização e reativação de base de clientes B2B inativos.

## 🎯 Problema

Base com 10.000+ CNPJs cadastrados sem histórico de compras recente. O time comercial não sabe se essas empresas continuam ativas ou se os dados de contato estão corretos.

## 🚀 Solução

Dashboard client-side que:
1. **Importa** base de clientes (CSV/XLSX)
2. **Consulta** cada CNPJ na Receita Federal via BrasilAPI
3. **Compara** dados internos vs oficiais (divergências)
4. **Classifica** prioridade de ação por cliente
5. **Exporta** relatório completo com 40+ campos enriquecidos

## 📁 Estrutura do Projeto

```
cnpj-audit-dashboard/
├── index.html          # Estrutura principal + navegação por abas
├── styles.css          # Design system (dark theme, glassmorphism)
├── app.js              # Lógica de UI, tabela, processamento
├── utils.js            # Validação CNPJ, auditoria, scoring VPA, exportação
├── insights.js         # Motor de INFERÊNCIAS AGREGADAS (cruzamentos da base)
├── dashboard.js        # Camada analítica: abas, gráficos e painéis de inteligência
├── api.js              # Integração BrasilAPI + web intelligence
├── sample_data.csv     # Dados de exemplo para testes
└── README.md           # Este arquivo
```

## 🧭 Navegação (UI/UX v2)

O dashboard é organizado em quatro abas:

- **📊 Visão Geral** — KPIs estratégicos (receita potencial, oportunidades quentes, capital em base inativa) e gráficos de distribuição: situação cadastral, prioridade, regime tributário, cohorts de recência, score de oportunidade, porte, UFs e segmentos (CNAE).
- **📋 Carteira** — a tabela operacional com busca, filtros, paginação e painel de detalhe por cliente.
- **🧠 Inteligência** — inferências cruzadas da base inteira (ver abaixo).
- **🎯 Plano de Ação** — fila priorizada por prioridade e score, filtrável por vendedor e exportável em CSV para distribuir ao time comercial.

## 🔎 Inferências Comerciais (insights.js)

Combinando os campos do BrasilAPI entre todos os registros, o motor extrai inteligência que não existe em um CNPJ isolado:

- **Cruzamento de sócios (QSA)** → identifica **grupos econômicos** (mesmo sócio em vários clientes = venda cruzada / key account) e **empresas reabertas** (sócio com CNPJ baixado/inapto operando em um novo CNPJ ativo — o cliente que “sumiu”).
- **Redes matriz/filial** → agrupa CNPJs com a mesma raiz de 8 dígitos para negociar volume como conta única.
- **Scorecard por vendedor** → saúde de carteira (% ativos), oportunidades quentes, divergências e concentração de capital por responsável.
- **Capital em risco × receita potencial** → soma do capital social ponderada por situação e prioridade.
- **Sinais acionáveis** → oportunidades dormentes (empresa boa parada há muito tempo), recém-reativadas na RFB, bom score sem canal de contato, e capital alto preso em empresa inativa.

## 🗺️ Roadmap: Evolução em Direção a CRM

Embora o **AuditBase** não tenha o objetivo de se tornar um CRM completo de mercado (como Hubspot ou Salesforce), a ferramenta pode evoluir para estabelecer a **fundação e os canais de dados necessários** para uma futura implementação corporativa de maior escala. Abaixo está o planejamento de evolução em direção a este objetivo:

### 📍 Fase 1: Persistência Local & Histórico de Interação (Fundação de Dados)
*   **Banco de Dados Local (`IndexedDB`)**: Salvamento automático do progresso de auditoria no navegador. O usuário não precisará reimportar planilhas para continuar o trabalho.
*   **Registros de Contato (Logs)**: Funcionalidade para registrar logs de interações (ex: "Tentativa de contato via WhatsApp", "Ligação não atendida", "Em negociação") diretamente na ficha do cliente.
*   **Campos de Anotações**: Campo de texto livre para o vendedor registrar notas sobre o feedback do cliente, objeções ou propostas acordadas.

### 📍 Fase 2: Funil de Reativação & Gestão de Agenda (Operação de Vendas)
*   **Pipeline Visual (Kanban)**: Visualização dos clientes em colunas conforme seu estágio de reativação (ex: *Fila de Espera*, *Contato Iniciado*, *Cotação Enviada*, *Reativado* ou *Descartado*).
*   **Lembretes de Retorno (Follow-up)**: Sistema de alerta local que avisa o vendedor quando é hora de fazer o segundo contato com um cliente específico.
*   **Filtros Avançados de Fila**: Filtros rápidos por "Último Contato" e "Data de Follow-up" no painel operacional.

### 📍 Fase 3: Integração e Sincronização (Conectividade ERP)
*   **Webhooks de Atualização**: Botão "Sincronizar com ERP" para enviar os dados corrigidos cadastrais e o status de reativação diretamente para o sistema de retaguarda (ERP) da VPA Atacadista via API.
*   **Importação Dinâmica por API**: Conexão com o ERP para buscar clientes inativos automaticamente de forma diária, dispensando a necessidade de exportar e importar arquivos de planilha manualmente.

## 🛠️ Tecnologias

- **HTML5 / CSS3 / JavaScript** (Vanilla — zero frameworks)
- **SheetJS** (CDN) — leitura de arquivos Excel
- **Chart.js** (CDN) — gráficos do dashboard analítico
- **BrasilAPI** — consulta pública de CNPJs na Receita Federal

## ▶️ Como Executar

```bash
# Opção 1: Python
python3 -m http.server 8080

# Opção 2: Node.js
npx serve .

# Acesse: http://localhost:8080
```

## 📋 Funcionalidades

- [x] Upload de CSV e XLSX (drag & drop)
- [x] Modo em lote e unitário
- [x] Métricas em tempo real (6 cards)
- [x] Barra de progresso com ETA
- [x] Tabela com busca, filtros e paginação
- [x] Painel lateral de auditoria detalhada
- [x] Exportação CSV com todos os campos da Receita Federal
- [x] Design responsivo (3 breakpoints)
- [x] Notificações toast

## 📄 Licença

Projeto acadêmico — Pós-graduação FIAP.

## 👥 Equipe

- Daniel Roecker —
- Daniel Carrança (danieldchm) — RM370526
- Henrique 'Padawan' Gomes Pedroso (pedrosohgp) — RM374303
- Thiago Bezerra
- Fabio Correa
- Vini da JOYn
