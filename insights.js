/**
 * @file insights.js
 * @description Motor de INFERÊNCIAS AGREGADAS do AuditBase.
 *
 * Enquanto utils.js pontua cada CNPJ isoladamente, este módulo cruza a base
 * INTEIRA para extrair inteligência que só existe no conjunto:
 *
 *   • Distribuições (situação, porte, prioridade, regime tributário, segmento)
 *   • Geografia (UF / município / região)
 *   • Cohorts de recência (faixas de tempo inativo)
 *   • Scorecard por vendedor (saúde de carteira e risco de concentração)
 *   • Cruzamento de sócios (QSA) → grupos econômicos e empresas REABERTAS
 *   • Matriz/filial e redes (mesma raiz de CNPJ)
 *   • Capital em risco × receita potencial
 *   • Painel de anomalias (oportunidades dormentes, etc.)
 *
 * Todas as funções são PURAS sobre o array `results` do app.js, cujo item é:
 *   { status, priority, auditResult, error }
 * onde auditResult é o objeto de Utils.generateAuditResult (pode ser null).
 *
 * Deve ser carregado depois de utils.js e antes de dashboard.js.
 */

const Insights = (function () {
  'use strict';

  // ───────────────────────────────────────────────
  // Helpers internos
  // ───────────────────────────────────────────────

  /** Extrai apenas as entradas processadas com dados oficiais. */
  function _valid(results) {
    return (results || []).filter(
      (r) => r && r.auditResult && r.auditResult.dados_completos_receita
    );
  }

  /** Normaliza nome (sócio / razão) para chave de comparação. */
  function _normName(str) {
    return String(str ?? '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Incrementa contador em um mapa. */
  function _bump(map, key, by = 1) {
    map[key] = (map[key] || 0) + by;
  }

  /** Converte mapa {chave:contagem} em array ordenado desc. */
  function _toSorted(map) {
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  function _capital(rec) {
    const n = parseFloat(rec?.capital_social);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function _situacao(rec) {
    return String(rec?.descricao_situacao_cadastral ?? '')
      .toUpperCase()
      .trim() || 'DESCONHECIDA';
  }

  function _idadeAnos(rec) {
    const d = Utils.parseDateFlexible(rec?.data_inicio_atividade);
    if (!d) return null;
    return (Date.now() - d.getTime()) / (365.25 * 86400000);
  }

  function _diasDesde(value) {
    const d = Utils.parseDateFlexible(value);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  // ───────────────────────────────────────────────
  // 1. Distribuições
  // ───────────────────────────────────────────────

  function distributions(valid) {
    const situacao = {};
    const porte = {};
    const prioridade = {};
    const regime = {};
    const scoreHist = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    const higieneHist = { '0-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };

    for (const r of valid) {
      const a = r.auditResult;
      const rec = a.dados_completos_receita;
      _bump(situacao, _situacao(rec));
      _bump(porte, a.score_breakdown?.porteDetectado || 'DESCONHECIDO');
      _bump(prioridade, a.prioridade_geral || 'N/D');

      if (rec.opcao_pelo_mei === true) _bump(regime, 'MEI');
      else if (rec.opcao_pelo_simples === true) _bump(regime, 'Simples Nacional');
      else _bump(regime, 'Regime Normal / Outros');

      const so = a.score_oportunidade ?? a.score_vpa ?? 0;
      if (so <= 20) scoreHist['0-20']++;
      else if (so <= 40) scoreHist['21-40']++;
      else if (so <= 60) scoreHist['41-60']++;
      else if (so <= 80) scoreHist['61-80']++;
      else scoreHist['81-100']++;

      const sh = a.score_higiene ?? 0;
      if (sh <= 40) higieneHist['0-40']++;
      else if (sh <= 60) higieneHist['41-60']++;
      else if (sh <= 80) higieneHist['61-80']++;
      else higieneHist['81-100']++;
    }

    return {
      situacao: _toSorted(situacao),
      porte: _toSorted(porte),
      prioridade: _toSorted(prioridade),
      regime: _toSorted(regime),
      scoreHist,
      higieneHist,
    };
  }

  // ───────────────────────────────────────────────
  // 2. Segmentos (CNAE) — onde está a afinidade
  // ───────────────────────────────────────────────

  function segmentos(valid, topN = 8) {
    const map = {};
    const afinidadePorSeg = {};
    for (const r of valid) {
      const rec = r.auditResult.dados_completos_receita;
      const desc = (rec.cnae_fiscal_descricao || 'Não informado').trim();
      _bump(map, desc);
      const af = r.auditResult.score_breakdown?.scoreAfinidade ?? 0;
      afinidadePorSeg[desc] = afinidadePorSeg[desc] || { soma: 0, n: 0 };
      afinidadePorSeg[desc].soma += af;
      afinidadePorSeg[desc].n += 1;
    }
    const sorted = _toSorted(map).slice(0, topN).map((s) => ({
      ...s,
      afinidadeMedia: Math.round(
        afinidadePorSeg[s.label].soma / afinidadePorSeg[s.label].n
      ),
    }));
    return sorted;
  }

  // ───────────────────────────────────────────────
  // 3. Geografia
  // ───────────────────────────────────────────────

  // Agrupamento macro-regional por UF (IBGE).
  const REGIAO_POR_UF = {
    AC: 'Norte', AP: 'Norte', AM: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
    AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste',
    PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
    DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
    ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
    PR: 'Sul', RS: 'Sul', SC: 'Sul',
  };

  function geografia(valid) {
    const uf = {};
    const municipio = {};
    const regiao = {};
    for (const r of valid) {
      const rec = r.auditResult.dados_completos_receita;
      const u = String(rec.uf || '').toUpperCase().trim() || '—';
      const m = (rec.municipio || '—').trim();
      _bump(uf, u);
      _bump(municipio, `${m} / ${u}`);
      _bump(regiao, REGIAO_POR_UF[u] || 'Não classificada');
    }
    return {
      uf: _toSorted(uf),
      municipio: _toSorted(municipio).slice(0, 10),
      regiao: _toSorted(regiao),
    };
  }

  // ───────────────────────────────────────────────
  // 4. Cohorts de recência
  // ───────────────────────────────────────────────

  function cohortsRecencia(valid) {
    const buckets = {
      'Ativos (< 6 meses)': 0,
      '6-12 meses': 0,
      '1-2 anos': 0,
      '2-3 anos': 0,
      '> 3 anos': 0,
      'Sem data de compra': 0,
    };
    for (const r of valid) {
      const d = r.auditResult.score_breakdown?.diasInativos;
      if (d == null || d < 0) buckets['Sem data de compra']++;
      else if (d < 180) buckets['Ativos (< 6 meses)']++;
      else if (d < 365) buckets['6-12 meses']++;
      else if (d < 730) buckets['1-2 anos']++;
      else if (d < 1095) buckets['2-3 anos']++;
      else buckets['> 3 anos']++;
    }
    return buckets;
  }

  // ───────────────────────────────────────────────
  // 5. Scorecard por vendedor
  // ───────────────────────────────────────────────

  function vendedores(results) {
    const map = {};
    for (const r of results) {
      if (!r || !r.auditResult) continue;
      const a = r.auditResult;
      const v = (a.vendedor || '—').trim() || '—';
      if (!map[v]) {
        map[v] = {
          vendedor: v, total: 0, ativos: 0, inativos: 0,
          quentes: 0, divergencias: 0, somaScore: 0, capital: 0,
        };
      }
      const s = map[v];
      s.total++;
      const rec = a.dados_completos_receita || {};
      if (_situacao(rec) === 'ATIVA') s.ativos++;
      else s.inativos++;
      if (a.prioridade_geral === 'ALTA') s.quentes++;
      s.divergencias += a.num_divergencias || 0;
      s.somaScore += a.score_oportunidade ?? a.score_vpa ?? 0;
      s.capital += _capital(rec);
    }
    return Object.values(map)
      .map((s) => ({
        ...s,
        pctAtivo: s.total ? Math.round((s.ativos / s.total) * 100) : 0,
        scoreMedio: s.total ? Math.round(s.somaScore / s.total) : 0,
      }))
      .sort((a, b) => b.quentes - a.quentes || b.scoreMedio - a.scoreMedio);
  }

  // ───────────────────────────────────────────────
  // 6. Cruzamento de sócios (QSA) — a inferência de maior valor
  // ───────────────────────────────────────────────

  /**
   * Constrói clusters de CNPJs que compartilham ao menos um sócio.
   * Detecta:
   *   • Grupos econômicos (mesmo dono em >1 cliente ATIVO → upsell/key account)
   *   • Empresas REABERTAS (dono de CNPJ baixado/inapto com outro CNPJ ATIVO)
   */
  function sociosCrossRef(valid) {
    const socioMap = {}; // nome normalizado -> [{cnpj, razao, situacao, ativo, score}]
    for (const r of valid) {
      const a = r.auditResult;
      const rec = a.dados_completos_receita;
      const qsa = Array.isArray(rec.qsa) ? rec.qsa : [];
      const empresa = {
        cnpj: a.cnpj_analisado,
        razao: rec.razao_social || a.cnpj_analisado,
        situacao: _situacao(rec),
        ativo: _situacao(rec) === 'ATIVA',
        score: a.score_oportunidade ?? a.score_vpa ?? 0,
        vendedor: a.vendedor || '',
      };
      for (const s of qsa) {
        const nome = _normName(s.nome_socio || s.nome || '');
        if (!nome || nome.length < 4) continue;
        if (!socioMap[nome]) socioMap[nome] = [];
        // evita duplicar o mesmo CNPJ sob o mesmo sócio
        if (!socioMap[nome].some((e) => e.cnpj === empresa.cnpj)) {
          socioMap[nome].push(empresa);
        }
      }
    }

    const grupos = [];
    const reabertas = [];

    for (const [socio, empresas] of Object.entries(socioMap)) {
      if (empresas.length < 2) continue; // precisa ligar 2+ CNPJs

      const temAtiva = empresas.some((e) => e.ativo);
      const temInativa = empresas.some((e) => !e.ativo);

      grupos.push({
        socio,
        qtde: empresas.length,
        empresas: empresas.slice().sort((a, b) => b.score - a.score),
        ativas: empresas.filter((e) => e.ativo).length,
      });

      // Empresa reaberta: sócio com CNPJ inativo E CNPJ ativo
      if (temAtiva && temInativa) {
        reabertas.push({
          socio,
          inativas: empresas.filter((e) => !e.ativo),
          ativas: empresas.filter((e) => e.ativo),
        });
      }
    }

    grupos.sort((a, b) => b.qtde - a.qtde);
    return { grupos: grupos.slice(0, 25), reabertas, totalGrupos: grupos.length };
  }

  // ───────────────────────────────────────────────
  // 7. Matriz / filial / redes (mesma raiz de CNPJ)
  // ───────────────────────────────────────────────

  function redes(valid) {
    const raizMap = {}; // 8 primeiros dígitos -> [{cnpj, razao, ordem, ativo}]
    for (const r of valid) {
      const a = r.auditResult;
      const rec = a.dados_completos_receita;
      const digits = Utils.cleanCNPJ(a.cnpj_analisado);
      if (digits.length !== 14) continue;
      const raiz = digits.slice(0, 8);
      const ordem = digits.slice(8, 12); // 0001 = matriz
      if (!raizMap[raiz]) raizMap[raiz] = [];
      raizMap[raiz].push({
        cnpj: a.cnpj_analisado,
        razao: rec.razao_social || a.cnpj_analisado,
        ordem,
        matriz: ordem === '0001',
        ativo: _situacao(rec) === 'ATIVA',
      });
    }
    const grupos = Object.entries(raizMap)
      .filter(([, arr]) => arr.length > 1)
      .map(([raiz, arr]) => ({
        raiz,
        razao: arr[0].razao,
        unidades: arr.length,
        ativas: arr.filter((e) => e.ativo).length,
        estabelecimentos: arr.sort((a, b) => a.ordem.localeCompare(b.ordem)),
      }))
      .sort((a, b) => b.unidades - a.unidades);
    return grupos;
  }

  // ───────────────────────────────────────────────
  // 8. Capital em risco × receita potencial
  // ───────────────────────────────────────────────

  function capital(valid) {
    let totalBase = 0;
    let potencialAtivo = 0; // capital de ativos com prioridade ALTA/MEDIA
    let quenteAlto = 0;     // capital de oportunidades quentes (ALTA)
    let emRiscoInativo = 0; // capital preso em baixada/suspensa/inapta
    for (const r of valid) {
      const a = r.auditResult;
      const rec = a.dados_completos_receita;
      const cap = _capital(rec);
      totalBase += cap;
      const ativo = _situacao(rec) === 'ATIVA';
      if (ativo) {
        if (a.prioridade_geral === 'ALTA' || a.prioridade_geral === 'MEDIA') {
          potencialAtivo += cap;
        }
        if (a.prioridade_geral === 'ALTA') quenteAlto += cap;
      } else {
        emRiscoInativo += cap;
      }
    }
    return { totalBase, potencialAtivo, quenteAlto, emRiscoInativo };
  }

  // ───────────────────────────────────────────────
  // 9. Painel de anomalias / sinais acionáveis
  // ───────────────────────────────────────────────

  function anomalias(valid) {
    const dormentes = [];        // ativa + alta afinidade/porte + recência fria
    const recemReativadas = [];  // mudança de situação recente p/ ATIVA
    const semContato = [];       // ativa, bom score, sem telefone e sem email
    const grandesInativas = [];  // capital alto preso em inativa

    for (const r of valid) {
      const a = r.auditResult;
      const rec = a.dados_completos_receita;
      const bd = a.score_breakdown || {};
      const ativo = _situacao(rec) === 'ATIVA';
      const cap = _capital(rec);

      // Oportunidade dormente: empresa boa (afinidade+porte) mas comprou há muito tempo
      if (
        ativo &&
        (bd.scoreAfinidade ?? 0) >= 60 &&
        (bd.scorePorte ?? 0) >= 70 &&
        bd.diasInativos != null &&
        bd.diasInativos >= 365
      ) {
        dormentes.push({
          cnpj: a.cnpj_analisado,
          razao: rec.razao_social,
          dias: bd.diasInativos,
          afinidade: bd.scoreAfinidade,
          vendedor: a.vendedor,
        });
      }

      // Recém-reativada: situação ATIVA com data de situação nos últimos 12 meses
      if (ativo) {
        const dSit = _diasDesde(rec.data_situacao_cadastral);
        const idade = _idadeAnos(rec);
        if (dSit != null && dSit <= 365 && idade != null && idade > 1) {
          recemReativadas.push({
            cnpj: a.cnpj_analisado,
            razao: rec.razao_social,
            diasSituacao: dSit,
            vendedor: a.vendedor,
          });
        }
      }

      // Ativa com bom score mas sem canal de contato oficial
      const so = a.score_oportunidade ?? a.score_vpa ?? 0;
      if (ativo && so >= 55 && !rec.ddd_telefone_1 && !rec.email) {
        semContato.push({
          cnpj: a.cnpj_analisado,
          razao: rec.razao_social,
          score: so,
          vendedor: a.vendedor,
        });
      }

      // Capital relevante preso em empresa inativa
      if (!ativo && cap >= 1000000) {
        grandesInativas.push({
          cnpj: a.cnpj_analisado,
          razao: rec.razao_social,
          situacao: _situacao(rec),
          capital: cap,
        });
      }
    }

    dormentes.sort((a, b) => b.afinidade - a.afinidade);
    grandesInativas.sort((a, b) => b.capital - a.capital);
    recemReativadas.sort((a, b) => a.diasSituacao - b.diasSituacao);

    return { dormentes, recemReativadas, semContato, grandesInativas };
  }

  // ───────────────────────────────────────────────
  // 10. Plano de ação consolidado (worklist priorizada)
  // ───────────────────────────────────────────────

  function planoAcao(valid) {
    const fila = valid
      .map((r) => {
        const a = r.auditResult;
        const rec = a.dados_completos_receita;
        return {
          cnpj: a.cnpj_analisado,
          razao: rec.razao_social || a.cnpj_analisado,
          vendedor: a.vendedor || '—',
          prioridade: a.prioridade_geral,
          classificacao: a.classificacao,
          score: a.score_oportunidade ?? a.score_vpa ?? 0,
          higiene: a.score_higiene ?? 0,
          acao: a.acao_recomendada,
          telefone: rec.ddd_telefone_1 || '',
          situacao: _situacao(rec),
        };
      })
      .filter((x) => x.prioridade === 'ALTA' || x.prioridade === 'MEDIA')
      .sort((a, b) => {
        const rank = { ALTA: 0, MEDIA: 1 };
        return (rank[a.prioridade] - rank[b.prioridade]) || b.score - a.score;
      });
    return fila;
  }

  // ───────────────────────────────────────────────
  // Agregador principal
  // ───────────────────────────────────────────────

  function computeInsights(results) {
    const valid = _valid(results);
    const dist = distributions(valid);
    return {
      totalValidos: valid.length,
      distributions: dist,
      segmentos: segmentos(valid),
      geografia: geografia(valid),
      cohorts: cohortsRecencia(valid),
      vendedores: vendedores(results),
      socios: sociosCrossRef(valid),
      redes: redes(valid),
      capital: capital(valid),
      anomalias: anomalias(valid),
      planoAcao: planoAcao(valid),
    };
  }

  return {
    computeInsights,
    REGIAO_POR_UF,
    // expostos para teste unitário
    _internals: {
      sociosCrossRef, redes, anomalias, cohortsRecencia, vendedores,
    },
  };
})();

if (typeof window !== 'undefined') window.Insights = Insights;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Insights;
}
