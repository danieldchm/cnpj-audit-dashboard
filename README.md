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
├── index.html          # Estrutura principal do dashboard
├── styles.css          # Design system (dark theme, glassmorphism)
├── app.js              # Lógica de UI, tabela, processamento
├── utils.js            # Validação CNPJ, auditoria, exportação
├── api.js              # Integração BrasilAPI + web intelligence
├── sample_data.csv     # Dados de exemplo para testes
└── README.md           # Este arquivo
```

## 🛠️ Tecnologias

- **HTML5 / CSS3 / JavaScript** (Vanilla — zero frameworks)
- **SheetJS** (CDN) — leitura de arquivos Excel
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

- Daniel Roecker — Definição do Problema
- Daniel Carrança — Brief & Estratégia
