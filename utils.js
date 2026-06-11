/**
 * @file utils.js
 * @description Utility functions for the CNPJ Audit Dashboard.
 * Provides CNPJ formatting, validation, CSV handling, field comparison,
 * divergence analysis, priority determination, and other helpers.
 * Must be loaded before api.js.
 */

const Utils = (function () {
  'use strict';

  // ───────────────────────────────────────────────
  // CNPJ Helpers
  // ───────────────────────────────────────────────

  /**
   * Strip all non-digit characters from a CNPJ string.
   * @param {string} cnpj - Raw CNPJ string (formatted or unformatted).
   * @returns {string} String containing only digit characters.
   */
  function cleanCNPJ(cnpj) {
    if (typeof cnpj !== 'string') {
      cnpj = String(cnpj ?? '');
    }
    return cnpj.replace(/\D/g, '');
  }

  /**
   * Format a raw CNPJ string into the canonical `00.000.000/0001-00` pattern.
   * Returns the original value when the cleaned input does not have exactly 14 digits.
   * @param {string} cnpj - Raw CNPJ string (digits only or already formatted).
   * @returns {string} Formatted CNPJ or the original input if length is invalid.
   */
  function formatCNPJ(cnpj) {
    if (typeof cnpj !== 'string') {
      cnpj = String(cnpj ?? '');
    }
    const digits = cleanCNPJ(cnpj);
    if (digits.length !== 14) {
      return cnpj; // return original if invalid length
    }
    return (
      digits.slice(0, 2) +
      '.' +
      digits.slice(2, 5) +
      '.' +
      digits.slice(5, 8) +
      '/' +
      digits.slice(8, 12) +
      '-' +
      digits.slice(12, 14)
    );
  }

  /**
   * Validate a CNPJ using the official check-digit algorithm.
   *
   * Steps:
   *  1. Clean input to digits only.
   *  2. Must be exactly 14 digits.
   *  3. Reject sequences where all digits are the same (e.g. 11111111111111).
   *  4. Validate first check digit (13th digit).
   *  5. Validate second check digit (14th digit).
   *
   * @param {string} cnpj - CNPJ string (formatted or unformatted).
   * @returns {boolean} `true` if the CNPJ is mathematically valid.
   */
  function validateCNPJ(cnpj) {
    const digits = cleanCNPJ(cnpj);

    if (digits.length !== 14) {
      return false;
    }

    // Reject all-same-digit sequences
    if (/^(\d)\1{13}$/.test(digits)) {
      return false;
    }

    const nums = digits.split('').map(Number);

    // --- First check digit (position 12, 0-indexed) ---
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum1 = 0;
    for (let i = 0; i < 12; i++) {
      sum1 += nums[i] * weights1[i];
    }
    const remainder1 = sum1 % 11;
    const check1 = remainder1 < 2 ? 0 : 11 - remainder1;
    if (nums[12] !== check1) {
      return false;
    }

    // --- Second check digit (position 13, 0-indexed) ---
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum2 = 0;
    for (let i = 0; i < 13; i++) {
      sum2 += nums[i] * weights2[i];
    }
    const remainder2 = sum2 % 11;
    const check2 = remainder2 < 2 ? 0 : 11 - remainder2;
    if (nums[13] !== check2) {
      return false;
    }

    return true;
  }

  // ───────────────────────────────────────────────
  // CSV Handling
  // ───────────────────────────────────────────────

  /**
   * Parse CSV text into an array of objects.
   *
   * - Uses the first row as headers (trimmed, lowercased, BOM stripped).
   * - Handles quoted fields (including commas inside quotes).
   * - Handles empty fields and trims whitespace from values.
   * - Skips blank rows.
   *
   * @param {string} text - Raw CSV text content.
   * @returns {Array<Object>} Array of row objects keyed by header names.
   */
  function parseCSV(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }

    // Remove BOM if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    /**
     * Parse a single CSV line respecting quoted fields.
     * @param {string} line - A single CSV line.
     * @returns {string[]} Array of field values.
     */
    function parseLine(line) {
      const fields = [];
      let current = '';
      let inQuotes = false;
      let i = 0;

      while (i < line.length) {
        const ch = line[i];

        if (inQuotes) {
          if (ch === '"') {
            // Peek ahead: escaped quote or end of quoted field
            if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i += 2;
              continue;
            }
            inQuotes = false;
            i++;
            continue;
          }
          current += ch;
          i++;
        } else {
          if (ch === '"') {
            inQuotes = true;
            i++;
            continue;
          }
          if (ch === ',') {
            fields.push(current.trim());
            current = '';
            i++;
            continue;
          }
          current += ch;
          i++;
        }
      }

      // Push last field
      fields.push(current.trim());
      return fields;
    }

    // Split into lines, handling both \r\n and \n
    const lines = text.split(/\r?\n/);

    // Find the first non-empty line for headers
    let headerIndex = 0;
    while (headerIndex < lines.length && lines[headerIndex].trim() === '') {
      headerIndex++;
    }

    if (headerIndex >= lines.length) {
      return [];
    }

    const headers = parseLine(lines[headerIndex]).map((h) =>
      h.toLowerCase().trim()
    );

    const results = [];

    for (let r = headerIndex + 1; r < lines.length; r++) {
      const line = lines[r];
      if (line.trim() === '') {
        continue; // skip empty rows
      }
      const values = parseLine(line);
      const row = {};
      for (let c = 0; c < headers.length; c++) {
        row[headers[c]] = c < values.length ? values[c] : '';
      }
      results.push(row);
    }

    return results;
  }

  // ───────────────────────────────────────────────
  // String Comparison
  // ───────────────────────────────────────────────

  /**
   * Normalize a string for fuzzy comparison by removing cosmetic differences.
   *
   * - Converts to uppercase.
   * - Collapses extra whitespace.
   * - Replaces common abbreviations: LTDA./LTDA → LIMITADA, S.A./S/A → SA,
   *   ME. → ME, EPP. → EPP.
   * - Removes all dots and dashes.
   * - Trims leading/trailing whitespace.
   *
   * @param {string} str - The string to normalize.
   * @returns {string} Normalized string suitable for comparison.
   */
  function normalizeForComparison(str) {
    if (typeof str !== 'string') {
      return '';
    }

    let s = str.toUpperCase().trim();

    // Collapse extra whitespace
    s = s.replace(/\s+/g, ' ');

    // Replace common abbreviations (order matters: match longer patterns first)
    s = s.replace(/\bLTDA\b\.?/g, 'LIMITADA');
    s = s.replace(/\bS\.A\.\b/g, 'SA');
    s = s.replace(/\bS\/A\b/g, 'SA');
    s = s.replace(/\bME\b\./g, 'ME');
    s = s.replace(/\bEPP\b\./g, 'EPP');

    // Remove dots and dashes
    s = s.replace(/[.\-]/g, '');

    return s.trim();
  }

  /**
   * Compare two field values intelligently, returning a divergence descriptor.
   *
   * - If both values are empty/null/undefined → no divergence (returns `null`).
   * - If `internal` is empty but `official` has a value → divergence.
   * - For CEP fields: compares digits only.
   * - For other fields: uses {@link normalizeForComparison}.
   *
   * @param {string|null|undefined} internal - Value from internal records.
   * @param {string|null|undefined} official - Value from official records.
   * @param {string} fieldName - Name of the field being compared.
   * @returns {{ isDivergent: boolean, internal: string, official: string } | null}
   *   Divergence object or `null` when the internal value was not provided.
   */
  function compareFields(internal, official, fieldName) {
    const internalStr = (internal ?? '').toString().trim();
    const officialStr = (official ?? '').toString().trim();

    // Both empty → no divergence
    if (internalStr === '' && officialStr === '') {
      return null;
    }

    // Internal empty, official has data → enrichment, NOT a divergence
    if (internalStr === '' && officialStr !== '') {
      return {
        isDivergent: false,
        internal: internalStr,
        official: officialStr,
      };
    }

    // If we have no official data, we can't compare
    if (officialStr === '' && internalStr !== '') {
      return {
        isDivergent: false,
        internal: internalStr,
        official: officialStr,
      };
    }

    // CEP: compare digits only
    if (fieldName.toLowerCase() === 'cep') {
      const internalDigits = internalStr.replace(/\D/g, '');
      const officialDigits = officialStr.replace(/\D/g, '');
      return {
        isDivergent: internalDigits !== officialDigits,
        internal: internalStr,
        official: officialStr,
      };
    }

    // General comparison using normalization
    const normInternal = normalizeForComparison(internalStr);
    const normOfficial = normalizeForComparison(officialStr);

    return {
      isDivergent: normInternal !== normOfficial,
      internal: internalStr,
      official: officialStr,
    };
  }

  // ───────────────────────────────────────────────
  // Divergence & Audit Logic
  // ───────────────────────────────────────────────

  /**
   * Compare all relevant fields between internal and official data.
   *
   * Fields compared:
   * | Internal key    | Official key              |
   * |-----------------|---------------------------|
   * | razao_social    | razao_social              |
   * | nome_fantasia   | nome_fantasia             |
   * | cep             | cep                       |
   * | logradouro      | logradouro                |
   * | municipio       | municipio                 |
   * | uf              | uf                        |
   * | cnae            | cnae_fiscal_descricao     |
   *
   * @param {Object} internalData - Client record from internal CSV.
   * @param {Object} officialData - Record returned by BrasilAPI.
   * @returns {Array<{ campo_com_divergencia: string, valor_interno: string, valor_oficial: string }>}
   */
  function generateDivergences(internalData, officialData) {
    if (!internalData || !officialData) {
      return [];
    }

    /** @type {Array<[string, string, string]>} [fieldLabel, internalKey, officialKey] */
    const fieldMap = [
      ['razao_social', 'razao_social', 'razao_social'],
      ['nome_fantasia', 'nome_fantasia', 'nome_fantasia'],
      ['cep', 'cep', 'cep'],
      ['logradouro', 'logradouro', 'logradouro'],
      ['municipio', 'municipio', 'municipio'],
      ['uf', 'uf', 'uf'],
      ['cnae', 'cnae', 'cnae_fiscal_descricao'],
    ];

    const divergences = [];

    for (const [fieldLabel, intKey, offKey] of fieldMap) {
      const result = compareFields(
        internalData[intKey],
        officialData[offKey],
        fieldLabel
      );

      if (result && result.isDivergent) {
        divergences.push({
          campo_com_divergencia: fieldLabel,
          valor_interno: result.internal,
          valor_oficial: result.official,
        });
      }
    }

    return divergences;
  }

  /**
   * Advanced VPA Scoring Engine
   * Calculates the final score (0-100) based on multiple strategic components.
   *
   * @param {Object} internalData 
   * @param {Object} officialData 
   * @param {Array} divergences 
   * @returns {Object} Score breakdown, total score, priority, action
   */
  function calculateVpaScore(internalData, officialData, divergences) {
    let scoreRecencia = 0;
    let scorePorte = 0;
    let scoreCadastral = 0;
    let scoreDados = 0;
    let scoreAfinidade = 0;
    
    // 1. Score Recência (30%)
    let diasInativos = -1;
    if (internalData.ultcpr) {
      const ultCprDate = new Date(internalData.ultcpr);
      if (!isNaN(ultCprDate.getTime())) {
        const diffTime = Math.abs(new Date() - ultCprDate);
        diasInativos = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diasInativos <= 180) scoreRecencia = 90; // < 6 meses
        else if (diasInativos <= 365) scoreRecencia = 70; // 6-12 meses
        else if (diasInativos <= 730) scoreRecencia = 50; // 1-2 anos
        else if (diasInativos <= 1095) scoreRecencia = 30; // 2-3 anos
        else scoreRecencia = 10; // > 3 anos
      }
    }
    
    // 2. Score Porte (15%)
    const porteStr = (officialData?.porte || '').toUpperCase();
    const capital = parseFloat(officialData?.capital_social) || 0;
    if (porteStr === 'DEMAIS' || capital > 500000) scorePorte = 90;
    else if (porteStr.includes('EPP') || (capital >= 50000 && capital <= 500000)) scorePorte = 60;
    else if (porteStr.includes('ME') || (capital > 0 && capital < 50000)) scorePorte = 30;
    else scorePorte = 15; // MEI or unknown
    
    // 3. Score Cadastral (20%)
    const situacao = (officialData?.descricao_situacao_cadastral || '').toUpperCase();
    const numDiv = divergences.length;
    if (situacao === 'ATIVA') {
      if (numDiv === 0) scoreCadastral = 100;
      else scoreCadastral = 60;
    } else if (situacao === 'SUSPENSA') {
      scoreCadastral = 20;
    } else {
      scoreCadastral = 0; // BAIXADA
    }
    
    // 4. Score Dados (15%)
    if (officialData?.ddd_telefone_1) scoreDados += 30;
    if (officialData?.email) scoreDados += 30;
    if (Array.isArray(officialData?.qsa) && officialData.qsa.length > 0) scoreDados += 20;
    if (officialData?.logradouro) scoreDados += 20;
    
    // 5. Score Afinidade CNAE (20%)
    const cnae = (officialData?.cnae_fiscal_descricao || '').toUpperCase();
    const cnaesSecundarios = Array.isArray(officialData?.cnaes_secundarios) 
      ? officialData.cnaes_secundarios.map(c => c.descricao.toUpperCase()).join(' ') 
      : '';
    const allCnaes = cnae + ' ' + cnaesSecundarios;
    
    if (allCnaes.includes('PAPELARIA') || allCnaes.includes('LIVROS') || allCnaes.includes('LIVRARIA') || allCnaes.includes('JORNAIS')) {
      scoreAfinidade = 100; // Core
    } else if (allCnaes.includes('ARMARINHO')) {
      scoreAfinidade = 70; // Alta
    } else if (allCnaes.includes('BRINQUEDOS') || allCnaes.includes('PRESENTES') || allCnaes.includes('VAREJISTA DE PRODUTOS NOVOS')) {
      scoreAfinidade = 50; // Média
    } else {
      scoreAfinidade = 20; // Outros
    }
    
    // Calcula Score Final
    const totalScore = Math.round(
      (scoreRecencia * 0.30) +
      (scorePorte * 0.15) +
      (scoreCadastral * 0.20) +
      (scoreDados * 0.15) +
      (scoreAfinidade * 0.20)
    );
    
    // Classification and Priority Map
    let classification = '';
    let priority = '';
    let action = '';
    let color = '';
    
    if (situacao !== 'ATIVA') {
       classification = '🔴 DESCARTE / ARQUIVO';
       priority = 'ALTA';
       action = `BLOQUEAR CADASTRO - Empresa ${situacao}`;
       color = 'red';
    } else if (totalScore >= 80) {
       classification = '🟢 OPORTUNIDADE QUENTE';
       priority = 'ALTA';
       action = 'Ligação direta do vendedor. Validar divergências pendentes.';
       color = 'green';
    } else if (totalScore >= 60) {
       classification = '🔵 POTENCIAL ALTO';
       priority = 'MEDIA';
       action = 'SDR: Agendar visita + Enviar WhatsApp com catálogo VPA.';
       color = 'blue';
    } else if (totalScore >= 40) {
       classification = '🟡 POTENCIAL MODERADO';
       priority = 'MEDIA';
       action = 'Campanha de E-mail Marketing / Nutrição.';
       color = 'yellow';
    } else {
       classification = '🟠 REQUER INVESTIGAÇÃO';
       priority = 'BAIXA';
       action = 'Investigar se perfil de cliente mudou. Baixa probabilidade de recompra imediata.';
       color = 'orange';
    }
    
    return {
      totalScore,
      priority,
      classification,
      action,
      color,
      breakdown: {
        diasInativos,
        scoreRecencia,
        scorePorte,
        scoreCadastral,
        scoreDados,
        scoreAfinidade
      }
    };
  }

  /**
   * Build the complete audit result JSON for a single client.
   *
   * Assembles divergences, priority, action, validity flag, and timestamps.
   * The `inteligencia_web` field is set to `null` (populated later by api.js).
   *
   * @param {Object} internalData - Client record from internal CSV.
   * @param {Object} officialData - Record returned by BrasilAPI.
   * @returns {Object} Full audit result object.
   */
  function generateAuditResult(internalData, officialData) {
    const divergences = generateDivergences(internalData, officialData);
    const vpaScoring = calculateVpaScore(internalData, officialData, divergences);

    const situacao = (
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
      prioridade_geral: vpaScoring.priority,
      acao_recomendada: vpaScoring.action,
      score_vpa: vpaScoring.totalScore,
      score_breakdown: vpaScoring.breakdown,
      dados_completos_receita: officialData,
      inteligencia_web: null, // populated by api.js → generateWebIntelligence
      data_consulta: new Date().toISOString(),
    };
  }

  // ───────────────────────────────────────────────
  // CSV Export / Download
  // ───────────────────────────────────────────────

  /**
   * Escape a value for CSV output.
   * Wraps the value in double quotes if it contains commas, double quotes,
   * or newlines. Double quotes inside the value are escaped by doubling.
   * @param {*} value - The value to escape.
   * @returns {string} CSV-safe string.
   */
  function escapeCSVField(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Convert an array of audit result objects to a CSV string.
   *
   * Exports ALL fields from BrasilAPI for future use, including:
   * situação cadastral, data situação, motivo, natureza jurídica, porte,
   * data início, endereço completo, telefones, email, sócios (QSA),
   * CNAEs secundários, capital social, opção Simples/MEI, etc.
   *
   * @param {Array<Object>} results - Array of audit result objects.
   * @returns {string} CSV-formatted string (UTF-8 with BOM for Excel compat).
   */
  function exportToCSV(results) {
    if (!Array.isArray(results) || results.length === 0) {
      return '';
    }

    const headers = [
      // Audit results
      'cnpj_analisado',
      'vendedor_responsavel',
      'status_receita',
      'cadastro_valido',
      'num_divergencias',
      'divergencias_resumo',
      'prioridade_geral',
      'acao_recomendada',
      'data_consulta',
      // Web intelligence
      'web_operacao_ativa',
      'web_link_principal',
      'web_resumo_atuacao',
      // Dados oficiais — Identificação
      'razao_social',
      'nome_fantasia',
      'natureza_juridica',
      'porte',
      'capital_social',
      'data_inicio_atividade',
      // Situação cadastral
      'situacao_cadastral',
      'data_situacao_cadastral',
      'motivo_situacao_cadastral',
      'situacao_especial',
      'data_situacao_especial',
      // Endereço completo
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
      // Atividades econômicas
      'cnae_fiscal',
      'cnae_fiscal_descricao',
      'cnaes_secundarios',
      // Opções tributárias
      'opcao_pelo_simples',
      'data_opcao_pelo_simples',
      'data_exclusao_do_simples',
      'opcao_pelo_mei',
      'data_opcao_pelo_mei',
      'data_exclusao_do_mei',
      // Entidade responsável
      'ente_federativo_responsavel',
      // Sócios (QSA)
      'qsa_socios',
    ];

    const rows = results.map((r) => {
      const rec = r.dados_completos_receita || {};
      const web = r.inteligencia_web || {};

      const divergenciasResumo = Array.isArray(r.divergencias)
        ? r.divergencias.map((d) => d.campo_com_divergencia).join('; ')
        : '';

      // Format QSA (sócios) as semicolon-separated list
      let qsaStr = '';
      if (Array.isArray(rec.qsa) && rec.qsa.length > 0) {
        qsaStr = rec.qsa.map(s =>
          `${s.nome_socio || s.nome || ''} (${s.qualificacao_socio || s.qual || ''})`
        ).join('; ');
      }

      // Format CNAEs secundários as semicolon-separated list
      let cnaesSecStr = '';
      if (Array.isArray(rec.cnaes_secundarios) && rec.cnaes_secundarios.length > 0) {
        cnaesSecStr = rec.cnaes_secundarios.map(c =>
          `${c.codigo || ''} - ${c.descricao || ''}`
        ).join('; ');
      }

      const values = [
        // Audit
        r.cnpj_analisado ?? '',
        r.vendedor ?? '',
        r.status_receita ?? '',
        r.cadastro_valido ? 'SIM' : 'NÃO',
        r.num_divergencias ?? 0,
        divergenciasResumo,
        r.prioridade_geral ?? '',
        r.acao_recomendada ?? '',
        r.data_consulta ?? '',
        // Web
        web.indicios_de_operacao_ativa ? 'SIM' : 'NÃO',
        web.link_principal_encontrado ?? '',
        web.resumo_da_atuacao ?? '',
        // Identificação
        rec.razao_social ?? '',
        rec.nome_fantasia ?? '',
        rec.natureza_juridica ?? '',
        rec.porte ?? '',
        rec.capital_social != null ? formatCurrency(rec.capital_social) : '',
        rec.data_inicio_atividade ?? '',
        // Situação
        rec.descricao_situacao_cadastral ?? '',
        rec.data_situacao_cadastral ?? '',
        rec.motivo_situacao_cadastral ?? '',
        rec.situacao_especial ?? '',
        rec.data_situacao_especial ?? '',
        // Endereço
        rec.cep ?? '',
        rec.logradouro ?? '',
        rec.numero ?? '',
        rec.complemento ?? '',
        rec.bairro ?? '',
        rec.municipio ?? '',
        rec.uf ?? '',
        // Contato
        rec.ddd_telefone_1 ?? '',
        rec.ddd_telefone_2 ?? '',
        rec.ddd_fax ?? '',
        rec.email ?? '',
        // CNAE
        rec.cnae_fiscal ?? '',
        rec.cnae_fiscal_descricao ?? '',
        cnaesSecStr,
        // Tributário
        rec.opcao_pelo_simples != null ? (rec.opcao_pelo_simples ? 'SIM' : 'NÃO') : '',
        rec.data_opcao_pelo_simples ?? '',
        rec.data_exclusao_do_simples ?? '',
        rec.opcao_pelo_mei != null ? (rec.opcao_pelo_mei ? 'SIM' : 'NÃO') : '',
        rec.data_opcao_pelo_mei ?? '',
        rec.data_exclusao_do_mei ?? '',
        // Ente federativo
        rec.ente_federativo_responsavel ?? '',
        // QSA
        qsaStr,
      ];

      return values.map(escapeCSVField).join(',');
    });

    // BOM for Excel UTF-8 compatibility
    return '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  }

  /**
   * Generic function to trigger a browser download from a Blob.
   *
   * @param {Blob} blob - The file content.
   * @param {string} filename - Download file name.
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
      console.error('downloadBlob: failed to trigger download.', err);
    }
  }

  /**
   * Trigger a browser download of a CSV string as a file.
   *
   * @param {string} csvString - The CSV content.
   * @param {string} [filename='auditoria_cnpj.csv'] - Download file name.
   */
  function downloadCSV(csvString, filename = 'auditoria_cnpj.csv') {
    if (typeof csvString !== 'string' || csvString.length === 0) {
      console.warn('downloadCSV: nothing to download.');
      return;
    }
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
  }

  /**
   * Export results to XLSX using SheetJS and trigger download.
   *
   * @param {Array<Object>} results - The audit results to export.
   * @param {string} filename - The file name to download.
   */
  function exportToXLSX(results, filename = 'auditoria_cnpj.xlsx') {
    if (!window.XLSX) {
      console.error('SheetJS (XLSX) library is not loaded.');
      return;
    }

    const flatData = results.map(r => ({
      CNPJ: r.cnpj,
      Status_Geral: r.status_geral,
      Status_Receita: r.status_receita,
      Prioridade_Contato: r.prioridade,
      Score_Reativacao: r.score,
      Vendedor_Responsavel: r.vendedor_responsavel,
      Recomendacao: r.recomendacao,
      Divergencias: Array.isArray(r.divergences) ? r.divergences.join(', ') : '',
      Interno_Razao_Social: r.internalData?.razao_social || '',
      Receita_Razao_Social: r.officialData?.razao_social || '',
      Interno_Nome_Fantasia: r.internalData?.nome_fantasia || '',
      Receita_Nome_Fantasia: r.officialData?.nome_fantasia || '',
      Interno_CEP: r.internalData?.cep || '',
      Receita_CEP: r.officialData?.cep || '',
      Interno_Endereço: r.internalData?.logradouro || '',
      Receita_Endereço: [r.officialData?.logradouro, r.officialData?.numero].filter(Boolean).join(', '),
      Interno_Município: r.internalData?.municipio || '',
      Receita_Município: r.officialData?.municipio || '',
      Interno_UF: r.internalData?.uf || '',
      Receita_UF: r.officialData?.uf || '',
      Interno_CNAE: r.internalData?.cnae || '',
      Receita_CNAE: r.officialData?.cnae_fiscal_descricao || '',
      Observacoes: r.observacoes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(flatData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados_Auditoria");
    XLSX.writeFile(workbook, filename);
  }

  /**
   * Export full data state as a JSON file.
   *
   * @param {Object} data - The data state to export (usually { clients, results }).
   * @param {string} filename - The file name to download.
   */
  function exportToJSON(data, filename = 'auditoria_state.json') {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    downloadBlob(blob, filename);
  }

  /**
   * Generate and trigger download of a template CSV file.
   *
   * Headers: cnpj, razao_social, nome_fantasia, cep, logradouro,
   * municipio, uf, cnae.
   * Includes two example rows with placeholder data.
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
        'Comércio varejista',
      ],
      [
        '11.222.333/0001-81',
        'OUTRA EMPRESA S.A.',
        'OUTRA',
        '20040-020',
        'Av. Rio Branco, 456',
        'Rio de Janeiro',
        'RJ',
        'Consultoria em tecnologia',
      ],
    ];

    const csv =
      '\uFEFF' +
      headers.join(',') +
      '\n' +
      exampleRows.map((row) => row.map(escapeCSVField).join(',')).join('\n');

    downloadCSV(csv, 'template_auditoria_cnpj.csv');
  }

  // ───────────────────────────────────────────────
  // Formatting Helpers
  // ───────────────────────────────────────────────

  /**
   * Format a numeric value as Brazilian Real (BRL) currency.
   *
   * @example
   * formatCurrency(1234567.89) // → 'R$ 1.234.567,89'
   *
   * @param {number|string} value - The numeric value.
   * @returns {string} Formatted currency string or 'R$ 0,00' for invalid input.
   */
  function formatCurrency(value) {
    const num = Number(value);
    if (isNaN(num)) {
      return 'R$ 0,00';
    }

    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  // ───────────────────────────────────────────────
  // Async / Timing Helpers
  // ───────────────────────────────────────────────

  /**
   * Return a Promise that resolves after the specified number of milliseconds.
   *
   * @param {number} ms - Milliseconds to wait.
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a debounced version of a function.
   *
   * The returned function delays invoking `fn` until after `delay` milliseconds
   * have elapsed since the last invocation.
   *
   * @param {Function} fn - The function to debounce.
   * @param {number} delay - Delay in milliseconds.
   * @returns {Function} Debounced function.
   */
  function debounce(fn, delay) {
    let timerId = null;

    return function (...args) {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        timerId = null;
        fn.apply(this, args);
      }, delay);
    };
  }

  // ───────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────

  return {
    formatCNPJ,
    cleanCNPJ,
    validateCNPJ,
    parseCSV,
    normalizeForComparison,
    compareFields,
    generateDivergences,
    determinePriority,
    determineAction,
    generateAuditResult,
    exportToCSV,
    downloadCSV,
    exportToXLSX,
    exportToJSON,
    downloadTemplateCSV,
    formatCurrency,
    sleep,
    debounce,
  };
})();
