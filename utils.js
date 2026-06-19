/**
 * @file utils.js (v2)
 * @description Utilitários do AuditBase + Engine de Scoring Distribuidora v2.
 *
 * Mudanças principais em relação à v1:
 *  - [BUG] Removido ReferenceError no export (determinePriority/determineAction
 *    agora existem como wrappers de compatibilidade).
 *  - [BUG] Datas brasileiras (dd/mm/aaaa) parseadas corretamente; datas
 *    futuras viram flag de qualidade, não bônus de recência.
 *  - [BUG] parseCSV reescrito como máquina de estados sobre o texto inteiro:
 *    suporta quebras de linha dentro de campos com aspas.
 *  - [BUG] exportToXLSX alinhado ao schema real dos resultados.
 *  - [SCORING v2] Score contínuo de recência (decaimento exponencial),
 *    afinidade por CÓDIGO CNAE (não substring de descrição), porte calibrado
 *    para o ICP da distribuidora (pequeno varejo), situação cadastral como GATE
 *    multiplicativo e separação em dois scores:
 *      • score_oportunidade — quem contatar primeiro (comercial)
 *      • score_higiene     — qualidade do cadastro (operacional)
 *    `score_vpa` é mantido como alias de score_oportunidade p/ compatibilidade.
 *
 * Deve ser carregado antes de api.js.
 */

const Utils = (function () {
  'use strict';

  // ═══════════════════════════════════════════════
  // CONFIGURAÇÃO DO SCORING (calibrável)
  // ═══════════════════════════════════════════════
  //
  // IMPORTANTE: estes defaults assumem o ICP de uma distribuidora atacadista
  // de papelaria — o comprador típico é o PEQUENO varejo (ME/EPP), não a
  // grande empresa. Valide os pesos de porte contra o histórico real de
  // vendas dos últimos 24 meses antes de considerar calibrado.

  const SCORE_CONFIG = {
    // Pesos do Score de Oportunidade (somam 1.0)
    weights: {
      recencia: 0.45,
      afinidade: 0.35,
      porte: 0.20,
    },

    // Decaimento exponencial da recência: score = 100 * e^(-dias / TAU)
    // TAU=730 → 6 meses ≈ 78 pts, 1 ano ≈ 61, 2 anos ≈ 37, 3 anos ≈ 22.
    recenciaTauDias: 730,

    // Desconto de confiança quando a data de última compra está ausente ou
    // ilegível: o peso da recência é redistribuído (neutro), mas o score
    // final é multiplicado por este fator para que um registro INCOMPLETO
    // não ultrapasse registros completos equivalentes no ranking.
    // (Calibrado em execução local: sem o desconto, clientes sem data
    // chegavam ao top 10 acima de clientes com recência conhecida e boa.)
    descontoDadoRecenciaAusente: 0.85,

    // Pontuação por porte — calibrada para ICP de pequeno varejo.
    porte: {
      ME: 85,
      EPP: 95,
      DEMAIS: 65,
      MEI: 40,
      DESCONHECIDO: 50,
    },

    // Bônus de "tração": empresa jovem com capital relevante = investimento
    // recente (abertura/expansão de loja). Aplicado sobre o score de porte.
    tracao: {
      idadeMaxAnos: 3,
      capitalMinimo: 100000,
      bonus: 10,
    },

    // Gate multiplicativo por situação cadastral (modelo NÃO compensatório:
    // recência boa não "compra de volta" uma empresa suspensa).
    gateSituacao: {
      ATIVA: 1.0,
      SUSPENSA: 0.4,
      INAPTA: 0.25, // regularizável — gancho de conversa, não descarte
      BAIXADA: 0.0,
      NULA: 0.0,
      DESCONHECIDA: 0.5,
    },

    // Afinidade por código CNAE (prefixos, dígitos apenas).
    // Prefixo mais longo vence. CNAE secundário vale 60% do primário.
    cnaeAffinity: {
      '4761003': 100, // varejo de artigos de papelaria (core absoluto)
      '4761001': 90,  // varejo de livros
      '4761002': 80,  // varejo de jornais e revistas
      '47610': 90,    // varejo de livros/jornais genérico
      '4647801': 90,  // atacado de artigos de escritório e papelaria
      '4647802': 80,  // atacado de livros, jornais e publicações
      '46478': 85,    // atacado de papelaria genérico
      '4789007': 75,  // varejo de equipamentos para escritório
      '4789099': 60,  // outros comércios novos
      '4789001': 50,  // souvenirs e presentes
      '47890': 50,    // equipamentos e presentes
      '4755503': 70,  // armarinho específico
      '47555': 70,    // armarinho
      '47636': 55,    // brinquedos e artigos recreativos
      '47130': 50,    // lojas de departamentos / variedades
      '85': 65,       // educação (escolas compram material recorrentemente)
      '18': 60,       // impressão e reprodução (gráficas compram papel)
      '4711': 40,     // hiper/supermercados
      '4712': 40,     // minimercados
    },
    cnaeSecundarioFator: 0.6,
    cnaeAffinityDefault: 20,

    // Fallback por palavra-chave quando só há descrição textual.
    cnaeKeywords: [
      { re: /PAPELARIA/, score: 100 },
      { re: /LIVRAR|LIVROS/, score: 90 },
      { re: /ESCRITORIO|ESCRITÓRIO/, score: 75 },
      { re: /ARMARINHO/, score: 70 },
      { re: /JORNAIS|REVISTAS/, score: 70 },
      { re: /ESCOLA|ENSINO|EDUCA/, score: 65 },
      { re: /GRAFICA|GRÁFICA|IMPRESS/, score: 60 },
      { re: /BRINQUEDO/, score: 55 },
      { re: /PRESENTE|VARIEDADES/, score: 50 },
    ],

    // Score de Higiene Cadastral (0-100): completude + consistência.
    higiene: {
      pontosTelefone: 20,
      pontosEmail: 15,
      pontosEndereco: 15,
      pontosQsa: 10,
      baseConsistencia: 40,
      penalidadePorDivergencia: 10,
    },

    // Limiares de classificação sobre o score_oportunidade pós-gate.
    thresholds: {
      quente: 75,
      alto: 55,
      moderado: 35,
    },
  };

  // ═══════════════════════════════════════════════
  // CNPJ Helpers
  // ═══════════════════════════════════════════════

  /**
   * Remove tudo que não é dígito de um CNPJ.
   * @param {string} cnpj
   * @returns {string}
   */
  function cleanCNPJ(cnpj) {
    if (typeof cnpj !== 'string') cnpj = String(cnpj ?? '');
    // Mantém letras (CNPJ alfanumérico — novo padrão a partir de jul/2026) e
    // dígitos; remove a máscara (. / -) e espaços. Para CNPJ numérico o
    // resultado é idêntico ao comportamento anterior.
    return cnpj.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /**
   * Formata para `00.000.000/0001-00`. Devolve o original se inválido.
   * @param {string} cnpj
   * @returns {string}
   */
  function formatCNPJ(cnpj) {
    if (typeof cnpj !== 'string') cnpj = String(cnpj ?? '');
    const d = cleanCNPJ(cnpj);
    if (d.length !== 14) return cnpj;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  }

  /**
   * Valida CNPJ pelo algoritmo oficial de dígitos verificadores.
   *
   * Suporta os DOIS formatos:
   *  - Numérico (atual): 14 dígitos.
   *  - Alfanumérico (novo padrão a partir de jul/2026): 12 posições
   *    alfanuméricas [A-Z0-9] + 2 dígitos verificadores numéricos.
   *
   * O valor de cada caractere no cálculo é `código ASCII − 48`
   * ('0'→0…'9'→9, 'A'→17…'Z'→42). Para CNPJ numérico isto é idêntico a
   * `Number(dígito)`, então o comportamento dos CNPJs atuais não muda.
   *
   * @param {string} cnpj
   * @returns {boolean}
   */
  function validateCNPJ(cnpj) {
    const v = cleanCNPJ(cnpj);
    if (v.length !== 14) return false;
    // 12 posições alfanuméricas + 2 dígitos verificadores numéricos
    if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(v)) return false;
    // rejeita 14 caracteres idênticos (ex.: 000…0, 111…1)
    if (/^(.)\1{13}$/.test(v)) return false;

    const val = (ch) => ch.charCodeAt(0) - 48;

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum1 = 0;
    for (let i = 0; i < 12; i++) sum1 += val(v[i]) * weights1[i];
    const r1 = sum1 % 11;
    if (Number(v[12]) !== (r1 < 2 ? 0 : 11 - r1)) return false;

    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum2 = 0;
    for (let i = 0; i < 13; i++) sum2 += val(v[i]) * weights2[i];
    const r2 = sum2 % 11;
    if (Number(v[13]) !== (r2 < 2 ? 0 : 11 - r2)) return false;

    return true;
  }

  // ═══════════════════════════════════════════════
  // Datas (correção do bug crítico de recência)
  // ═══════════════════════════════════════════════

  /**
   * Parser de datas tolerante aos formatos reais de planilhas brasileiras.
   *
   * Suporta: dd/mm/aaaa, dd-mm-aaaa, dd/mm/aa, aaaa-mm-dd (ISO),
   * aaaa/mm/dd e número serial do Excel (dias desde 30/12/1899).
   *
   * NUNCA usa `new Date(string)` com formato ambíguo — era isso que fazia
   * "05/03/2024" virar 3 de maio (padrão US) e "15/03/2024" virar Invalid
   * Date, zerando silenciosamente 30% do score na v1.
   *
   * @param {*} value
   * @returns {Date|null} Date válida ou null.
   */
  function parseDateFlexible(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

    // Número serial do Excel (aceita número real ou string numérica)
    const numVal = Number(value);
    if (!isNaN(numVal) && isFinite(numVal) && numVal > 20000 && numVal < 80000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(excelEpoch.getTime() + numVal * 86400000);
    }

    const str = String(value).trim();

    // ISO: aaaa-mm-dd ou aaaa/mm/dd ou aaaa.mm.dd
    let m = str.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(d.getTime()) ? null : d;
    }

    // Brasileiro: dd/mm/aaaa, dd-mm-aaaa, dd.mm.aa (aceita aa de 2 dígitos)
    m = str.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
    if (m) {
      let year = Number(m[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      const month = Number(m[2]) - 1;
      const day = Number(m[1]);
      if (month < 0 || month > 11 || day < 1 || day > 31) return null;
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  // ═══════════════════════════════════════════════
  // CSV (parser reescrito — máquina de estados)
  // ═══════════════════════════════════════════════

  /**
   * Parse de CSV para array de objetos, usando a primeira linha como headers.
   *
   * Diferente da v1, percorre o TEXTO INTEIRO caractere a caractere, então
   * quebras de linha DENTRO de campos com aspas (razões sociais multilinhas,
   * endereços com Enter) não corrompem mais o parse.
   *
   * Suporta vírgula e ponto-e-vírgula como separador (auto-detectado pela
   * linha de header — exportações de Excel pt-BR usam ';').
   *
   * @param {string} text
   * @returns {Array<Object>}
   */
  function parseCSV(text) {
    if (typeof text !== 'string' || text.trim().length === 0) return [];

    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM

    // Auto-detecção de delimitador na primeira linha não-vazia
    const firstLine = (text.split(/\r?\n/).find((l) => l.trim() !== '') || '');
    const delimiter =
      (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
        ? ';'
        : ',';

    /** @type {string[][]} */
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch; // inclui \n dentro de aspas — caso que quebrava a v1
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field.trim());
        field = '';
        if (row.some((f) => f !== '')) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    // Último campo/linha
    row.push(field.trim());
    if (row.some((f) => f !== '')) rows.push(row);

    if (rows.length === 0) return [];

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const results = [];

    for (let r = 1; r < rows.length; r++) {
      const values = rows[r];
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = c < values.length ? values[c] : '';
      }
      results.push(obj);
    }

    return results;
  }

  // ═══════════════════════════════════════════════
  // Comparação de strings / divergências
  // ═══════════════════════════════════════════════

  /**
   * Normaliza string para comparação fuzzy (caixa, espaços, abreviações).
   * @param {string} str
   * @returns {string}
   */
  function normalizeForComparison(str) {
    if (typeof str !== 'string') return '';
    let s = str.toUpperCase().trim();
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos
    s = s.replace(/\s+/g, ' ');
    s = s.replace(/\bLTDA\b\.?/g, 'LIMITADA');
    s = s.replace(/\bS\.A\.\b/g, 'SA');
    s = s.replace(/\bS\/A\b/g, 'SA');
    s = s.replace(/\bME\b\./g, 'ME');
    s = s.replace(/\bEPP\b\./g, 'EPP');
    s = s.replace(/[.\-]/g, '');
    return s.trim();
  }

  /**
   * Compara dois valores de campo e devolve descritor de divergência.
   * @param {*} internal
   * @param {*} official
   * @param {string} fieldName
   * @returns {{isDivergent:boolean, internal:string, official:string}|null}
   */
  function compareFields(internal, official, fieldName) {
    const internalStr = (internal ?? '').toString().trim();
    const officialStr = (official ?? '').toString().trim();

    if (internalStr === '' && officialStr === '') return null;

    // Interno vazio + oficial preenchido = enriquecimento, não divergência
    if (internalStr === '') {
      return { isDivergent: false, internal: internalStr, official: officialStr };
    }
    // Sem dado oficial não há como comparar
    if (officialStr === '') {
      return { isDivergent: false, internal: internalStr, official: officialStr };
    }

    if (fieldName.toLowerCase() === 'cep') {
      const a = internalStr.replace(/\D/g, '');
      const b = officialStr.replace(/\D/g, '');
      return { isDivergent: a !== b, internal: internalStr, official: officialStr };
    }

    const normA = normalizeForComparison(internalStr);
    const normB = normalizeForComparison(officialStr);
    return { isDivergent: normA !== normB, internal: internalStr, official: officialStr };
  }

  /**
   * Gera a lista de divergências entre cadastro interno e dados oficiais.
   *
   * MUDANÇA v2: o campo CNAE só é comparado quando é COMPARÁVEL —
   * código numérico interno vs `cnae_fiscal` oficial. Comparar texto livre
   * ("Comércio varejista") com a descrição oficial completa divergia em
   * ~100% dos registros na v1, inflando artificialmente as divergências e
   * achatando o score cadastral de toda a base no teto de 60.
   *
   * @param {Object} internalData
   * @param {Object} officialData
   * @returns {Array<{campo_com_divergencia:string, valor_interno:string, valor_oficial:string}>}
   */
  function generateDivergences(internalData, officialData) {
    if (!internalData || !officialData) return [];

    const fieldMap = [
      ['razao_social', 'razao_social', 'razao_social'],
      ['nome_fantasia', 'nome_fantasia', 'nome_fantasia'],
      ['cep', 'cep', 'cep'],
      ['logradouro', 'logradouro', 'logradouro'],
      ['municipio', 'municipio', 'municipio'],
      ['uf', 'uf', 'uf'],
    ];

    const divergences = [];

    for (const [label, intKey, offKey] of fieldMap) {
      const result = compareFields(internalData[intKey], officialData[offKey], label);
      if (result && result.isDivergent) {
        divergences.push({
          campo_com_divergencia: label,
          valor_interno: result.internal,
          valor_oficial: result.official,
        });
      }
    }

    // CNAE: compara apenas código-com-código
    const internalCnaeDigits = String(internalData.cnae ?? '').replace(/\D/g, '');
    const officialCnaeDigits = String(officialData.cnae_fiscal ?? '').replace(/\D/g, '');
    if (internalCnaeDigits.length >= 5 && officialCnaeDigits.length >= 5) {
      const len = Math.min(internalCnaeDigits.length, officialCnaeDigits.length, 7);
      if (internalCnaeDigits.slice(0, len) !== officialCnaeDigits.slice(0, len)) {
        divergences.push({
          campo_com_divergencia: 'cnae',
          valor_interno: String(internalData.cnae),
          valor_oficial: `${officialData.cnae_fiscal} - ${officialData.cnae_fiscal_descricao ?? ''}`,
        });
      }
    }

    return divergences;
  }

  // ═══════════════════════════════════════════════
  // ENGINE DE SCORING Distribuidora v2
  // ═══════════════════════════════════════════════

  /**
   * Detecta o porte de forma robusta contra as variações reais da BrasilAPI
   * ("MICRO EMPRESA", "EMPRESA DE PEQUENO PORTE", "DEMAIS", códigos "01/03/05").
   * A v1 usava `includes('EPP')`, que NUNCA casa com "EMPRESA DE PEQUENO PORTE".
   *
   * @param {Object} officialData
   * @returns {'MEI'|'ME'|'EPP'|'DEMAIS'|'DESCONHECIDO'}
   */
  function detectPorte(officialData) {
    if (officialData?.opcao_pelo_mei === true) return 'MEI';
    const raw = String(officialData?.porte ?? '').toUpperCase().trim();
    if (raw.includes('MICRO')) return 'ME';
    if (raw.includes('PEQUENO') || raw === 'EPP') return 'EPP';
    if (raw.includes('DEMAIS')) return 'DEMAIS';
    if (raw === '01' || raw === '1' || raw === 'ME') return 'ME';
    if (raw === '03' || raw === '3') return 'EPP';
    if (raw === '05' || raw === '5') return 'DEMAIS';
    return 'DESCONHECIDO';
  }

  /**
   * Calcula afinidade (0-100) a partir dos CÓDIGOS CNAE, com fallback por
   * palavra-chave. Primário vale peso cheio; secundários valem 60%.
   * Prefixo mais longo da tabela vence (7 dígitos > 5 > 4 > 2).
   *
   * @param {Object} officialData
   * @returns {{score:number, origem:string}}
   */
  function getCnaeAffinity(officialData) {
    const table = SCORE_CONFIG.cnaeAffinity;

    function lookupCode(code) {
      const digits = String(code ?? '').replace(/\D/g, '');
      if (!digits) return null;
      // tenta prefixos do mais específico ao mais genérico
      for (let len = Math.min(digits.length, 7); len >= 2; len--) {
        const prefix = digits.slice(0, len);
        if (table[prefix] != null) return table[prefix];
      }
      return null;
    }

    function lookupKeywords(desc) {
      const d = normalizeForComparison(String(desc ?? ''));
      if (!d) return null;
      for (const { re, score } of SCORE_CONFIG.cnaeKeywords) {
        if (re.test(d)) return score;
      }
      return null;
    }

    let best = null;
    let origem = 'default';

    // CNAE primário
    const primario =
      lookupCode(officialData?.cnae_fiscal) ??
      lookupKeywords(officialData?.cnae_fiscal_descricao);
    if (primario != null) {
      best = primario;
      origem = 'primario';
    }

    // CNAEs secundários (valem 60%)
    if (Array.isArray(officialData?.cnaes_secundarios)) {
      for (const c of officialData.cnaes_secundarios) {
        const s = lookupCode(c?.codigo) ?? lookupKeywords(c?.descricao);
        if (s != null) {
          const weighted = s * SCORE_CONFIG.cnaeSecundarioFator;
          if (best == null || weighted > best) {
            best = weighted;
            origem = 'secundario';
          }
        }
      }
    }

    return {
      score: Math.round(best != null ? best : SCORE_CONFIG.cnaeAffinityDefault),
      origem,
    };
  }

  /**
   * Engine de Scoring Distribuidora v2.
   *
   * Modelo:
   *   score_oportunidade = gate(situação) × Σ(componente × peso renormalizado)
   *     componentes: recência (45%), afinidade CNAE (35%), porte (20%)
   *   score_higiene = completude do cadastro + consistência (divergências)
   *
   * Decisões de desenho (ver relatório de revisão):
   *  - Recência contínua: 100·e^(-dias/730). Sem efeito-penhasco nos 180/365d.
   *  - Data de última compra AUSENTE ou FUTURA → componente neutro: o peso é
   *    redistribuído entre os demais e o registro recebe flag. Na v1, ausência
   *    valia 0 e ranqueava o cliente ABAIXO de um inativo há 4 anos.
   *  - Situação cadastral é gate multiplicativo, não componente aditivo:
   *    SUSPENSA não soma pontos "compensáveis" por boa recência.
   *  - Divergência cadastral NÃO derruba o score comercial: mudou de endereço
   *    pode significar que cresceu. Vai para o score_higiene.
   *  - INAPTA é tratada à parte: é regularizável (≠ BAIXADA) e vira gancho
   *    de conversa do vendedor.
   *
   * @param {Object} internalData
   * @param {Object} officialData
   * @param {Array} divergences
   * @returns {Object} { totalScore, scoreOportunidade, scoreHigiene, priority,
   *                     classification, action, color, flags, breakdown }
   */
  function calculateVpaScore(internalData, officialData, divergences) {
    const cfg = SCORE_CONFIG;
    const flags = [];

    // ── 1. Recência (contínua) ──────────────────
    let diasInativos = -1;
    let scoreRecencia = null; // null = indisponível (peso será redistribuído)

    // Tenta ultcpr primeiro; cai para datmaicpr (data maior compra) como fallback
    let recenciaDate = parseDateFlexible(internalData?.ultcpr);
    let recenciaFonte = 'ultcpr';
    if (!recenciaDate && internalData?.datmaicpr) {
      recenciaDate = parseDateFlexible(internalData.datmaicpr);
      recenciaFonte = 'datmaicpr';
    }

    if (recenciaDate) {
      const diffMs = Date.now() - recenciaDate.getTime();
      if (diffMs < 0) {
        flags.push('DATA_ULTIMA_COMPRA_FUTURA');
      } else {
        diasInativos = Math.floor(diffMs / 86400000);
        scoreRecencia = Math.round(100 * Math.exp(-diasInativos / cfg.recenciaTauDias));
        if (recenciaFonte === 'datmaicpr') flags.push('RECENCIA_POR_DATA_MAIOR_COMPRA');
      }
    } else if (internalData?.ultcpr || internalData?.datmaicpr) {
      flags.push('DATA_ULTIMA_COMPRA_ILEGIVEL');
    } else {
      flags.push('SEM_DATA_ULTIMA_COMPRA');
    }

    // ── 2. Porte (calibrado p/ ICP pequeno varejo) ──
    const porte = detectPorte(officialData);
    let scorePorte = cfg.porte[porte] ?? cfg.porte.DESCONHECIDO;

    // Bônus de tração: empresa jovem com capital relevante
    const capital = parseFloat(officialData?.capital_social) || 0;
    const inicio = parseDateFlexible(officialData?.data_inicio_atividade);
    if (inicio) {
      const idadeAnos = (Date.now() - inicio.getTime()) / (365.25 * 86400000);
      if (idadeAnos <= cfg.tracao.idadeMaxAnos && capital >= cfg.tracao.capitalMinimo) {
        scorePorte = Math.min(100, scorePorte + cfg.tracao.bonus);
        flags.push('TRACAO_EMPRESA_JOVEM_CAPITALIZADA');
      }
    }

    // ── 3. Afinidade por código CNAE ────────────
    const afinidade = getCnaeAffinity(officialData);
    const scoreAfinidade = afinidade.score;

    // ── 4. Soma ponderada com redistribuição ────
    const components = [
      { score: scoreRecencia, weight: cfg.weights.recencia },
      { score: scoreAfinidade, weight: cfg.weights.afinidade },
      { score: scorePorte, weight: cfg.weights.porte },
    ];
    const available = components.filter((c) => c.score != null);
    const weightSum = available.reduce((s, c) => s + c.weight, 0) || 1;
    let baseScore = available.reduce(
      (s, c) => s + c.score * (c.weight / weightSum),
      0
    );

    // Desconto de confiança: registro sem recência conhecida não deve
    // ultrapassar registro completo equivalente no ranking.
    if (scoreRecencia == null) {
      baseScore *= cfg.descontoDadoRecenciaAusente;
    }

    // ── 5. Gate por situação cadastral ──────────
    const situacao = String(
      officialData?.descricao_situacao_cadastral ?? ''
    ).toUpperCase().trim();
    const gateKey = ['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA'].includes(situacao)
      ? situacao
      : 'DESCONHECIDA';
    const gate = cfg.gateSituacao[gateKey];

    const scoreOportunidade = Math.round(baseScore * gate);

    // ── 6. Score de Higiene Cadastral (separado) ──
    const h = cfg.higiene;
    let completude = 0;
    if (officialData?.ddd_telefone_1) completude += h.pontosTelefone;
    if (officialData?.email) completude += h.pontosEmail;
    if (officialData?.logradouro) completude += h.pontosEndereco;
    if (Array.isArray(officialData?.qsa) && officialData.qsa.length > 0) {
      completude += h.pontosQsa;
    }
    const numDiv = Array.isArray(divergences) ? divergences.length : 0;
    const consistencia = Math.max(
      0,
      h.baseConsistencia - numDiv * h.penalidadePorDivergencia
    );
    const scoreHigiene = Math.round(completude + consistencia);

    // ── 7. Classificação e ação ─────────────────
    // Prioridade comercial e ação administrativa são campos SEPARADOS:
    // na v1, BAIXADA recebia priority 'ALTA' e poluía o topo da ordenação
    // do vendedor junto com as oportunidades quentes.
    let classification, priority, action, color;
    let acaoAdministrativa = null;

    // Ângulo de abordagem contextualizado por segmento CNAE
    const cnaeDesc = String(officialData?.cnae_fiscal_descricao ?? '').toUpperCase();
    let segmento = 'geral';
    if (/PAPELARIA/.test(cnaeDesc)) segmento = 'papelaria';
    else if (/LIVRAR|LIVROS/.test(cnaeDesc)) segmento = 'livraria';
    else if (/ESCOLA|ENSINO|EDUCA/.test(cnaeDesc)) segmento = 'educacao';
    else if (/GR[AÁ]FICA|IMPRESS/.test(cnaeDesc)) segmento = 'grafica';
    else if (/ESCRIT[OÓ]RIO/.test(cnaeDesc)) segmento = 'escritorio';
    else if (/ARMARINHO/.test(cnaeDesc)) segmento = 'armarinho';

    const anglesMap = {
      papelaria:   'reposição de papelaria (cadernos, lápis, canetas)',
      livraria:    'mix papelaria + materiais educativos',
      educacao:    'kit material escolar e suprimentos para secretaria',
      grafica:     'papel offset, A4 e insumos gráficos',
      escritorio:  'papelaria corporativa e materiais de escritório',
      armarinho:   'linha de armarinho e correlatos da casa',
      geral:       'portfólio completo (papelaria, escritório, educacional)',
    };
    const angle = anglesMap[segmento];
    const recStr = diasInativos >= 0
      ? `cliente inativo há ${diasInativos} dias`
      : 'sem histórico de compra registrado';

    if (gateKey === 'BAIXADA' || gateKey === 'NULA') {
      classification = '🔴 DESCARTE / ARQUIVO';
      priority = 'DESCARTE';
      action = 'Arquivar. Cruzar QSA: sócio pode ter reaberto em novo CNPJ.';
      acaoAdministrativa = `BLOQUEAR CADASTRO — Empresa ${gateKey}`;
      color = 'red';
    } else if (gateKey === 'INAPTA') {
      classification = '🟣 INAPTA — REGULARIZÁVEL';
      priority = 'BAIXA';
      action = `Situação regularizável (RF). Gancho comercial: informar a pendência cadastral e oferecer suporte — retomar fornecimento de ${angle} após regularização. Não faturar até normalização.`;
      acaoAdministrativa = 'SUSPENDER FATURAMENTO até regularização';
      color = 'purple';
    } else if (gateKey === 'SUSPENSA') {
      classification = '🟠 SUSPENSA — MONITORAR';
      priority = 'BAIXA';
      action = 'Não abordar. Monitorar retorno à situação ATIVA.';
      acaoAdministrativa = 'SUSPENDER FATURAMENTO até regularização';
      color = 'orange';
    } else if (scoreOportunidade >= cfg.thresholds.quente) {
      classification = '🟢 OPORTUNIDADE QUENTE';
      priority = 'ALTA';
      action = `Ligação direta nas próximas 48h. Ângulo: ${angle}. ${recStr.charAt(0).toUpperCase() + recStr.slice(1)}.`;
      color = 'green';
    } else if (scoreOportunidade >= cfg.thresholds.alto) {
      classification = '🔵 POTENCIAL ALTO';
      priority = 'MEDIA';
      action = `SDR: WhatsApp + catálogo digital. Destaque: ${angle}. ${recStr.charAt(0).toUpperCase() + recStr.slice(1)}.`;
      color = 'blue';
    } else if (scoreOportunidade >= cfg.thresholds.moderado) {
      classification = '🟡 POTENCIAL MODERADO';
      priority = 'MEDIA';
      action = `Cadência de e-mail 30/60/90 dias. Tema: ${angle}.`;
      color = 'yellow';
    } else {
      classification = '⚪ BAIXA PRIORIDADE';
      priority = 'BAIXA';
      action = `Nutrição de longo prazo. Reavaliar no próximo ciclo.`;
      color = 'gray';
    }

    if (scoreHigiene < 50 && gateKey === 'ATIVA') {
      action += ' [Higienizar cadastro antes do contato]';
    }

    return {
      // Compatibilidade: totalScore continua existindo (= oportunidade)
      totalScore: scoreOportunidade,
      scoreOportunidade,
      scoreHigiene,
      priority,
      classification,
      action,
      acaoAdministrativa,
      color,
      flags,
      breakdown: {
        diasInativos,
        scoreRecencia: scoreRecencia ?? 'N/D',
        recenciaFonte: recenciaFonte,
        scorePorte,
        porteDetectado: porte,
        scoreAfinidade,
        afinidadeOrigem: afinidade.origem,
        situacao: gateKey,
        gate,
        completudeCadastro: completude,
        consistenciaCadastro: consistencia,
        numDivergencias: numDiv,
      },
    };
  }

  // ═══════════════════════════════════════════════
  // Compatibilidade v1 (corrige o ReferenceError do export)
  // ═══════════════════════════════════════════════

  /**
   * Wrapper de compatibilidade — a v1 exportava esta função sem defini-la,
   * o que lançava ReferenceError e quebrava o módulo inteiro no load.
   * @param {Object} internalData
   * @param {Object} officialData
   * @param {Array} [divergences]
   * @returns {string} 'ALTA' | 'MEDIA' | 'BAIXA' | 'DESCARTE'
   */
  function determinePriority(internalData, officialData, divergences) {
    const div = divergences ?? generateDivergences(internalData, officialData);
    return calculateVpaScore(internalData, officialData, div).priority;
  }

  /**
   * Wrapper de compatibilidade (idem acima).
   * @param {Object} internalData
   * @param {Object} officialData
   * @param {Array} [divergences]
   * @returns {string} Ação recomendada.
   */
  function determineAction(internalData, officialData, divergences) {
    const div = divergences ?? generateDivergences(internalData, officialData);
    return calculateVpaScore(internalData, officialData, div).action;
  }

  // ═══════════════════════════════════════════════
  // Resultado de auditoria
  // ═══════════════════════════════════════════════

  /**
   * Monta o resultado de auditoria completo de um cliente.
   * @param {Object} internalData
   * @param {Object} officialData
   * @returns {Object}
   */
  function generateAuditResult(internalData, officialData) {
    const divergences = generateDivergences(internalData, officialData);
    const vpa = calculateVpaScore(internalData, officialData, divergences);

    const situacao = String(
      officialData?.descricao_situacao_cadastral ?? ''
    ).toUpperCase();
    const cadastroValido = situacao === 'ATIVA' && divergences.length === 0;

    return {
      cnpj_analisado: formatCNPJ(cleanCNPJ(internalData?.cnpj ?? '')),
      vendedor: internalData?.vendedor ?? '',
      codigo_cliente: internalData?.codigo ?? '',
      status_receita: officialData?.descricao_situacao_cadastral ?? 'N/A',
      cadastro_valido: cadastroValido,
      divergencias: divergences,
      num_divergencias: divergences.length,
      prioridade_geral: vpa.priority,
      acao_recomendada: vpa.action,
      acao_administrativa: vpa.acaoAdministrativa,
      classificacao: vpa.classification,
      // score_vpa mantido como alias do score de oportunidade (compat v1)
      score_vpa: vpa.totalScore,
      score_oportunidade: vpa.scoreOportunidade,
      score_higiene: vpa.scoreHigiene,
      score_flags: vpa.flags,
      score_breakdown: vpa.breakdown,
      dados_completos_receita: officialData,
      inteligencia_web: null, // populado por api.js
      data_consulta: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════
  // Reconstrução a partir do XLSX exportado (round-trip Excel)
  // ═══════════════════════════════════════════════

  /** "R$ 1.234,56" | "1234.56" | 1234 → Number (0 se vazio/ilegível). */
  function parseBRNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    let s = String(value ?? '').replace(/[^\d,.-]/g, '').trim();
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); // pt-BR
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /** "Sim"/"Não"/"N/D" → true/false/null. */
  function parseSimNao(value) {
    const s = String(value ?? '').trim().toUpperCase();
    if (s === 'SIM') return true;
    if (s === 'NÃO' || s === 'NAO') return false;
    return null;
  }

  /** "NOME (QUALIFICAÇÃO); NOME2 (QUAL2)" → [{nome_socio, qualificacao_socio}]. */
  function parseQsaString(value) {
    const s = String(value ?? '').trim();
    if (!s) return [];
    return s
      .split(';')
      .map((part) => {
        const m = part.trim().match(/^(.*?)\s*\(([^)]*)\)\s*$/);
        return m
          ? { nome_socio: m[1].trim(), qualificacao_socio: m[2].trim() }
          : { nome_socio: part.trim(), qualificacao_socio: '' };
      })
      .filter((x) => x.nome_socio);
  }

  /** "1234 - desc; 5678 - desc2" → [{codigo, descricao}]. */
  function parseCnaesString(value) {
    const s = String(value ?? '').trim();
    if (!s) return [];
    return s
      .split(';')
      .map((part) => {
        const idx = part.indexOf(' - ');
        return idx >= 0
          ? { codigo: part.slice(0, idx).trim(), descricao: part.slice(idx + 3).trim() }
          : { codigo: part.trim(), descricao: '' };
      })
      .filter((c) => c.codigo);
  }

  /**
   * Reconstrói `{ client, official, status, error }` a partir de uma linha da
   * aba "Carteira" do XLSX exportado (objeto cujas chaves são os cabeçalhos
   * exportados). As métricas derivadas (scores, divergências, ação) NÃO são
   * lidas da planilha — devem ser recalculadas pelo chamador via
   * {@link generateAuditResult}(client, official), garantindo consistência
   * mesmo quando o usuário edita dados diretamente no Excel.
   *
   * @param {Object} row
   * @returns {{client:Object, official:(Object|null), status:string, error:string}}
   */
  function parseCarteiraRow(row) {
    const get = (k) => (row && row[k] != null ? String(row[k]).trim() : '');

    let cnpj = cleanCNPJ(get('CNPJ'));
    if (cnpj.length > 0 && cnpj.length < 14) cnpj = cnpj.padStart(14, '0');

    const client = {
      cnpj,
      razao_social: get('Razão Social (Interno)'),
      nome_fantasia: get('Nome Fantasia (Interno)'),
      cep: get('CEP (Interno)'),
      logradouro: get('Endereço (Interno)'),
      municipio: get('Município (Interno)'),
      uf: get('UF (Interno)'),
      cnae: get('CNAE (Interno)'),
      vendedor: get('Vendedor Responsável'),
      codigo: get('Código Cliente'),
      ultcpr: get('Última Compra (ultcpr)'),
      datmaicpr: get('Data Maior Compra (datmaicpr)'),
    };

    const situacao = get('Situação Cadastral (RFB)');
    const razaoRfb = get('Razão Social (Receita Federal)');
    const temRfb = !!(situacao || razaoRfb);

    const official = temRfb
      ? {
          razao_social: razaoRfb,
          nome_fantasia: get('Nome Fantasia (Receita Federal)'),
          descricao_situacao_cadastral: situacao,
          data_situacao_cadastral: get('Data Situação Cadastral'),
          descricao_motivo_situacao_cadastral: get('Motivo Situação Cadastral'),
          capital_social: parseBRNumber(get('Capital Social')),
          data_inicio_atividade: get('Data Abertura'),
          porte: get('Porte (RFB)'),
          cnae_fiscal: get('CNAE Principal Código'),
          cnae_fiscal_descricao: get('CNAE Principal Descrição'),
          opcao_pelo_simples: parseSimNao(get('Simples Nacional')),
          opcao_pelo_mei: parseSimNao(get('MEI')),
          cep: get('CEP (RFB)'),
          logradouro: get('Endereço (RFB)'),
          bairro: get('Bairro (RFB)'),
          municipio: get('Município (RFB)'),
          uf: get('UF (RFB)'),
          ddd_telefone_1: get('Telefone 1'),
          ddd_telefone_2: get('Telefone 2'),
          email: get('E-mail'),
          qsa: parseQsaString(get('Quadro Societário (QSA)')),
          cnaes_secundarios: parseCnaesString(get('CNAEs Secundários')),
        }
      : null;

    return { client, official, status: get('Status Processamento'), error: get('Erro de API') };
  }

  // ═══════════════════════════════════════════════
  // Exportações (CSV / XLSX / JSON)
  // ═══════════════════════════════════════════════

  /**
   * Escapa valor para CSV.
   * @param {*} value
   * @returns {string}
   */
  function escapeCSVField(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Converte resultados de auditoria em CSV (UTF-8 com BOM para Excel).
   * @param {Array<Object>} results
   * @returns {string}
   */
  function exportToCSV(results) {
    if (!Array.isArray(results) || results.length === 0) return '';

    const headers = [
      'cnpj_analisado',
      'vendedor_responsavel',
      'codigo_cliente',
      'status_receita',
      'classificacao',
      'prioridade_geral',
      'score_oportunidade',
      'score_higiene',
      'dias_inativos',
      'score_recencia',
      'score_porte',
      'porte_detectado',
      'score_afinidade',
      'flags_qualidade',
      'cadastro_valido',
      'num_divergencias',
      'divergencias_resumo',
      'acao_recomendada',
      'acao_administrativa',
      'data_consulta',
      // Web intelligence
      'web_operacao_ativa',
      'web_link_principal',
      'web_resumo_atuacao',
      // Dados oficiais — identificação
      'razao_social',
      'nome_fantasia',
      'natureza_juridica',
      'porte',
      'capital_social',
      'data_inicio_atividade',
      // Situação
      'situacao_cadastral',
      'data_situacao_cadastral',
      'motivo_situacao_cadastral',
      'situacao_especial',
      'data_situacao_especial',
      // Endereço
      'cep',
      'logradouro',
      'numero',
      'complemento',
      'bairro',
      'municipio',
      'uf',
      // Contato
      'ddd_telefone_1',
      'ddd_telefone_2',
      'ddd_fax',
      'email',
      // CNAE
      'cnae_fiscal',
      'cnae_fiscal_descricao',
      'cnaes_secundarios',
      // Tributário
      'opcao_pelo_simples',
      'data_opcao_pelo_simples',
      'data_exclusao_do_simples',
      'opcao_pelo_mei',
      'data_opcao_pelo_mei',
      'data_exclusao_do_mei',
      'ente_federativo_responsavel',
      'qsa_socios',
    ];

    const rows = results.map((r) => {
      const rec = r.dados_completos_receita || {};
      const web = r.inteligencia_web || {};
      const bd = r.score_breakdown || {};

      const divergenciasResumo = Array.isArray(r.divergencias)
        ? r.divergencias.map((d) => d.campo_com_divergencia).join('; ')
        : '';

      let qsaStr = '';
      if (Array.isArray(rec.qsa) && rec.qsa.length > 0) {
        qsaStr = rec.qsa
          .map((s) => `${s.nome_socio || s.nome || ''} (${s.qualificacao_socio || s.qual || ''})`)
          .join('; ');
      }

      let cnaesSecStr = '';
      if (Array.isArray(rec.cnaes_secundarios) && rec.cnaes_secundarios.length > 0) {
        cnaesSecStr = rec.cnaes_secundarios
          .map((c) => `${c.codigo || ''} - ${c.descricao || ''}`)
          .join('; ');
      }

      const values = [
        r.cnpj_analisado ?? '',
        r.vendedor ?? '',
        r.codigo_cliente ?? '',
        r.status_receita ?? '',
        r.classificacao ?? '',
        r.prioridade_geral ?? '',
        r.score_oportunidade ?? r.score_vpa ?? '',
        r.score_higiene ?? '',
        bd.diasInativos ?? '',
        bd.scoreRecencia ?? '',
        bd.scorePorte ?? '',
        bd.porteDetectado ?? '',
        bd.scoreAfinidade ?? '',
        Array.isArray(r.score_flags) ? r.score_flags.join('; ') : '',
        r.cadastro_valido ? 'SIM' : 'NÃO',
        r.num_divergencias ?? 0,
        divergenciasResumo,
        r.acao_recomendada ?? '',
        r.acao_administrativa ?? '',
        r.data_consulta ?? '',
        web.indicios_de_operacao_ativa ? 'SIM' : 'NÃO',
        web.link_principal_encontrado ?? '',
        web.resumo_da_atuacao ?? '',
        rec.razao_social ?? '',
        rec.nome_fantasia ?? '',
        rec.natureza_juridica ?? '',
        rec.porte ?? '',
        rec.capital_social != null ? formatCurrency(rec.capital_social) : '',
        rec.data_inicio_atividade ?? '',
        rec.descricao_situacao_cadastral ?? '',
        rec.data_situacao_cadastral ?? '',
        rec.motivo_situacao_cadastral ?? '',
        rec.situacao_especial ?? '',
        rec.data_situacao_especial ?? '',
        rec.cep ?? '',
        rec.logradouro ?? '',
        rec.numero ?? '',
        rec.complemento ?? '',
        rec.bairro ?? '',
        rec.municipio ?? '',
        rec.uf ?? '',
        rec.ddd_telefone_1 ?? '',
        rec.ddd_telefone_2 ?? '',
        rec.ddd_fax ?? '',
        rec.email ?? '',
        rec.cnae_fiscal ?? '',
        rec.cnae_fiscal_descricao ?? '',
        cnaesSecStr,
        rec.opcao_pelo_simples != null ? (rec.opcao_pelo_simples ? 'SIM' : 'NÃO') : '',
        rec.data_opcao_pelo_simples ?? '',
        rec.data_exclusao_do_simples ?? '',
        rec.opcao_pelo_mei != null ? (rec.opcao_pelo_mei ? 'SIM' : 'NÃO') : '',
        rec.data_opcao_pelo_mei ?? '',
        rec.data_exclusao_do_mei ?? '',
        rec.ente_federativo_responsavel ?? '',
        qsaStr,
      ];

      return values.map(escapeCSVField).join(',');
    });

    return '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  }

  /**
   * Dispara download de um Blob.
   * @param {Blob} blob
   * @param {string} filename
   */
  function downloadBlob(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('downloadBlob: falha ao disparar download.', err);
    }
  }

  /**
   * Download de string CSV como arquivo.
   * @param {string} csvString
   * @param {string} [filename]
   */
  function downloadCSV(csvString, filename = 'auditoria_cnpj.csv') {
    if (typeof csvString !== 'string' || csvString.length === 0) {
      console.warn('downloadCSV: nada para baixar.');
      return;
    }
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
  }

  /**
   * Exporta resultados para XLSX via SheetJS.
   *
   * CORRIGIDO v2: a v1 lia campos inexistentes (r.cnpj, r.score, r.prioridade,
   * r.internalData…) e gerava planilha de colunas vazias. Agora usa o schema
   * real de generateAuditResult.
   *
   * @param {Array<Object>} results
   * @param {string} [filename]
   */
  function exportToXLSX(clients, results, filename = 'auditoria_cnpj.xlsx') {
    console.log('[AuditBase] Executando exportação multifolhas XLSX (v1.6)...');
    if (!window.XLSX) {
      console.error('SheetJS (XLSX) não está carregado.');
      return;
    }
    if (!Array.isArray(clients) || clients.length === 0) {
      console.warn('exportToXLSX: nada para exportar.');
      return;
    }

    const ins = window.Insights ? window.Insights.computeInsights(results) : null;
    const workbook = XLSX.utils.book_new();

    // ─────────────────────────────────────────────────────────
    // 1. ABA: VISÃO GERAL
    // ─────────────────────────────────────────────────────────
    const wsOverview = XLSX.utils.aoa_to_sheet([["DASHBOARD ANALÍTICO — VISÃO GERAL"]]);
    let overviewRow = 3;

    function addTableToSheet(ws, title, headers, rows, startRow) {
      XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: `A${startRow}` });
      XLSX.utils.sheet_add_aoa(ws, [headers], { origin: `A${startRow + 1}` });
      XLSX.utils.sheet_add_aoa(ws, rows, { origin: `A${startRow + 2}` });
      return startRow + 2 + rows.length + 2; // return next start row with 2 empty rows gap
    }

    if (ins) {
      // KPIs Gerais
      const kpis = [
        ["Total de Clientes na Base", ins.totalValidos],
        ["Receita Potencial (Carteira Ativa Priorizada)", ins.capital.potencialAtivo],
        ["Receita Quente (Prioridade Alta)", ins.capital.quenteAlto],
        ["Capital em Risco (CNPJs Inativos)", ins.capital.emRiscoInativo],
        ["Grupos Societários / Econômicos", ins.socios.totalGrupos],
        ["Prováveis Reaberturas", ins.socios.reabertas.length],
        ["Sinais Comerciais / Oportunidades Dormentes", ins.anomalias.dormentes.length]
      ];
      overviewRow = addTableToSheet(wsOverview, "KPIs da Carteira", ["Métrica", "Valor"], kpis, overviewRow);

      // Distribuição por Situação Cadastral
      const sit = ins.distributions.situacao.map(d => [d.label, d.value]);
      overviewRow = addTableToSheet(wsOverview, "Distribuição por Situação Cadastral (RFB)", ["Situação", "Quantidade"], sit, overviewRow);

      // Distribuição por Prioridade Comercial
      const prio = ins.distributions.prioridade.map(d => [d.label, d.value]);
      overviewRow = addTableToSheet(wsOverview, "Distribuição por Prioridade de Abordagem", ["Prioridade", "Quantidade"], prio, overviewRow);

      // Distribuição por Regime Tributário
      const reg = ins.distributions.regime.map(d => [d.label, d.value]);
      overviewRow = addTableToSheet(wsOverview, "Distribuição por Regime Tributário", ["Regime", "Quantidade"], reg, overviewRow);

      // Cohorts de Inatividade
      const coh = Object.entries(ins.cohorts).map(([k, v]) => [k, v]);
      overviewRow = addTableToSheet(wsOverview, "Cohorts de Inatividade Comercial", ["Faixa de Tempo Sem Compra", "Clientes"], coh, overviewRow);

      // Distribuição por Porte
      const port = ins.distributions.porte.map(d => [d.label, d.value]);
      overviewRow = addTableToSheet(wsOverview, "Distribuição por Porte de Empresa", ["Porte", "Quantidade"], port, overviewRow);

      // Distribuição Geográfica (UF)
      const ufs = ins.geografia.uf.map(d => [d.label, d.value]);
      overviewRow = addTableToSheet(wsOverview, "Distribuição Geográfica (UF)", ["UF", "Quantidade"], ufs, overviewRow);
    } else {
      XLSX.utils.sheet_add_aoa(wsOverview, [["Sem dados analíticos de insights disponíveis"]], { origin: "A3" });
    }
    XLSX.utils.book_append_sheet(workbook, wsOverview, "Visão Geral");

    // ─────────────────────────────────────────────────────────
    // 2. ABA: CARTEIRA
    // ─────────────────────────────────────────────────────────
    const flatPortfolio = clients.map((c, idx) => {
      const res = results[idx] || null;
      const a = res?.auditResult || null;
      const rec = a?.dados_completos_receita || {};
      const bd = a?.score_breakdown || {};
      const web = a?.inteligencia_web || {};

      const fmtBool = (val) => {
        if (val === true) return 'Sim';
        if (val === false) return 'Não';
        return 'N/D';
      };

      const qsaList = Array.isArray(rec.qsa)
        ? rec.qsa.map(s => `${s.nome_socio || s.nome || ''} (${s.qualificacao_socio || ''})`).join('; ')
        : '';

      const cnaesSec = Array.isArray(rec.cnaes_secundarios)
        ? rec.cnaes_secundarios.map(s => `${s.codigo} - ${s.descricao}`).join('; ')
        : '';

      return {
        "CNPJ": c.cnpj || a?.cnpj_analisado || '',
        "Razão Social (Interno)": c.razao_social || '',
        "Nome Fantasia (Interno)": c.nome_fantasia || '',
        "Razão Social (Receita Federal)": rec.razao_social || '',
        "Nome Fantasia (Receita Federal)": rec.nome_fantasia || '',
        "Vendedor Responsável": c.vendedor || a?.vendedor || '',
        "Código Cliente": c.codigo || '',
        "Última Compra (ultcpr)": c.ultcpr || '',
        "Data Maior Compra (datmaicpr)": c.datmaicpr || '',
        "CEP (Interno)": c.cep || '',
        "Endereço (Interno)": c.logradouro || '',
        "Município (Interno)": c.municipio || '',
        "UF (Interno)": c.uf || '',
        "CNAE (Interno)": c.cnae || '',
        "Status Processamento": res?.status || 'pending',
        "Erro de API": res?.error || '',
        "Prioridade de Contato": res?.priority || '',
        "Score Oportunidade": a?.score_oportunidade ?? a?.score_vpa ?? '',
        "Score Higiene": a?.score_higiene ?? '',
        "Ação Recomendada": a?.acao_recomendada || '',
        "Ação Administrativa": a?.acao_administrativa || '',
        "Divergências Cadastrais": Array.isArray(a?.divergencias)
          ? a.divergencias.map(d => `${d.campo_com_divergencia} (Interno: ${d.valor_interno} / Oficial: ${d.valor_oficial})`).join(', ')
          : '',
        "Situação Cadastral (RFB)": rec.descricao_situacao_cadastral || '',
        "Data Situação Cadastral": rec.data_situacao_cadastral || '',
        "Motivo Situação Cadastral": rec.descricao_motivo_situacao_cadastral || '',
        "Capital Social": rec.capital_social || '',
        "Porte (RFB)": rec.porte || '',
        "Data Abertura": rec.data_inicio_atividade || '',
        "CNAE Principal Código": rec.cnae_fiscal || '',
        "CNAE Principal Descrição": rec.cnae_fiscal_descricao || '',
        "Simples Nacional": fmtBool(rec.opcao_pelo_simples),
        "MEI": fmtBool(rec.opcao_pelo_mei),
        "CEP (RFB)": rec.cep || '',
        "Endereço (RFB)": [rec.logradouro, rec.numero].filter(Boolean).join(', '),
        "Bairro (RFB)": rec.bairro || '',
        "Município (RFB)": rec.municipio || '',
        "UF (RFB)": rec.uf || '',
        "Telefone 1": rec.ddd_telefone_1 || '',
        "Telefone 2": rec.ddd_telefone_2 || '',
        "E-mail": rec.email || '',
        "Quadro Societário (QSA)": qsaList,
        "CNAEs Secundários": cnaesSec,
        "Indícios de Atividade (Web)": fmtBool(web.indicios_de_operacao_ativa),
        "Link Principal Inteligência Web": web.link_principal_encontrado || '',
        "Resumo Inteligência Web": web.resumo_da_atuacao || ''
      };
    });

    const wsPortfolio = XLSX.utils.json_to_sheet(flatPortfolio);
    XLSX.utils.book_append_sheet(workbook, wsPortfolio, "Carteira");

    // ─────────────────────────────────────────────────────────
    // 3. ABA: INTELIGÊNCIA
    // ─────────────────────────────────────────────────────────
    const wsIntel = XLSX.utils.aoa_to_sheet([["INFERÊNCIAS E INTELIGÊNCIA DE CARTEIRA"]]);
    let intelRow = 3;

    if (ins) {
      // Scorecard de Vendedores
      const vendRows = ins.vendedores.map(v => [
        v.vendedor, v.total, v.ativos, `${v.pctAtivo}%`, v.quentes, v.scoreMedio, v.divergencias, v.capital
      ]);
      intelRow = addTableToSheet(
        wsIntel,
        "Scorecard por Vendedor",
        ["Vendedor", "Total Clientes", "Clientes Ativos", "% Ativos", "Clientes Quentes (Alta Prio)", "Score Médio Oportunidade", "Qtd Divergências", "Capital sob Gestão"],
        vendRows,
        intelRow
      );

      // Empresas Reabertas
      const reabRows = [];
      for (const r of ins.socios.reabertas) {
        r.inativas.forEach(inact => {
          r.ativas.forEach(act => {
            reabRows.push([
              r.socio, inact.cnpj, inact.razao, inact.situacao, act.cnpj, act.razao, act.score, act.vendedor
            ]);
          });
        });
      }
      intelRow = addTableToSheet(
        wsIntel,
        "Empresas Reabertas (Sócio ativo + inativo em carteira)",
        ["Sócio", "CNPJ Inativo", "Razão Inativa", "Situação Inativa", "CNPJ Ativo", "Razão Ativa", "Score Oportunidade CNPJ Ativo", "Vendedor Responsável"],
        reabRows,
        intelRow
      );

      // Grupos Econômicos
      const grupoRows = ins.socios.grupos.map(g => [
        g.socio,
        g.qtde,
        g.ativas,
        g.empresas.map(e => `${e.cnpj} (${e.razao} - ${e.situacao})`).join('; ')
      ]);
      intelRow = addTableToSheet(
        wsIntel,
        "Grupos Econômicos (Sócios comuns)",
        ["Sócio", "Quantidade CNPJs no Grupo", "Quantidade Ativos", "CNPJs Integrantes e Status"],
        grupoRows,
        intelRow
      );

      // Redes Matriz/Filial
      const redeRows = ins.redes.map(r => [
        r.raiz,
        r.razao,
        r.unidades,
        r.ativas,
        r.estabelecimentos.map(e => `${e.cnpj} (${e.matriz ? 'Matriz' : 'Filial'} - ${e.ativo ? 'Ativa' : 'Inativa'})`).join('; ')
      ]);
      intelRow = addTableToSheet(
        wsIntel,
        "Redes Matriz/Filial (Mesma raiz de CNPJ)",
        ["Raiz CNPJ (8d)", "Razão Principal", "Total Unidades", "Unidades Ativas", "Estabelecimentos da Rede"],
        redeRows,
        intelRow
      );

      // Sinais Acionáveis - Dormentes
      const dormRows = ins.anomalias.dormentes.map(x => [x.cnpj, x.razao, x.dias, x.afinidade, x.vendedor]);
      intelRow = addTableToSheet(
        wsIntel,
        "Sinais Comerciais — Oportunidades Dormentes (Ativas + boa afinidade/porte + sem compra há 1 ano+)",
        ["CNPJ", "Razão Social", "Dias Inativo", "Afinidade CNAE", "Vendedor"],
        dormRows,
        intelRow
      );

      // Sinais Acionáveis - Reativadas
      const reativRows = ins.anomalias.recemReativadas.map(x => [x.cnpj, x.razao, x.diasSituacao, x.vendedor]);
      intelRow = addTableToSheet(
        wsIntel,
        "Sinais Comerciais — Recém-Reativadas na RFB (Situação ativa nos últimos 12 meses)",
        ["CNPJ", "Razão Social", "Dias Desde Reativação", "Vendedor"],
        reativRows,
        intelRow
      );

      // Sinais Acionáveis - Sem Contato
      const semContRows = ins.anomalias.semContato.map(x => [x.cnpj, x.razao, x.score, x.vendedor]);
      intelRow = addTableToSheet(
        wsIntel,
        "Sinais Comerciais — Bom score, sem canais de contato cadastrados na RFB",
        ["CNPJ", "Razão Social", "Score Oportunidade", "Vendedor"],
        semContRows,
        intelRow
      );

      // Sinais Acionáveis - Grandes Inativas
      const grInatRows = ins.anomalias.grandesInativas.map(x => [x.cnpj, x.razao, x.situacao, x.capital]);
      intelRow = addTableToSheet(
        wsIntel,
        "Sinais Comerciais — Alto Capital Social preso em empresa inativa",
        ["CNPJ", "Razão Social", "Situação Cadastral", "Capital Social"],
        grInatRows,
        intelRow
      );
    } else {
      XLSX.utils.sheet_add_aoa(wsIntel, [["Sem dados de inteligência disponíveis"]], { origin: "A3" });
    }
    XLSX.utils.book_append_sheet(workbook, wsIntel, "Inteligência");

    // ─────────────────────────────────────────────────────────
    // 4. ABA: PLANO DE AÇÃO
    // ─────────────────────────────────────────────────────────
    const wsPlano = XLSX.utils.aoa_to_sheet([["PLANO DE AÇÃO COMERCIAL — FILAS DE CONTATO"]]);
    let planoRow = 3;

    if (ins) {
      // Fila Comercial Principal (Ativas)
      const filaRows = ins.planoAcao.fila.map(x => {
        const idx = clients.findIndex(c => c.cnpj === x.cnpj);
        const res = idx >= 0 ? results[idx] : null;
        const email = res?.auditResult?.dados_completos_receita?.email || '';
        const acaoAdmin = res?.auditResult?.acao_administrativa || '';
        return [
          x.prioridade, x.cnpj, x.razao, x.socio, x.vendedor, x.score, x.higiene, x.telefone, email, x.acao, acaoAdmin
        ];
      });
      planoRow = addTableToSheet(
        wsPlano,
        "Fila Comercial Principal (Empresas Ativas ordenadas por prioridade e score)",
        ["Prioridade", "CNPJ", "Razão Social", "Sócio Principal / Responsável", "Vendedor", "Score Oportunidade", "Score Higiene", "Telefone", "E-mail", "Ação Comercial Recomendada", "Ação Administrativa"],
        filaRows,
        planoRow
      );

      // Fila Secundária (Inaptas)
      const inaptRows = ins.planoAcao.inaptas.map(x => {
        const idx = clients.findIndex(c => c.cnpj === x.cnpj);
        const res = idx >= 0 ? results[idx] : null;
        const email = res?.auditResult?.dados_completos_receita?.email || '';
        return [
          x.cnpj, x.razao, x.socio, x.vendedor, x.score, x.higiene, x.telefone, email, x.acao
        ];
      });
      planoRow = addTableToSheet(
        wsPlano,
        "Gancho Comercial de Regularização (Empresas Inaptas na RFB)",
        ["CNPJ", "Razão Social", "Sócio Principal / Responsável", "Vendedor", "Score Oportunidade", "Score Higiene", "Telefone", "E-mail", "Abordagem Gancho Comercial"],
        inaptRows,
        planoRow
      );
    } else {
      XLSX.utils.sheet_add_aoa(wsPlano, [["Sem dados de plano de ação comercial disponíveis"]], { origin: "A3" });
    }
    XLSX.utils.book_append_sheet(workbook, wsPlano, "Plano de Ação");

    XLSX.writeFile(workbook, filename);
  }

  /**
   * Exporta estado completo como JSON.
   * @param {Object} data
   * @param {string} [filename]
   */
  function exportToJSON(data, filename = 'auditoria_state.json') {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    downloadBlob(blob, filename);
  }

  /**
   * Gera e baixa o CSV template de importação.
   */
  function downloadTemplateCSV() {
    const headers = [
      'cnpj',
      'razao_social',
      'nome_fantasia',
      'cep',
      'logradouro',
      'municipio',
      'uf',
      'cnae',
      'ultcpr',
      'vendedor',
      'codigo',
    ];

    const exampleRows = [
      [
        '00.000.000/0001-91',
        'EMPRESA EXEMPLO LTDA',
        'EXEMPLO',
        '01001-000',
        'Rua Exemplo, 123',
        'São Paulo',
        'SP',
        '4761-0/03',
        '15/03/2024',
        'CARLOS',
        'C-1001',
      ],
      [
        '11.222.333/0001-81',
        'OUTRA EMPRESA S.A.',
        'OUTRA',
        '20040-020',
        'Av. Rio Branco, 456',
        'Rio de Janeiro',
        'RJ',
        '4647-8/01',
        '02/11/2022',
        'FERNANDA',
        'C-2042',
      ],
    ];

    const csv =
      '\uFEFF' +
      headers.join(',') +
      '\n' +
      exampleRows.map((row) => row.map(escapeCSVField).join(',')).join('\n');

    downloadCSV(csv, 'template_auditoria_cnpj.csv');
  }

  // ═══════════════════════════════════════════════
  // Formatação / Timing
  // ═══════════════════════════════════════════════

  /**
   * Formata número como BRL.
   * @param {number|string} value
   * @returns {string}
   */
  function formatCurrency(value) {
    const num = Number(value);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Promise que resolve após `ms` milissegundos.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Debounce: adia a execução até `delay` ms após a última chamada.
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  function debounce(fn, delay) {
    let timerId = null;
    return function (...args) {
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = null;
        fn.apply(this, args);
      }, delay);
    };
  }

  /**
   * Throttle com trailing call — garante no MÁXIMO uma execução a cada
   * `interval` ms, sempre executando a última chamada pendente.
   *
   * Uso recomendado no app.js: embrulhar a atualização de UI do onProgress
   * para a renderização não disparar 10.000 reflows durante o batch:
   *
   *   const renderThrottled = Utils.throttle(renderProgressUI, 250);
   *
   * @param {Function} fn
   * @param {number} interval
   * @returns {Function}
   */
  function throttle(fn, interval) {
    let last = 0;
    let timerId = null;
    let pendingArgs = null;

    return function (...args) {
      const now = Date.now();
      pendingArgs = args;

      const invoke = () => {
        last = Date.now();
        timerId = null;
        fn.apply(this, pendingArgs);
        pendingArgs = null;
      };

      if (now - last >= interval) {
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        invoke();
      } else if (timerId === null) {
        timerId = setTimeout(invoke, interval - (now - last));
      }
    };
  }

  // ═══════════════════════════════════════════════
  // API pública
  // ═══════════════════════════════════════════════

  return {
    // CNPJ
    formatCNPJ,
    cleanCNPJ,
    validateCNPJ,
    // Datas
    parseDateFlexible,
    // CSV
    parseCSV,
    // Comparação
    normalizeForComparison,
    compareFields,
    generateDivergences,
    // Scoring v2
    SCORE_CONFIG,
    calculateVpaScore,
    detectPorte,
    getCnaeAffinity,
    determinePriority,
    determineAction,
    generateAuditResult,
    // Reconstrução (round-trip Excel)
    parseCarteiraRow,
    parseBRNumber,
    parseSimNao,
    parseQsaString,
    parseCnaesString,
    // Export
    exportToCSV,
    downloadCSV,
    exportToXLSX,
    exportToJSON,
    downloadTemplateCSV,
    // Formatação / timing
    formatCurrency,
    sleep,
    debounce,
    throttle,
  };
})();

if (typeof window !== 'undefined') window.Utils = Utils;
