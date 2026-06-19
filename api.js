/**
 * @file api.js
 * @description API layer for the CNPJ Audit Dashboard.
 * Handles BrasilAPI calls, web-intelligence generation, and batch processing.
 * Depends on {@link Utils} (utils.js) being loaded first.
 */

const API = (function () {
  'use strict';

  // ───────────────────────────────────────────────
  // Internal State
  // ───────────────────────────────────────────────

  /** @type {boolean} Flag to signal batch cancellation. */
  let _cancelFlag = false;

  /** @type {boolean} Whether a batch is currently running. */
  let _batchRunning = false;

  // ───────────────────────────────────────────────
  // Constants
  // ───────────────────────────────────────────────

  /** @type {string} BrasilAPI CNPJ endpoint base URL. */
  const BRASIL_API_BASE = 'https://brasilapi.com.br/api/cnpj/v1';

  /** @type {number} Maximum number of retry attempts for API calls. */
  const MAX_RETRIES = 3;

  /** @type {number} Base delay in milliseconds for exponential backoff. */
  const BASE_BACKOFF_MS = 1000;

  /** @type {number} Extra wait time (ms) when the API returns 429. */
  const RATE_LIMIT_WAIT_MS = 5000;

  // ───────────────────────────────────────────────
  // BrasilAPI
  // ───────────────────────────────────────────────

  /**
   * Fetch official CNPJ data from BrasilAPI.
   *
   * Implements retry logic with exponential backoff:
   * - Up to 3 attempts (delays: 1 s → 2 s → 4 s).
   * - On HTTP 429 (rate limit): waits 5 s then retries.
   * - On HTTP 404: returns an error object immediately (no retry).
   * - On other errors: retries up to the limit, then returns error object.
   *
   * @param {string} cnpj - CNPJ string (formatted or unformatted).
   * @returns {Promise<Object>} Parsed JSON data or an error descriptor
   *   `{ error: true, message: string, code: number }`.
   */
  async function fetchCNPJData(cnpj) {
    const digits = Utils.cleanCNPJ(cnpj);

    if (digits.length !== 14) {
      return {
        error: true,
        message: 'CNPJ inválido: deve conter 14 dígitos.',
        code: 0,
      };
    }

    if (!Utils.validateCNPJ(digits)) {
      return {
        error: true,
        message: 'CNPJ inválido: dígitos verificadores incorretos.',
        code: 400,
      };
    }

    const url = `${BRASIL_API_BASE}/${digits}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url);

        // --- 404: not found, no retry ---
        if (response.status === 404) {
          return {
            error: true,
            message: 'CNPJ não encontrado',
            code: 404,
          };
        }

        // --- 429: rate limited ---
        if (response.status === 429) {
          console.warn(
            `fetchCNPJData: rate-limited (429) on attempt ${attempt}. Waiting ${RATE_LIMIT_WAIT_MS} ms…`
          );
          await Utils.sleep(RATE_LIMIT_WAIT_MS);
          continue; // retry
        }

        // --- Other non-OK statuses ---
        if (!response.ok) {
          const msg = `HTTP ${response.status}: ${response.statusText}`;
          if (attempt < MAX_RETRIES) {
            const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
            console.warn(
              `fetchCNPJData: ${msg}. Retrying in ${delay} ms (attempt ${attempt}/${MAX_RETRIES})…`
            );
            await Utils.sleep(delay);
            continue;
          }
          return { error: true, message: msg, code: response.status };
        }

        // --- Success ---
        const data = await response.json();
        return data;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const isFailedToFetch = err.message && err.message.toLowerCase().includes('fetch');
          const delay = isFailedToFetch ? RATE_LIMIT_WAIT_MS : BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.warn(
            `fetchCNPJData: network error "${err.message}". Retrying in ${delay} ms (attempt ${attempt}/${MAX_RETRIES})…`
          );
          await Utils.sleep(delay);
          continue;
        }
        return {
          error: true,
          message: err.message || 'Erro de rede desconhecido.',
          code: 0,
        };
      }
    }

    // Fallback (should not reach here)
    return {
      error: true,
      message: 'Número máximo de tentativas excedido.',
      code: 0,
    };
  }

  // ───────────────────────────────────────────────
  // Web Intelligence (mock)
  // ───────────────────────────────────────────────

  /**
   * Generate mock web intelligence based on official CNPJ data.
   *
   * Since real web searches cannot be performed in the browser, this function
   * produces realistic placeholder data derived from the official record.
   *
   * @param {Object} officialData - Official data returned by BrasilAPI.
   * @returns {{ indicios_de_operacao_ativa: boolean,
   *             link_principal_encontrado: string|null,
   *             resumo_da_atuacao: string }}
   *   Mock web-intelligence object.
   */
  function generateWebIntelligence(officialData) {
    if (!officialData || officialData.error) {
      return {
        indicios_de_operacao_ativa: false,
        link_principal_encontrado: null,
        resumo_da_atuacao: 'Dados oficiais indisponíveis.',
      };
    }

    const situacao = String(officialData.descricao_situacao_cadastral || '').trim().toUpperCase();
    const isAtiva = situacao === 'ATIVA' || officialData.situacao_cadastral === 2;
    const capital = parseFloat(officialData.capital_social) || 0;
    const temTelefone = !!officialData.ddd_telefone_1;
    const temEmail = !!officialData.email;

    // Sinal baseado em dados reais da Receita Federal — se a empresa está ATIVA, ela está operacionalmente ativa
    const indiciosAtivo = isAtiva;

    const partes = [
      officialData.cnae_fiscal_descricao ? `Segmento: ${officialData.cnae_fiscal_descricao}` : null,
      (officialData.municipio && officialData.uf) ? `Local: ${officialData.municipio}/${officialData.uf}` : null,
      capital > 0
        ? `Capital: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(capital)}`
        : null,
      temTelefone ? `Tel RF: ${officialData.ddd_telefone_1}` : 'Sem telefone na RF',
      temEmail ? `E-mail RF: ${officialData.email}` : 'Sem e-mail na RF',
    ].filter(Boolean).join(' · ');

    return {
      indicios_de_operacao_ativa: indiciosAtivo,
      link_principal_encontrado: null,
      resumo_da_atuacao: partes || 'Sem informações adicionais disponíveis.',
    };
  }

  // ───────────────────────────────────────────────
  // Single-Client Processing
  // ───────────────────────────────────────────────

  /**
   * Full processing pipeline for a single client.
   *
   * 1. Fetches official CNPJ data from BrasilAPI.
   * 2. If the API returns an error, returns an error-status result.
   * 3. Generates the audit result via {@link Utils.generateAuditResult}.
   * 4. Generates mock web intelligence and merges it into the result.
   *
   * @param {Object} clientData - Client record parsed from the CSV.
   * @param {string} clientData.cnpj - The client's CNPJ (required).
   * @returns {Promise<Object>} Complete audit result object.
   */
  async function processClient(clientData) {
    if (!clientData || !clientData.cnpj) {
      return {
        cnpj_analisado: 'N/A',
        status_receita: 'ERRO',
        cadastro_valido: false,
        divergencias: [],
        num_divergencias: 0,
        prioridade_geral: 'DESCARTE',
        acao_recomendada: 'CNPJ não informado no registro.',
        dados_completos_receita: null,
        inteligencia_web: null,
        data_consulta: new Date().toISOString(),
        _status: 'error',
        _errorMessage: 'CNPJ não informado.',
      };
    }

    const officialData = await fetchCNPJData(clientData.cnpj);

    // API returned an error
    if (officialData && officialData.error) {
      const isPermanent = officialData.code === 404 || officialData.code === 400;
      return {
        cnpj_analisado: Utils.formatCNPJ(Utils.cleanCNPJ(clientData.cnpj)),
        status_receita: isPermanent ? (officialData.code === 404 ? 'NÃO ENCONTRADO' : 'INVÁLIDO') : 'ERRO',
        cadastro_valido: false,
        divergencias: [],
        num_divergencias: 0,
        prioridade_geral: 'DESCARTE',
        acao_recomendada: isPermanent ? (officialData.code === 404 ? 'CNPJ não encontrado na Receita Federal.' : 'CNPJ inválido (dígitos incorretos).') : `Erro na consulta: ${officialData.message}`,
        dados_completos_receita: null,
        inteligencia_web: null,
        data_consulta: new Date().toISOString(),
        _status: isPermanent ? 'inactive' : 'error',
        _errorMessage: officialData.message,
        _errorCode: officialData.code,
      };
    }

    // Build audit result
    const auditResult = Utils.generateAuditResult(clientData, officialData);

    // Enrich with web intelligence
    const webIntel = generateWebIntelligence(officialData);
    auditResult.inteligencia_web = webIntel;

    auditResult._status = 'success';

    return auditResult;
  }

  // ───────────────────────────────────────────────
  // Batch Processing
  // ───────────────────────────────────────────────

  /**
   * Process an array of clients sequentially in batch.
   *
   * - Calls {@link processClient} for each entry.
   * - Inserts a configurable delay between requests to respect rate limits.
   * - Invokes the `onProgress` callback after each client completes.
   * - Supports cancellation via {@link cancelBatch}.
   *
   * @param {Array<Object>} clients - Array of client data objects from CSV.
   * @param {function(number, number, Object): void} onProgress
   *   Callback invoked after each client: `(currentIndex, totalCount, result)`.
   * @param {{ delayMs?: number }} [options={ delayMs: 1500 }]
   *   Processing options.
   * @returns {Promise<Array<Object>>} Resolves with array of all audit results
   *   when complete (or when cancelled).
   */
  async function processBatch(clients, onProgress, options = {}) {
    if (!Array.isArray(clients) || clients.length === 0) {
      console.warn('processBatch: no clients to process.');
      return [];
    }

    const delayMs =
      typeof options.delayMs === 'number' && options.delayMs >= 0
        ? options.delayMs
        : 1500;

    _cancelFlag = false;
    _batchRunning = true;

    const results = [];

    const concurrency = options.concurrency || 20;
    const targetIndices = options.indices || Array.from({ length: clients.length }, (_, i) => i);

    try {
      let currentIndex = 0;
      let completedCount = 0;

      const workers = Array.from({ length: concurrency }, async () => {
        while (currentIndex < targetIndices.length) {
          if (_cancelFlag) break;

          const idx = currentIndex++;
          const i = targetIndices[idx];
          const client = clients[i];
          
          if (typeof options.onStart === 'function') {
            try {
              options.onStart(i);
            } catch (startErr) {
              console.error('processBatch: onStart callback error:', startErr);
            }
          }

          const result = await processClient(client);
          results[i] = result;
          completedCount++;

          if (typeof onProgress === 'function') {
            try {
              onProgress(i, clients.length, result);
            } catch (cbErr) {
              console.error('processBatch: onProgress callback error:', cbErr);
            }
          }

          if (delayMs > 0 && !_cancelFlag) {
            await Utils.sleep(delayMs);
          }
        }
      });

      await Promise.all(workers);

    } finally {
      _batchRunning = false;
      _cancelFlag = false;
    }

    return results;
  }

  /**
   * Signal the running batch to stop after the current client finishes.
   * Has no effect if no batch is currently running.
   */
  function cancelBatch() {
    if (_batchRunning) {
      _cancelFlag = true;
      console.info('cancelBatch: cancellation requested.');
    }
  }

  /**
   * Check whether a batch is currently being processed.
   * @returns {boolean} `true` if a batch is in progress.
   */
  function isBatchRunning() {
    return _batchRunning;
  }

  // ───────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────

  return {
    fetchCNPJData,
    generateWebIntelligence,
    processClient,
    processBatch,
    cancelBatch,
    isBatchRunning,
  };
})();
