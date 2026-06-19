# AuditBase — De uma planilha parada a vendas no mesmo dia
### Versão Business · linguagem simples, foco em valor

> **Conteúdo da apresentação (versão executiva).** Esta é a **v2**, escrita para um público de **negócios** — sem jargão técnico. A versão técnica completa está em `apresentacao_tecnica.md`.
> Aqui é **só o conteúdo**. O design dos slides vem depois.

---

## Slide 0 — Capa

**AuditBase**
A ferramenta que transforma uma base de clientes esquecida em **oportunidades de venda priorizadas** — construída em poucas noites, com Inteligência Artificial.

*MBA 3ABL · AI Leadership — Strategy, Governance & Scale*

**Equipe:** Daniel Roecker · Daniel Carrança · Henrique "Padawan" Gomes Pedroso · Thiago Bezerra · Fabio Correa · Vinicius Costa (JOYn)

**Em uma frase:** *Pegamos uma planilha de 10 mil clientes inativos e a transformamos em uma lista de "ligue para estes primeiro" — em dias, não em meses.*

---

## Slide 1 — O problema de negócio

**A situação:** uma distribuidora atacadista tem **mais de 10.000 empresas cadastradas** que pararam de comprar. Esse cadastro está parado numa planilha.

**A dor, no dia a dia do vendedor:**
- Ele **não sabe** se a empresa ainda existe ou já fechou.
- O **telefone e o e-mail** podem estar errados ou desatualizados.
- Ele **não sabe por onde começar** — então liga do topo da planilha, no escuro.

**Quanto isso custa (sem a ferramenta):**
- Tempo desperdiçado ligando para empresas **que já fecharam**.
- Oportunidades boas **paradas, esfriando**, enquanto o vendedor garimpa.
- Dinheiro "dormindo" numa base que ninguém consegue trabalhar de forma organizada.

**A pergunta que o negócio precisa responder:**
> *"Da minha base inativa, em quem eu ligo primeiro, com qual conversa, e o que preciso corrigir no cadastro?"*

---

## Slide 2 — A solução, em linguagem simples

**O que a ferramenta faz, do começo ao fim:**

1. Você **sobe a planilha** de clientes (arrasta e solta).
2. A ferramenta **consulta a Receita Federal** automaticamente, cliente por cliente.
3. Ela **compara** o que está no seu cadastro com o dado oficial e aponta o que está errado.
4. Ela **dá uma nota** para cada cliente: quão quente é a oportunidade de venda.
5. Ela monta uma **lista priorizada**, já com telefone, e-mail e a **melhor abordagem** para cada um.
6. Você **exporta essa lista** e entrega pronta para o time comercial.

**A analogia:** é como ter um **assistente que lê 10 mil cadastros numa madrugada**, separa o joio do trigo, e te entrega de manhã a lista de "comece por aqui".

**E tem um plus:** a ferramenta agora vem com um **assistente de IA com quem você conversa em português** — pergunta "como está fulano?" ou "quem devo priorizar?" e ele responde consultando a base. E o melhor: essa IA **roda dentro do próprio computador**, então **nenhum dado de cliente é enviado para a internet**.

---

## Slide 3 — Como construímos: o método dos 7 passos

> Mesmo método ensinado na disciplina, traduzido para o que fizemos na prática.

| Passo | O que significa | O que fizemos |
|---|---|---|
| **1. Definir o problema** | Achar uma dor real e pequena | Base de 10 mil clientes inativos sem priorização |
| **2. Escrever o brief** | Dizer em palavras simples o que se quer | "Transformar a planilha numa lista de quem ligar primeiro" |
| **3. Gerar o protótipo** | Fazer a primeira versão funcionar | Em poucas horas, já tínhamos a base rodando |
| **4. Conectar dados** | Sair do faz-de-conta para dados reais | Plugamos na **Receita Federal** (dados oficiais) |
| **5. Iterar por intenção** | Refinar conversando, não programando | Pedimos ajustes em português; a IA foi melhorando |
| **6. Revisar criticamente** | Olhar com lupa: erros, segurança | Caçamos falhas escondidas e protegemos os dados |
| **7. Demonstrar e decidir** | Mostrar e capturar aprendizado | Painéis, lista de ação e próximos passos definidos |

**A grande mudança de mentalidade:**
> Não escrevemos código linha a linha. Nós **dirigimos a IA por intenção** — descrevendo o que o negócio precisa, na velocidade de uma conversa.

---

## Slide 4 — O que mudou para o time comercial (Antes × Depois)

| | **Antes** (planilha crua) | **Depois** (AuditBase) |
|---|---|---|
| **Por onde começar** | Do topo da planilha, no escuro | Lista priorizada por potencial de venda |
| **A empresa ainda existe?** | Descobre só ao ligar | Já sabe (dado oficial da Receita) |
| **Contato** | Telefone/e-mail podem estar errados | Dados oficiais + os melhores canais |
| **A conversa** | "Oi, tudo bem?" genérico | Abordagem sugerida por tipo de cliente |
| **Cadastros mortos** | Tomam tempo do vendedor | Já filtrados e fora do caminho |
| **Visão da gestão** | Nenhuma | Painel: dinheiro parado, oportunidades quentes, carteira por vendedor |

**Tradução em produtividade:** o vendedor passa **menos tempo procurando** e **mais tempo vendendo** — falando com quem tem real chance de comprar.

---

## Slide 5 — A inteligência que vai além do óbvio

> A ferramenta não só organiza a lista — ela **descobre oportunidades escondidas** na própria base.

- 🔗 **Mesmo dono, várias empresas:** identifica quando o mesmo sócio aparece em vários clientes — abrindo a chance de **vender mais para um mesmo grupo**.
- 🔄 **Empresa "renascida":** quando um cliente fechou um CNPJ mas abriu outro ativo — uma oportunidade que passaria batida.
- 🏢 **Matriz e filiais:** agrupa unidades da mesma empresa para negociar **volume**.
- 😴 **Oportunidades adormecidas:** bom cliente, do perfil certo, que simplesmente parou de comprar.
- 💰 **Dinheiro parado:** mostra quanto capital está "preso" em clientes inativos da base.
- 👥 **Saúde da carteira por vendedor:** ajuda a gestão a equilibrar e cobrar resultados.
- 💬 **Converse com a base:** um **assistente de IA local** responde perguntas em português ("quem priorizar nesta região?") consultando os dados — sem o gestor precisar abrir planilha.

**Por que isso importa:** esses são insights que um humano **levaria semanas** para cruzar manualmente em 10 mil cadastros — e que aqui saem **automaticamente**.

---

## Slide 6 — Os números que importam

> Não é um rascunho frágil. É uma ferramenta com substância.

| O que medimos | Número |
|---|---|
| Clientes que a ferramenta processa | **10.000+** |
| Informações oficiais trazidas por cliente | **40+ campos** |
| Painéis visuais de gestão | **8 gráficos** |
| Tipos de "oportunidade escondida" que ela descobre | **10** |
| Tamanho da ferramenta construída | **≈ 8.900 linhas** de código |
| Assistente de IA que conversa com a base | **1** (roda local) |
| Tempo para começar a gerar valor | **Dias**, não meses |
| Custo de infraestrutura para rodar | **Praticamente zero** (roda no navegador) |
| Segurança dos dados | A base **não sai do computador** do usuário |
| Preparada para a mudança do **CNPJ alfanumérico** (jul/2026) | **Sim** |

**Leitura de negócio:** muito resultado, custo de operação quase nulo e **privacidade preservada** — os dados dos clientes nunca saem para um servidor externo. E já **pronta para a nova regra de CNPJ** que entra em 2026.

---

## Slide 7 — Velocidade: o que mais impressiona

**Quanto tempo levaria do jeito tradicional?**
Uma ferramenta deste tamanho — com painéis, integração com a Receita, sistema de pontuação, inteligência de base **e um assistente de IA próprio** — normalmente leva **2 a 3 meses** de trabalho de um desenvolvedor.

**Quanto levou com IA (Vibe Coding)?**
O essencial foi construído em **poucas noites de trabalho guiado**, ao longo de cerca de **dez dias**, somando os refinamentos (segurança, assistente de IA e preparo para o novo CNPJ).

> ### De ~2–3 meses para ~2 noites.
> ### Uma aceleração de aproximadamente **20 a 30 vezes**.

**O que isso muda para a empresa:**
- Testar uma ideia deixa de ser um **projeto caro de meses** e vira um **experimento de dias**.
- O risco de "e se não der certo?" despenca — porque o custo de tentar é baixíssimo.
- O gargalo deixa de ser "ter programadores disponíveis" e passa a ser **ter clareza do que se quer**.

*(Os prazos tradicionais são uma estimativa de referência, não uma medição exata.)*

---

## Slide 8 — Time to Value: valor quase imediato

**A ferramenta não é a solução completa e definitiva — e tudo bem.**
O ponto é que ela **já entrega valor desde o primeiro uso**.

**No dia seguinte à construção, o time comercial já tem:**
- ✅ A planilha morta virou **lista priorizada e pronta para ligar**.
- ✅ Telefone, e-mail e abordagem **na mão**, vindos de dado oficial.
- ✅ Cadastros de empresas fechadas **fora do caminho**.
- ✅ A gestão enxergando **dinheiro parado e oportunidades quentes** em segundos.

**A curva de valor (linguagem simples):**

```
Valor para o negócio
   ▲
   │                          ┌─ versão futura (CRM completo)
   │                   ┌──────┘
   │           ┌───────┘   ← vai crescendo com o uso
   │   ███████  ← AQUI: valor já entregue no MVP
   └──────────────────────────────────────────►  Tempo
     ~2 noites
```

**A mensagem central:**
> Em vez de esperar meses pela "ferramenta perfeita", começamos a **capturar valor agora** e evoluímos com base no uso real. Valor medido **em dias, não em trimestres**.

---

## Slide 9 — Honestidade: o que ainda não é, e para onde vai

**O que esta versão ainda NÃO é:**
- Não é um CRM completo (não gerencia todo o funil de vendas ainda).
- Já **salva o progresso da auditoria no navegador** (não se perde ao recarregar), mas ainda **não registra o histórico de cada contato** ("liguei", "mandei WhatsApp") — isso é a próxima fase.
- A "inteligência de mercado" sobre cada empresa ainda é simplificada.

**Por que isso é uma força, e não uma fraqueza:**
- É um **MVP**: faz **uma coisa muito bem** (priorizar a base) e já gera retorno.
- A evolução é **incremental** — pagamos para crescer só o que provar valor.

**Roadmap de evolução (em direção a um CRM):**
1. **Memória:** o salvamento do progresso **já está pronto** (auto-save no navegador); falta registrar o histórico de contatos ("liguei", "mandei WhatsApp").
2. **Funil de reativação:** acompanhar o cliente do "a contatar" até o "comprou de novo".
3. **Integração:** conectar com os sistemas internos da empresa (ERP) automaticamente.

---

## Slide 10 — Conclusão e a decisão

**O que provamos com este projeto:**

> Um time **não-dedicado**, usando **IA guiada por intenção**, entregou em **poucas noites** uma ferramenta que normalmente custaria **meses** — e que **já ajuda o time comercial a vender mais**, mesmo sem ser a solução final.

**Os três aprendizados de liderança:**
1. **Velocidade muda a estratégia:** quando testar custa dias e não meses, a empresa pode experimentar muito mais.
2. **Valor antes da perfeição:** entregar um MVP que já resolve a dor principal vence esperar o produto completo.
3. **A nova habilidade-chave é clareza, não código:** quem souber descrever bem o problema lidera o resultado.

**A frase de fechamento:**
> *"O futuro não é escrever mais código. É ter clareza do que se quer — e deixar a IA executar na velocidade da conversa."*

---

## Apêndice — Roteiro da demonstração ao vivo (3 minutos)

1. **Subir a planilha** de exemplo (arrasta e solta). *(10s)*
2. **Processar** e ver a ferramenta consultando a Receita em tempo real. *(30s)*
3. **Visão Geral:** mostrar o painel de "dinheiro parado" e "oportunidades quentes". *(40s)*
4. **Abrir um cliente:** ver o cadastro corrigido, o telefone e a abordagem sugerida. *(30s)*
5. **Inteligência:** mostrar um caso de "mesmo dono, várias empresas". *(40s)*
6. **Plano de Ação:** filtrar por vendedor e **exportar a lista** pronta para usar. *(30s)*
7. *(Opcional)* **Assistente de IA:** abrir o chat e perguntar em português "quem devo priorizar?" — mostrando a resposta vinda da própria base, com a IA rodando no computador. *(30s)*

**Mensagem ao final da demo:** *"Tudo isso foi construído em poucas noites — e já está pronto para o time usar amanhã."*
