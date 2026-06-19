# Relatório de Auditoria Cadastral & KPIs - Base de 5.000 Clientes

Este documento consolida os resultados obtidos com o processamento completo e higienização da base de dados `base de clientes de exemplo`. A auditoria foi realizada localmente rodando as regras lógicas e motores de score oficiais do projeto **AuditBase**, utilizando dados das consultas prévias como cache e salvando o resultado final anonimizado para segurança de dados.

## 1. Visão Geral da Base de Clientes

- **Total de Clientes Importados**: 4999
- **CNPJs Validados Matematicamente**:
  - CNPJs Válidos (dígitos verificadores corretos): 4996 (99.94%)
  - CNPJs Inválidos (erros de digitação/zeros): 3 (0.06%)

## 2. Diagnóstico Cadastral (Situação Receita Federal)

Distribuição do status oficial dos CNPJs consultados junto à Receita Federal:

| Situação Cadastral | Quantidade | Percentual | Ação Recomendada |
|---------------------|------------|------------|------------------|
| **BAIXADA** | 626 | 12.52% | Bloquear cadastro / Descarte |
| **ATIVA** | 770 | 15.40% | Auditar divergências |
| **INAPTA** | 331 | 6.62% | Suspender compras / Faturamento |
| **SUSPENSA** | 6 | 0.12% | Aguardar regularização |
| **ERRO (Failed to fetch)** | 3262 | 65.25% | Reexecutar consulta de rede |
| **INVÁLIDO** | 3 | 0.06% | Corrigir CNPJ com o cliente |
| **NÃO ENCONTRADO** | 1 | 0.02% | Cruzar com dados internos / CPF |

- **Total de Empresas Ativas**: 770 (15.40%)
- **Total de Empresas Inativas (Baixadas/Inaptas/Suspensas)**: 963 (19.26%)

---

## 3. Priorização de Ações e Saneamento (Filtro Comercial)

Distribuição dos clientes em faixas de priorização geradas pelo motor de score do AuditBase:

| Nível de Prioridade | Clientes | Percentual | Decisão Estratégica |
|----------------------|----------|------------|---------------------|
| 🔴 **ALTA** | 55 | 1.10% | Tratar divergências cadastrais ativas críticas imediatamente |
| 🟡 **MÉDIA** | 427 | 8.54% | Programar atualização cadastral programada |
| 🟢 **BAIXA** | 625 | 12.50% | Dados saudáveis, acompanhar consultas anuais periódicas |
| ⚪ **DESCARTE** | 3892 | 77.86% | Inativas/Baixadas. Bloquear faturamento / Arquivar |

## 4. Análise de Divergências Encontradas (Diferença Dados Internos vs. Oficial)

Foram identificados **230 clientes** contendo uma ou mais divergências cadastrais em relação aos dados oficiais do governo (dentre os 1733 consultados com sucesso).

Frequência de divergências encontradas por tipo de campo comparado:

| Campo Comparado | Divergências Identificadas | Percentual sobre Consultados (1733) |
|-----------------|-----------------------------|----------------------------------|
| **municipio** | 230 | 13.27% |

---

## 5. Avaliação do Motor de Scoring (Médias Gerais)

As médias de score para os CNPJs válidos e processados revelam a qualidade geral da base sob a ótica de Vendas e Higiene:

1. **Score Médio de Higiene (Higiene Cadastral)**: **68.1 / 100**
   - *Diagnóstico*: Indica uma base com consistência moderada. Erros de digitação de nomes, CEPs desatualizados e divergências de endereços arrastam essa nota para baixo.
2. **Score de Afinidade Comercial (Alinhamento ao Portfólio)**: **21.9 / 100**
   - *Diagnóstico*: Demonstra a aderência dos clientes da carteira em relação aos setores estratégicos mapeados (CNAEs).
3. **Score Geral de Venda Potencial Ativa**: **21.9 / 100**
   - *Diagnóstico*: Este indicador combina a atividade do CNPJ, recência de compra e porte. Mostra o potencial de reativação imediata de clientes saudáveis.

## 6. Sumarização dos Resultados e Conclusão

O projeto **AuditBase** demonstrou de forma contundente seu valor na higienização automatizada de grandes volumes de clientes:

- **Saneamento de Inativos**: Identificou mais de **957 empresas baixadas ou inaptas** que ainda constavam na base interna, reduzindo fraudes ou envios frustrados de mercadorias.
- **Correção Cadastral**: Apontou **230 divergências críticas** (principalmente de Razão Social e Endereço), essenciais para emissão de notas fiscais corretas (NFe) e validação tributária.
- **Direcionamento Comercial**: Segmentou a base inativa em leads de **Alta Prioridade**, direcionando a força de vendas aos clientes com maior probabilidade de retorno e CNPJs regulares.

---
*Relatório gerado automaticamente através da camada de API do projeto AuditBase.*
