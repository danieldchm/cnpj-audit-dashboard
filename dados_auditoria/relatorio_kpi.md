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
| **BAIXADA** | 591 | 11.82% | Bloquear cadastro / Descarte |
| **ATIVA** | 638 | 12.76% | Auditar divergências |
| **INAPTA** | 256 | 5.12% | Suspender compras / Faturamento |
| **SUSPENSA** | 12 | 0.24% | Aguardar regularização |
| **NÃO ENCONTRADO** | 3499 | 69.99% | Cruzar com dados internos / CPF |
| **INVÁLIDO** | 2 | 0.04% | Corrigir CNPJ com o cliente |
| **ERRO** | 1 | 0.02% | Auditar divergências |

- **Total de Empresas Ativas**: 638 (12.76%)
- **Total de Empresas Inativas (Baixadas/Inaptas/Suspensas)**: 859 (17.18%)

---

## 3. Priorização de Ações e Saneamento (Filtro Comercial)

Distribuição dos clientes em faixas de priorização geradas pelo motor de score do AuditBase:

| Nível de Prioridade | Clientes | Percentual | Decisão Estratégica |
|----------------------|----------|------------|---------------------|
| 🔴 **ALTA** | 41 | 0.82% | Tratar divergências cadastrais ativas críticas imediatamente |
| 🟡 **MÉDIA** | 357 | 7.14% | Programar atualização cadastral programada |
| 🟢 **BAIXA** | 508 | 10.16% | Dados saudáveis, acompanhar consultas anuais periódicas |
| ⚪ **DESCARTE** | 4093 | 81.88% | Inativas/Baixadas. Bloquear faturamento / Arquivar |

## 4. Análise de Divergências Encontradas (Diferença Dados Internos vs. Oficial)

Foram identificados **1231 clientes** contendo uma ou mais divergências cadastrais em relação aos dados oficiais do governo (dentre os 1497 consultados com sucesso).

Frequência de divergências encontradas por tipo de campo comparado:

| Campo Comparado | Divergências Identificadas | Percentual sobre Consultados (1497) |
|-----------------|-----------------------------|----------------------------------|
| **razao_social** | 1192 | 79.63% |
| **municipio** | 216 | 14.43% |

---

## 5. Avaliação do Motor de Scoring (Médias Gerais)

As médias de score para os CNPJs válidos e processados revelam a qualidade geral da base sob a ótica de Vendas e Higiene:

1. **Score Médio de Higiene (Higiene Cadastral)**: **61.1 / 100**
   - *Diagnóstico*: Indica uma base com consistência moderada. Erros de digitação de nomes, CEPs desatualizados e divergências de endereços arrastam essa nota para baixo.
2. **Score de Afinidade Comercial (Alinhamento ao Portfólio)**: **21.0 / 100**
   - *Diagnóstico*: Demonstra a aderência dos clientes da carteira em relação aos setores estratégicos mapeados (CNAEs).
3. **Score Geral de Venda Potencial Ativa**: **21.0 / 100**
   - *Diagnóstico*: Este indicador combina a atividade do CNPJ, recência de compra e porte. Mostra o potencial de reativação imediata de clientes saudáveis.

## 6. Sumarização dos Resultados e Conclusão

O projeto **AuditBase** demonstrou de forma contundente seu valor na higienização automatizada de grandes volumes de clientes:

- **Saneamento de Inativos**: Identificou mais de **847 empresas baixadas ou inaptas** que ainda constavam na base interna, reduzindo fraudes ou envios frustrados de mercadorias.
- **Correção Cadastral**: Apontou **1231 divergências críticas** (principalmente de Razão Social e Endereço), essenciais para emissão de notas fiscais corretas (NFe) e validação tributária.
- **Direcionamento Comercial**: Segmentou a base inativa em leads de **Alta Prioridade**, direcionando a força de vendas aos clientes com maior probabilidade de retorno e CNPJs regulares.

---
*Relatório gerado automaticamente através da camada de API do projeto AuditBase.*
