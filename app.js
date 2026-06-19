/**
 * AuditBase — Main Application Logic
 * Handles UI interactions, file upload, table rendering, detail panel, and processing orchestration.
 * Depends on: Utils (utils.js), API (api.js)
 */
const App = (function () {
  // ─── State ──────────────────────────────────────────────────
  let clients = [];           // Array of client data from CSV
  let results = [];           // Array of audit results (mirrors clients by index)
  let filteredIndices = [];   // Indices into clients[] after search/filter
  let currentPage = 1;
  const PAGE_SIZE = 50;
  let selectedIndex = -1;     // Currently selected row index
  let isProcessing = false;
  let processingStartTime = null;

  // Atualiza o dashboard analítico (Visão Geral / Inteligência / Plano).
  function renderDashboard() {
    if (window.Dashboard) Dashboard.render(results);
  }
  // Versão estrangulada para uso durante o batch (evita re-render a cada CNPJ).
  const renderDashboardThrottled =
    (typeof Utils !== 'undefined' && Utils.throttle)
      ? Utils.throttle(renderDashboard, 800)
      : renderDashboard;

  const saveSessionDebounced =
    (typeof Utils !== 'undefined' && Utils.debounce)
      ? Utils.debounce(saveSession, 500)
      : saveSession;

  // ─── DOM References ─────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const dom = {};

  function cacheDom() {
    dom.uploadArea = $('upload-area');
    dom.fileInput = $('file-input');
    dom.fileInfo = $('file-info');
    dom.fileName = $('file-name');
    dom.fileSize = $('file-size');
    dom.fileRemove = $('file-remove');
    dom.btnTemplate = $('btn-template');
    dom.btnProcess = $('btn-process');
    dom.btnProcessText = $('btn-process-text');
    dom.btnRetry = $('btn-retry');
    dom.btnCancel = $('btn-cancel');
    dom.btnExport = $('btn-export');
    dom.exportDropdown = $('export-dropdown');
    dom.exportMenu = $('export-menu');
    dom.btnExportCsv = $('btn-export-csv');
    dom.btnExportXlsx = $('btn-export-xlsx');
    dom.btnExportJson = $('btn-export-json');
    dom.btnImportResults = $('btn-import-results');
    dom.importResultsInput = $('import-results-input');
    dom.btnSearchCnpj = $('btn-search-cnpj');
    dom.cnpjInputWrapper = $('cnpj-input-wrapper');
    dom.cnpjDirectInput = $('cnpj-direct-input');
    dom.modeRadios = document.querySelectorAll('input[name="mode"]');
    dom.metricsSection = $('metrics-section');
    dom.metricTotal = $('metric-total');
    dom.metricProcessed = $('metric-processed');
    dom.metricProcessedPct = $('metric-processed-pct');
    dom.metricActive = $('metric-active');
    dom.metricDivergent = $('metric-divergent');
    dom.metricCritical = $('metric-critical');
    dom.metricHealth = $('metric-health');
    dom.healthBarFill = $('health-bar-fill');
    dom.progressSection = $('progress-section');
    dom.progressBar = $('progress-bar');
    dom.progressCurrent = $('progress-current');
    dom.progressEta = $('progress-eta');
    dom.searchInput = $('search-input');
    dom.filterStatus = $('filter-status');
    dom.filterPriority = $('filter-priority');
    dom.filterVendedor = $('filter-vendedor');
    dom.tableCount = $('table-count');
    dom.tableBody = $('table-body');
    dom.tableWrapper = $('table-wrapper');
    dom.emptyState = $('empty-state');
    dom.pagination = $('pagination');
    dom.paginationPages = $('pagination-pages');
    dom.paginationInfo = $('pagination-info');
    dom.pageNext = $('page-next');
    dom.pagePrev = $('page-prev');
    dom.detailPanel = $('detail-panel');
    dom.detailOverlay = $('detail-overlay');
    dom.detailClose = $('detail-close');
    dom.detailTitle = $('detail-title');
    dom.detailCnpj = $('detail-cnpj');
    dom.detailStatusBadge = $('detail-status-badge');
    dom.detailPriorityBadge = $('detail-priority-badge');
    dom.detailRfbStatusBadge = $('detail-rfb-status-badge');
    dom.recText = $('rec-text');
    dom.internalDataFields = $('internal-data-fields');
    dom.officialDataFields = $('official-data-fields');
    dom.brasilapiExtendedData = $('brasilapi-extended-data');
    dom.brasilapiQsaData = $('brasilapi-qsa-data');
    dom.brasilapiContatoData = $('brasilapi-contato-data');
    dom.brasilapiCnaesData = $('brasilapi-cnaes-data');
    dom.divergencesSection = $('divergences-section');
    dom.divergencesList = $('divergences-list');
    dom.webIntelStatus = $('web-intel-status');
    dom.webIntelLink = $('web-intel-link');
    dom.webIntelSummary = $('web-intel-summary');
    dom.accordionHeader = $('accordion-header');
    dom.accordionBody = $('accordion-body');
    dom.receitaJson = $('receita-json');
    dom.toastContainer = $('toast-container');
    dom.recommendationCard = $('recommendation-card');
    dom.commercialInsightsSection = $('commercial-insights-section');
    dom.insightScoreVendas = $('insight-score-vendas');
    dom.insightScoreHigiene = $('insight-score-higiene');
    dom.insightDiasInativos = $('insight-dias-inativos');
    dom.insightPorte = $('insight-porte');
    dom.scoreBreakdownBars = $('score-breakdown-bars');
  }

  // ─── Initialization ─────────────────────────────────────────
  async function init() {
    cacheDom();
    bindEvents();
    await loadSession();
    updateMetrics();
    if (clients.length === 0) {
      showToast('Bem-vindo ao AuditBase! Importe um CSV para começar.', 'info');
    }
  }

  // ─── Event Binding ──────────────────────────────────────────
  function bindEvents() {
    // Upload
    dom.uploadArea.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleFileSelect);
    dom.uploadArea.addEventListener('dragover', handleDragOver);
    dom.uploadArea.addEventListener('dragleave', handleDragLeave);
    dom.uploadArea.addEventListener('drop', handleDrop);
    dom.fileRemove.addEventListener('click', handleFileRemove);
    dom.btnTemplate.addEventListener('click', () => Utils.downloadTemplateCSV());

    // Mode toggle
    dom.modeRadios.forEach(radio => {
      radio.addEventListener('change', handleModeChange);
    });

    // Processing
    dom.btnProcess.addEventListener('click', handleStartProcessing);
    dom.btnCancel.addEventListener('click', handleCancelProcessing);
    dom.btnRetry.addEventListener('click', handleRetryProcessing);

    // Unitário mode
    dom.btnSearchCnpj.addEventListener('click', handleSearchCnpj);
    dom.cnpjDirectInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSearchCnpj();
    });
    dom.cnpjDirectInput.addEventListener('input', handleCnpjInputFormat);

    // Table controls
    dom.searchInput.addEventListener('input', Utils.debounce(applyFilters, 300));
    dom.filterStatus.addEventListener('change', applyFilters);
    dom.filterPriority.addEventListener('change', applyFilters);
    dom.filterVendedor.addEventListener('change', applyFilters);

    // Pagination
    dom.pageNext.addEventListener('click', () => goToPage(currentPage + 1));
    dom.pagePrev.addEventListener('click', () => goToPage(currentPage - 1));

    // Detail panel
    dom.detailClose.addEventListener('click', closeDetailPanel);
    dom.detailOverlay.addEventListener('click', closeDetailPanel);
    dom.accordionHeader.addEventListener('click', toggleAccordion);

    // Export Dropdown
    if (dom.btnExport && dom.exportMenu) {
      dom.btnExport.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.exportMenu.classList.toggle('hidden');
      });
      document.addEventListener('click', () => {
        if (dom.exportMenu && !dom.exportMenu.classList.contains('hidden')) {
          dom.exportMenu.classList.add('hidden');
        }
      });
    }

    // Export Actions
    if (dom.btnExportCsv) dom.btnExportCsv.addEventListener('click', () => handleExport('csv'));
    if (dom.btnExportXlsx) dom.btnExportXlsx.addEventListener('click', () => handleExport('xlsx'));
    if (dom.btnExportJson) dom.btnExportJson.addEventListener('click', () => handleExport('json'));

    // Import Actions
    if (dom.btnImportResults) dom.btnImportResults.addEventListener('click', () => dom.importResultsInput.click());
    if (dom.importResultsInput) dom.importResultsInput.addEventListener('change', handleImportResults);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDetailPanel();
    });
  }

  // ─── File Upload Handlers ───────────────────────────────────
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.uploadArea.classList.add('dragover');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.uploadArea.classList.remove('dragover');
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
  }

  function processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      showToast('Formato inválido. Use arquivos .csv ou .xlsx', 'error');
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        let parsed;

        if (ext === 'csv') {
          // CSV: read as text
          parsed = Utils.parseCSV(e.target.result);
        } else {
          // XLSX/XLS: read as binary with SheetJS
          if (typeof XLSX === 'undefined') {
            showToast('Biblioteca SheetJS não carregada. Verifique a conexão com internet.', 'error');
            return;
          }
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
          // Normalize headers to lowercase
          parsed = jsonRows.map(row => {
            const normalized = {};
            for (const key of Object.keys(row)) {
              normalized[key.toLowerCase().trim()] = String(row[key]).trim();
            }
            return normalized;
          });
        }

        if (!parsed || parsed.length === 0) {
          showToast('Arquivo vazio ou sem dados válidos.', 'error');
          return;
        }

        // Validate that CNPJ column exists (accepting common variations)
        const hasCnpjCol = parsed[0].hasOwnProperty('cnpj') || parsed[0].hasOwnProperty('cgccpf') || parsed[0].hasOwnProperty('cpf_cnpj');
        if (!hasCnpjCol) {
          showToast('Coluna de CNPJ (cnpj, cgccpf) não encontrada. Verifique o formato do arquivo.', 'error');
          return;
        }

        // Initialize clients and results
        clients = parsed.map((row, i) => {
          const rawCnpj = row.cnpj || row.cgccpf || row.cpf_cnpj || '';
          return {
            index: i,
            cnpj: Utils.cleanCNPJ(rawCnpj),
            razao_social: row.razao_social || '', 
            nome_fantasia: row.nome_fantasia || row.fantasia || '',
            cep: row.cep || '',
            logradouro: row.logradouro || row.endereco || '',
            municipio: row.municipio || row.cidade || '',
            uf: row.uf || row.estado || '',
            cnae: row.cnae || '',
            // Extra fields from specific reference file
            vendedor: row.vendedor || row.codven || 'Sem Vendedor',
            codigo: row.codigo || '',
            codven: row.codven || '',
            ultcpr: row.ultcpr || '',
            datmaicpr: row.datmaicpr || ''
          };
        });

        results = clients.map(() => ({
          status: 'pending',
          priority: null,
          auditResult: null,
          error: null
        }));

        // Populate Vendedor Filter
        const vendedores = [...new Set(clients.map(c => c.vendedor).filter(Boolean))].sort();
        dom.filterVendedor.innerHTML = '<option value="">Todos os Vendedores</option>' + 
          vendedores.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');

        // Update UI
        dom.uploadArea.classList.add('has-file');
        dom.fileInfo.classList.remove('hidden');
        dom.fileName.textContent = file.name;
        dom.fileSize.textContent = `${parsed.length} registros · ${formatFileSize(file.size)}`;
        dom.btnProcess.disabled = false;
        dom.btnProcessText.textContent = 'Iniciar Processamento';
        dom.emptyState.classList.add('hidden');

        applyFilters();
        updateMetrics();
        renderDashboard();
        showToast(`${parsed.length} registros importados com sucesso!`, 'success');
        saveSession();

      } catch (err) {
        showToast(`Erro ao processar arquivo: ${err.message}`, 'error');
        console.error('File Parse Error:', err);
      }
    };

    // Read differently based on format
    if (ext === 'csv') {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  }

  function handleFileRemove(e) {
    e.stopPropagation();
    clients = [];
    results = [];
    filteredIndices = [];
    currentPage = 1;
    selectedIndex = -1;
    dom.uploadArea.classList.remove('has-file');
    dom.fileInfo.classList.add('hidden');
    dom.fileInput.value = '';
    dom.btnProcess.disabled = true;
    dom.btnExport.disabled = true;
    dom.btnRetry.classList.add('hidden');
    dom.emptyState.classList.remove('hidden');
    dom.tableBody.innerHTML = '';
    dom.pagination.classList.add('hidden');
    dom.tableCount.textContent = '';
    closeDetailPanel();
    updateMetrics();
    renderDashboard();
    clearSession();
    showToast('Arquivo removido.', 'info');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ─── Mode Toggle ────────────────────────────────────────────
  function handleModeChange() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    if (mode === 'unit') {
      dom.cnpjInputWrapper.classList.remove('hidden');
    } else {
      dom.cnpjInputWrapper.classList.add('hidden');
    }
  }

  // ─── CNPJ Input Formatting ─────────────────────────────────
  function handleCnpjInputFormat(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 14) value = value.slice(0, 14);

    let formatted = '';
    if (value.length > 0) formatted += value.slice(0, 2);
    if (value.length > 2) formatted += '.' + value.slice(2, 5);
    if (value.length > 5) formatted += '.' + value.slice(5, 8);
    if (value.length > 8) formatted += '/' + value.slice(8, 12);
    if (value.length > 12) formatted += '-' + value.slice(12, 14);

    e.target.value = formatted;
  }

  // ─── Unitário Search ────────────────────────────────────────
  async function handleSearchCnpj() {
    const rawCnpj = dom.cnpjDirectInput.value;
    const cnpj = Utils.cleanCNPJ(rawCnpj);

    if (!Utils.validateCNPJ(cnpj)) {
      showToast('CNPJ inválido. Verifique os dígitos.', 'error');
      return;
    }

    // Create a single client entry
    const clientData = {
      index: 0,
      cnpj: cnpj,
      razao_social: '',
      nome_fantasia: '',
      cep: '',
      logradouro: '',
      municipio: '',
      uf: '',
      cnae: ''
    };

    clients = [clientData];
    results = [{ status: 'processing', priority: null, auditResult: null, error: null }];

    applyFilters();
    updateMetrics();

    dom.btnSearchCnpj.disabled = true;
    dom.btnSearchCnpj.innerHTML = '<span class="spinner"></span> Consultando...';

    try {
      const result = await API.processClient(clientData);
      if (result._status === 'error') {
        results[0] = { status: 'error', priority: null, auditResult: null, error: result._errorMessage || result.acao_recomendada };
        showToast(`Erro: ${result._errorMessage || 'Falha na consulta'}`, 'error');
      } else {
        const hasDivergence = result.divergencias && result.divergencias.length > 0;
        const isInactive = result.status_receita !== 'ATIVA' && result.status_receita !== 'ERRO';
        let status = 'success';
        if (isInactive) status = 'inactive';
        else if (hasDivergence) status = 'divergence';

        result.vendedor = clients[0]?.vendedor || '';
        results[0] = { status, priority: result.prioridade_geral, auditResult: result, error: null };
        // Update internal data from official if empty
        if (!clientData.razao_social && result.dados_completos_receita) {
          clientData.razao_social = result.dados_completos_receita.razao_social || '';
          clientData.nome_fantasia = result.dados_completos_receita.nome_fantasia || '';
        }
        showToast('CNPJ consultado com sucesso!', 'success');
      }
    } catch (err) {
      results[0] = { status: 'error', priority: null, auditResult: null, error: err.message };
      showToast(`Erro inesperado: ${err.message}`, 'error');
    }

    dom.btnSearchCnpj.disabled = false;
    dom.btnSearchCnpj.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Consultar`;
    dom.btnExport.disabled = false;
    dom.emptyState.classList.add('hidden');

    applyFilters();
    updateMetrics();

    // Auto-open detail panel
    if (results[0].auditResult) {
      openDetailPanel(0);
    }
  }

  // ─── Batch Processing ───────────────────────────────────────
  async function handleStartProcessing() {
    if (clients.length === 0) return;

    isProcessing = true;
    processingStartTime = Date.now();

    // UI updates
    dom.btnProcess.classList.add('hidden');
    dom.btnCancel.classList.remove('hidden');
    dom.progressSection.classList.add('active');
    dom.uploadArea.style.pointerEvents = 'none';
    dom.uploadArea.style.opacity = '0.5';
    dom.fileRemove.style.pointerEvents = 'none';

    showToast('Processamento iniciado! Consultando BrasilAPI...', 'info');

    await API.processBatch(clients, onBatchProgress, {
      delayMs: 300,
      concurrency: 3,
      onStart: (idx) => {
        results[idx].status = 'processing';
        applyFilters();
        updateMetrics();
      }
    });

    // Processing finished
    isProcessing = false;
    dom.btnProcess.classList.remove('hidden');
    dom.btnCancel.classList.add('hidden');
    dom.btnProcess.disabled = true;
    dom.btnProcessText.textContent = 'Processamento Concluído';
    dom.uploadArea.style.pointerEvents = '';
    dom.uploadArea.style.opacity = '';
    dom.fileRemove.style.pointerEvents = '';
    dom.btnExport.disabled = false;

    // Show/hide retry if there are errors
    const hasErrors = results.some(r => r.status === 'error');
    if (hasErrors) {
      dom.btnRetry.classList.remove('hidden');
    } else {
      dom.btnRetry.classList.add('hidden');
    }

    // Keep progress bar visible for a moment
    dom.progressBar.style.width = '100%';
    dom.progressCurrent.textContent = 'Processamento concluído!';
    dom.progressEta.textContent = `Tempo total: ${formatDuration(Date.now() - processingStartTime)}`;

    const processed = results.filter(r => r.status !== 'pending' && r.status !== 'error').length;
    showToast(`Processamento finalizado! ${processed}/${clients.length} CNPJs com sucesso.`, 'success');

    renderDashboard();
    saveSession();
  }

  async function handleRetryProcessing() {
    if (clients.length === 0) return;

    const erroredIndices = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i] && results[i].status === 'error') {
        erroredIndices.push(i);
      }
    }

    if (erroredIndices.length === 0) {
      showToast('Nenhum erro cadastrado para reexecutar.', 'warning');
      return;
    }

    isProcessing = true;
    processingStartTime = Date.now();

    // UI updates
    dom.btnProcess.classList.add('hidden');
    dom.btnRetry.classList.add('hidden');
    dom.btnCancel.classList.remove('hidden');
    dom.progressSection.classList.add('active');
    dom.uploadArea.style.pointerEvents = 'none';
    dom.uploadArea.style.opacity = '0.5';
    dom.fileRemove.style.pointerEvents = 'none';

    showToast(`Reexecutando ${erroredIndices.length} itens que falharam...`, 'info');

    // Reset results of these indices back to pending state
    erroredIndices.forEach(idx => {
      results[idx] = {
        status: 'pending',
        priority: null,
        auditResult: null,
        error: null
      };
    });

    renderDashboard();

    await API.processBatch(clients, onBatchProgress, { 
      delayMs: 300, 
      concurrency: 3, 
      indices: erroredIndices,
      onStart: (idx) => {
        results[idx].status = 'processing';
        applyFilters();
        updateMetrics();
      }
    });

    // Processing finished
    isProcessing = false;
    dom.btnProcess.classList.remove('hidden');
    dom.btnCancel.classList.add('hidden');
    dom.btnProcess.disabled = true;
    dom.btnProcessText.textContent = 'Processamento Concluído';
    dom.uploadArea.style.pointerEvents = '';
    dom.uploadArea.style.opacity = '';
    dom.fileRemove.style.pointerEvents = '';
    dom.btnExport.disabled = false;

    // Show/hide retry if there are still errors
    const stillHasErrors = results.some(r => r.status === 'error');
    if (stillHasErrors) {
      dom.btnRetry.classList.remove('hidden');
    } else {
      dom.btnRetry.classList.add('hidden');
    }

    // Keep progress bar visible for a moment
    dom.progressBar.style.width = '100%';
    dom.progressCurrent.textContent = 'Processamento concluído!';
    dom.progressEta.textContent = `Tempo total: ${formatDuration(Date.now() - processingStartTime)}`;

    const processed = results.filter(r => r.status !== 'pending' && r.status !== 'error').length;
    showToast(`Processamento finalizado! ${processed}/${clients.length} CNPJs com sucesso.`, 'success');

    renderDashboard();
    saveSession();
  }

  function onBatchProgress(index, total, result) {
    // Update result for this client
    if (result._status === 'error') {
      results[index] = {
        status: 'error',
        priority: null,
        auditResult: null,
        error: result._errorMessage || 'Erro desconhecido'
      };
    } else {
      const hasDivergence = result.divergencias && result.divergencias.length > 0;
      const isInactive = result.status_receita !== 'ATIVA' && result.status_receita !== 'ERRO';
      let status = 'success';
      if (isInactive) status = 'inactive';
      else if (hasDivergence) status = 'divergence';

      result.vendedor = clients[index]?.vendedor || '';
      results[index] = {
        status,
        priority: result.prioridade_geral,
        auditResult: result,
        error: null
      };

      // Enrich client data if we got official data
      if (result.dados_completos_receita) {
        if (!clients[index].razao_social) {
          clients[index].razao_social = result.dados_completos_receita.razao_social || '';
        }
        if (!clients[index].nome_fantasia) {
          clients[index].nome_fantasia = result.dados_completos_receita.nome_fantasia || '';
        }
      }
    }

    // Next processing status is handled dynamically by onStart callback

    // Update progress
    const processed = index + 1;
    const pct = (processed / total * 100).toFixed(1);
    dom.progressBar.style.width = pct + '%';
    dom.progressCurrent.textContent = `Processando ${processed} de ${total}... (${Utils.formatCNPJ(clients[index].cnpj)})`;

    // ETA calculation
    const elapsed = Date.now() - processingStartTime;
    const avgTime = elapsed / processed;
    const remaining = avgTime * (total - processed);
    dom.progressEta.textContent = `Estimativa restante: ${formatDuration(remaining)}`;

    // Update table and metrics
    applyFilters();
    updateMetrics();
    renderDashboardThrottled();

    // If detail panel is open for this row, refresh it
    if (selectedIndex === index && results[index].auditResult) {
      populateDetailPanel(index);
    }
    saveSessionDebounced();
  }

  function handleCancelProcessing() {
    API.cancelBatch();
    isProcessing = false;
    dom.btnProcess.classList.remove('hidden');
    dom.btnCancel.classList.add('hidden');
    dom.btnProcessText.textContent = 'Retomar Processamento';
    dom.btnProcess.disabled = false;

    const hasErrors = results.some(r => r.status === 'error');
    if (hasErrors) {
      dom.btnRetry.classList.remove('hidden');
    } else {
      dom.btnRetry.classList.add('hidden');
    }

    dom.uploadArea.style.pointerEvents = '';
    dom.uploadArea.style.opacity = '';
    dom.fileRemove.style.pointerEvents = '';
    dom.btnExport.disabled = false;
    showToast('Processamento cancelado pelo usuário.', 'warning');
    saveSession();
  }

  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}min ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  }

  // ─── Metrics ────────────────────────────────────────────────
  function updateMetrics() {
    const total = clients.length;
    const processed = results.filter(r => r.status !== 'pending' && r.status !== 'processing').length;
    const active = results.filter(r => r.status === 'success').length;
    const divergent = results.filter(r => r.status === 'divergence').length;
    const critical = results.filter(r =>
      r.status === 'error' || r.status === 'inactive'
    ).length;

    animateCounter(dom.metricTotal, total);
    animateCounter(dom.metricProcessed, processed);
    animateCounter(dom.metricActive, active);
    animateCounter(dom.metricDivergent, divergent);
    animateCounter(dom.metricCritical, critical);

    if (processed > 0) {
      const pct = ((processed / total) * 100).toFixed(0);
      dom.metricProcessedPct.textContent = `${pct}% do total`;
    } else {
      dom.metricProcessedPct.textContent = '';
    }

    // Health score
    if (processed > 0) {
      const healthPct = ((active / processed) * 100).toFixed(0);
      dom.metricHealth.textContent = healthPct + '%';
      dom.healthBarFill.style.width = healthPct + '%';
    } else {
      dom.metricHealth.textContent = '—';
      dom.healthBarFill.style.width = '0%';
    }
  }

  function animateCounter(el, targetValue) {
    const currentValue = parseInt(el.textContent) || 0;
    if (currentValue === targetValue) return;

    const duration = 400;
    const startTime = performance.now();

    function step(timestamp) {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = Math.round(currentValue + (targetValue - currentValue) * eased);
      el.textContent = current;
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  // ─── Table Rendering ────────────────────────────────────────
  function applyFilters() {
    const searchTerm = dom.searchInput.value.toLowerCase().trim();
    const statusFilter = dom.filterStatus.value;
    const priorityFilter = dom.filterPriority.value;
    const vendedorFilter = dom.filterVendedor.value;

    filteredIndices = [];

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const result = results[i];

      // Search filter
      if (searchTerm) {
        const cnpjMatch = Utils.formatCNPJ(client.cnpj).toLowerCase().includes(searchTerm) ||
          client.cnpj.includes(searchTerm);
        const razaoMatch = (client.razao_social || '').toLowerCase().includes(searchTerm);
        const fantasiaMatch = (client.nome_fantasia || '').toLowerCase().includes(searchTerm);
        if (!cnpjMatch && !razaoMatch && !fantasiaMatch) continue;
      }

      // Status filter
      if (statusFilter && result.status !== statusFilter) continue;

      // Priority filter
      if (priorityFilter && result.priority !== priorityFilter) continue;

      // Vendedor filter
      if (vendedorFilter && (client.vendedor || '') !== vendedorFilter) continue;

      filteredIndices.push(i);
    }

    currentPage = 1;
    renderTable();
    updateTableCount();
    renderPagination();
  }

  function renderTable() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, filteredIndices.length);
    const pageIndices = filteredIndices.slice(start, end);

    if (pageIndices.length === 0 && clients.length === 0) {
      dom.emptyState.classList.remove('hidden');
      dom.tableBody.innerHTML = '';
      return;
    }

    dom.emptyState.classList.add('hidden');
    let html = '';

    for (const idx of pageIndices) {
      const client = clients[idx];
      const result = results[idx];
      const isHighlighted = result.priority === 'ALTA' || result.status === 'error' || result.status === 'inactive';
      const isActive = idx === selectedIndex;

      const diasInativos = result.auditResult?.score_breakdown?.diasInativos;
      const inativoText = diasInativos >= 0 ? `${diasInativos} d` : '<span class="text-muted">—</span>';
      
      const situacao = result.auditResult?.dados_completos_receita?.descricao_situacao_cadastral || '';
      let situacaoHtml = '<span class="text-muted">—</span>';
      if (situacao) {
        const bgClass = situacao === 'ATIVA' ? 'bg-success text-success' : 'bg-danger text-danger';
        situacaoHtml = `<span class="badge ${bgClass} bg-opacity-10" style="font-size: 0.7rem; padding: 2px 6px;">${situacao}</span>`;
      }

      html += `<tr class="${isHighlighted ? 'highlighted' : ''} ${isActive ? 'active-row' : ''}" data-index="${idx}" onclick="App.openDetailPanel(${idx})">`;
      html += `<td class="row-num">${idx + 1}</td>`;
      html += `<td class="cnpj-cell">${Utils.formatCNPJ(client.cnpj)}</td>`;
      html += `<td class="razao-cell" title="${escapeHtml(client.razao_social)}">${escapeHtml(client.razao_social) || '<span class="text-muted">—</span>'}</td>`;
      html += `<td title="${escapeHtml(client.vendedor)}">${escapeHtml(client.vendedor) || '<span class="text-muted">—</span>'}</td>`;
      html += `<td>${inativoText}</td>`;
      html += `<td>${situacaoHtml}</td>`;
      html += `<td>${renderStatusBadge(result.status)}</td>`;
      html += `<td>${result.priority ? renderPriorityBadge(result.priority) : '<span class="text-muted">—</span>'}</td>`;
      html += `<td>`;
      if (result.status === 'pending') {
        html += `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); App.processOne(${idx})">Processar</button>`;
      } else if (result.auditResult) {
        html += `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); App.openDetailPanel(${idx})">Ver</button>`;
      } else if (result.error) {
        html += `<span class="text-muted text-sm" title="${escapeHtml(result.error)}">Erro</span>`;
      }
      html += `</td>`;
      html += `</tr>`;
    }

    dom.tableBody.innerHTML = html;
  }

  function renderStatusBadge(status) {
    const config = {
      pending:    { label: 'Pendente' },
      processing: { label: 'Processando' },
      success:    { label: 'Sucesso' },
      divergence: { label: 'Divergência' },
      inactive:   { label: 'Inativo' },
      error:      { label: 'Erro API' },
    };
    const c = config[status] || config.pending;
    return `<span class="status-badge ${status}"><span class="status-dot"></span>${c.label}</span>`;
  }

  function renderPriorityBadge(priority) {
    const labels = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa', NENHUMA: 'Nenhuma' };
    return `<span class="priority-badge ${priority.toLowerCase()}">${labels[priority] || priority}</span>`;
  }

  function updateTableCount() {
    if (clients.length === 0) {
      dom.tableCount.textContent = '';
      return;
    }
    if (filteredIndices.length === clients.length) {
      dom.tableCount.textContent = `${clients.length} registros`;
    } else {
      dom.tableCount.textContent = `${filteredIndices.length} de ${clients.length} registros`;
    }
  }

  // ─── Pagination ─────────────────────────────────────────────
  function renderPagination() {
    const totalPages = Math.ceil(filteredIndices.length / PAGE_SIZE);

    if (totalPages <= 1) {
      dom.pagination.classList.add('hidden');
      return;
    }

    dom.pagination.classList.remove('hidden');
    dom.pagePrev.disabled = currentPage === 1;
    dom.pageNext.disabled = currentPage === totalPages;

    let pagesHtml = '';
    const maxButtons = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      pagesHtml += `<button class="pagination-btn ${p === currentPage ? 'active' : ''}" onclick="App.goToPage(${p})">${p}</button>`;
    }

    dom.paginationPages.innerHTML = pagesHtml;

    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, filteredIndices.length);
    dom.paginationInfo.textContent = `${start}–${end} de ${filteredIndices.length}`;
  }

  function goToPage(page) {
    const totalPages = Math.ceil(filteredIndices.length / PAGE_SIZE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
    renderPagination();
    dom.tableWrapper.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Process Single Client ──────────────────────────────────
  async function processOne(index) {
    if (results[index].status !== 'pending') return;

    results[index].status = 'processing';
    applyFilters();

    try {
      const result = await API.processClient(clients[index]);
      if (result._status === 'error') {
        results[index] = { status: 'error', priority: null, auditResult: null, error: result._errorMessage || 'Erro' };
      } else {
        const hasDivergence = result.divergencias && result.divergencias.length > 0;
        const isInactive = result.status_receita !== 'ATIVA' && result.status_receita !== 'ERRO';
        let status = 'success';
        if (isInactive) status = 'inactive';
        else if (hasDivergence) status = 'divergence';

        result.vendedor = clients[index]?.vendedor || '';
        results[index] = { status, priority: result.prioridade_geral, auditResult: result, error: null };

        // Enrich
        if (result.dados_completos_receita) {
          if (!clients[index].razao_social) {
            clients[index].razao_social = result.dados_completos_receita.razao_social || '';
          }
        }
      }
    } catch (err) {
      results[index] = { status: 'error', priority: null, auditResult: null, error: err.message };
    }

    applyFilters();
    updateMetrics();
    renderDashboard();
    dom.btnExport.disabled = false;
  }

  // ─── Detail Panel ───────────────────────────────────────────
  function openDetailPanel(index) {
    selectedIndex = index;
    dom.detailPanel.classList.add('open');
    dom.detailOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    populateDetailPanel(index);
    renderTable(); // Re-render to highlight active row
  }

  function closeDetailPanel() {
    selectedIndex = -1;
    dom.detailPanel.classList.remove('open');
    dom.detailOverlay.classList.remove('open');
    document.body.style.overflow = '';
    renderTable();
  }

  function populateDetailPanel(index) {
    const client = clients[index];
    const result = results[index];
    const audit = result.auditResult;

    // Header
    const displayName = client.razao_social ||
      (audit && audit.dados_completos_receita ? audit.dados_completos_receita.razao_social : '') ||
      'CNPJ não identificado';
    dom.detailTitle.textContent = displayName;
    dom.detailCnpj.textContent = Utils.formatCNPJ(client.cnpj);

    // Status & Priority
    if (result.status && result.status !== 'pending') {
      dom.detailRfbStatusBadge.className = 'badge';
      dom.detailRfbStatusBadge.innerHTML = '';
      dom.detailRfbStatusBadge.style.display = 'none';
      if (audit && audit.dados_completos_receita?.descricao_situacao_cadastral) {
        const situacao = audit.dados_completos_receita.descricao_situacao_cadastral;
        const bgClass = situacao === 'ATIVA' ? 'bg-success' : 'bg-danger';
        dom.detailRfbStatusBadge.className = `badge ${bgClass} text-white`;
        dom.detailRfbStatusBadge.textContent = situacao;
        dom.detailRfbStatusBadge.style.display = 'inline-block';
      }
      
      dom.detailStatusBadge.className = 'status-badge ' + result.status;
      dom.detailStatusBadge.innerHTML = renderStatusBadge(result.status);
      
      if (result.priority) {
        dom.detailPriorityBadge.className = 'priority-badge ' + result.priority.toLowerCase();
        dom.detailPriorityBadge.textContent = result.priority;
        dom.detailPriorityBadge.classList.remove('hidden');
      } else {
        dom.detailPriorityBadge.classList.add('hidden');
      }
    } else {
      if (dom.detailStatusRow) dom.detailStatusRow.classList.add('hidden');
    }

    if (!audit) {
      // No audit data yet
      dom.recText.textContent = result.error || 'Aguardando processamento...';
      dom.internalDataFields.innerHTML = renderFieldRows(getInternalFields(client));
      dom.officialDataFields.innerHTML = '<div class="empty-state-mini">Dados não disponíveis</div>';
      if (dom.brasilapiExtendedData) {
        dom.brasilapiExtendedData.innerHTML = '';
        dom.brasilapiQsaData.innerHTML = '';
        if (dom.brasilapiContatoData) dom.brasilapiContatoData.innerHTML = '';
        if (dom.brasilapiCnaesData) dom.brasilapiCnaesData.innerHTML = '';
      }
      dom.divergencesSection.classList.add('hidden');
      if (dom.commercialInsightsSection) dom.commercialInsightsSection.classList.add('hidden');
      dom.webIntelSummary.textContent = '—';
      dom.webIntelLink.classList.add('hidden');
      dom.webIntelStatus.innerHTML = '';
      dom.receitaJson.textContent = '—';
      dom.recommendationCard.classList.add('hidden');
      return;
    }

    // Recommendation
    dom.recommendationCard.classList.remove('hidden');
    dom.recText.textContent = audit.acao_recomendada || '—';

    // Commercial Insights
    if (dom.commercialInsightsSection) {
      if (audit.score_oportunidade !== undefined) {
        dom.commercialInsightsSection.classList.remove('hidden');
        dom.insightScoreVendas.textContent = audit.score_oportunidade;
        
        if (audit.score_higiene !== undefined) {
          dom.insightScoreHigiene.textContent = audit.score_higiene;
        }

        const inativos = audit.score_breakdown?.diasInativos;
        dom.insightDiasInativos.textContent = inativos >= 0 ? `${inativos} dias` : 'Sem histórico';
        
        dom.insightPorte.textContent = audit.score_breakdown?.porteDetectado || '—';

        // Render bars
        if (audit.score_breakdown) {
          const barsHtml = [
            { label: 'Recência', value: audit.score_breakdown.scoreRecencia === 'N/D' ? 0 : audit.score_breakdown.scoreRecencia, max: 100, color: 'cyan-500' },
            { label: 'Afinidade CNAE', value: audit.score_breakdown.scoreAfinidade, max: 100, color: 'blue-500' },
            { label: 'Porte', value: audit.score_breakdown.scorePorte, max: 100, color: 'indigo-400' },
            { label: 'Consistência', value: audit.score_breakdown.consistenciaCadastro, max: 40, color: 'emerald-400' },
            { label: 'Completude', value: audit.score_breakdown.completudeCadastro, max: 60, color: 'amber-400' }
          ].map(b => {
            const pct = Math.min(100, Math.round((b.value / b.max) * 100));
            return `
              <div class="score-bar-row">
                <div class="score-bar-label">${b.label}</div>
                <div class="score-bar-track">
                  <div class="score-bar-fill" style="width: ${pct}%; background-color: var(--${b.color});"></div>
                </div>
                <div class="score-bar-value">${b.value === 0 && b.label === 'Recência' ? 'N/D' : b.value + ' pts'}</div>
              </div>
            `;
          }).join('');
          dom.scoreBreakdownBars.innerHTML = barsHtml;
        }
      } else {
        dom.commercialInsightsSection.classList.add('hidden');
      }
    }

    // Internal Data
    dom.internalDataFields.innerHTML = renderFieldRows(getInternalFields(client));

    // Official Data
    const official = audit.dados_completos_receita || {};
    const divergentFields = (audit.divergencias || []).map(d => d.campo_com_divergencia);
    dom.officialDataFields.innerHTML = renderFieldRows(getOfficialFields(official), divergentFields);

    // BrasilAPI Extended Data
    if (dom.brasilapiExtendedData) {
      const formatCurrencyLocal = (val) => {
        const num = parseFloat(val);
        if (isNaN(num)) return 'Não informado';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
      };

      const formatBoolean = (val) => {
        if (val === true) return 'Sim';
        if (val === false) return 'Não';
        return 'N/D';
      };

      const extendedFields = [
        { label: 'Situação Cadastral', value: `${official.descricao_situacao_cadastral} (em ${Utils.parseDateFlexible(official.data_situacao_cadastral)?.toLocaleDateString('pt-BR') || official.data_situacao_cadastral})` },
        { label: 'Motivo Situação', value: official.descricao_motivo_situacao_cadastral || 'N/D' },
        { label: 'Abertura', value: Utils.parseDateFlexible(official.data_inicio_atividade)?.toLocaleDateString('pt-BR') || official.data_inicio_atividade },
        { label: 'Capital Social', value: formatCurrencyLocal(official.capital_social) },
        { label: 'Natureza Jurídica', value: official.natureza_juridica },
        { label: 'Simples Nacional', value: formatBoolean(official.opcao_pelo_simples) },
        { label: 'MEI', value: formatBoolean(official.opcao_pelo_mei) }
      ];
      
      dom.brasilapiExtendedData.innerHTML = renderFieldRows(extendedFields);

      // QSA Data
      const qsa = official.qsa;
      if (Array.isArray(qsa) && qsa.length > 0) {
        dom.brasilapiQsaData.innerHTML = qsa.map(s => `
          <div style="font-size: 0.85rem; padding: 4px 0; border-bottom: 1px dashed var(--border-subtle); display: flex; justify-content: space-between;">
            <span>${escapeHtml(s.nome_socio)}</span>
            <span style="color: var(--text-muted);">${escapeHtml(s.qualificacao_socio)}</span>
          </div>
        `).join('');
      } else {
        dom.brasilapiQsaData.innerHTML = '<div class="text-muted text-sm">Nenhum sócio listado no QSA.</div>';
      }

      // Contact Data
      if (dom.brasilapiContatoData) {
        let contactHtml = '';
        if (official.ddd_telefone_1) {
          const tel1 = official.ddd_telefone_1;
          contactHtml += `<div style="margin-bottom: 4px;">📞 <a href="tel:${tel1}" style="color: var(--cyan-400); text-decoration: none;">${escapeHtml(tel1)}</a></div>`;
        }
        if (official.ddd_telefone_2) {
          const tel2 = official.ddd_telefone_2;
          contactHtml += `<div style="margin-bottom: 4px;">📞 <a href="tel:${tel2}" style="color: var(--cyan-400); text-decoration: none;">${escapeHtml(tel2)}</a></div>`;
        }
        if (official.email) {
          const email = official.email.toLowerCase();
          contactHtml += `<div>✉️ <a href="mailto:${email}" style="color: var(--cyan-400); text-decoration: none;">${escapeHtml(email)}</a></div>`;
        }
        dom.brasilapiContatoData.innerHTML = contactHtml || '<div class="text-muted text-sm">Sem dados de contato.</div>';
      }

      // CNAEs Secundários
      if (dom.brasilapiCnaesData) {
        const cnaes = official.cnaes_secundarios;
        if (Array.isArray(cnaes) && cnaes.length > 0) {
          dom.brasilapiCnaesData.innerHTML = cnaes.map(c => `
            <div style="font-size: 0.8rem; padding: 4px 0; border-bottom: 1px dashed var(--border-subtle); color: var(--text-secondary);">
              ${c.codigo} - ${escapeHtml(c.descricao)}
            </div>
          `).join('');
        } else {
          dom.brasilapiCnaesData.innerHTML = '<div class="text-muted text-sm">Sem CNAEs secundários.</div>';
        }
      }
    }

    // Divergences
    const divergences = audit.divergencias || [];
    if (divergences.length > 0) {
      dom.divergencesSection.classList.remove('hidden');
      let divHtml = '';
      divergences.forEach(d => {
        divHtml += `
          <div class="divergence-item">
            <div class="divergence-field">${escapeHtml(d.campo_com_divergencia)}</div>
            <div class="divergence-values">
              <div class="divergence-internal">
                <span class="divergence-label">Interno:</span>
                <span class="divergence-value">${escapeHtml(d.valor_interno) || '—'}</span>
              </div>
              <div class="divergence-arrow">→</div>
              <div class="divergence-official">
                <span class="divergence-label">Oficial:</span>
                <span class="divergence-value">${escapeHtml(d.valor_oficial) || '—'}</span>
              </div>
            </div>
          </div>`;
      });
      dom.divergencesList.innerHTML = divHtml;
    } else {
      dom.divergencesSection.classList.add('hidden');
    }

    // Web Intelligence
    const webIntel = audit.inteligencia_web;
    if (webIntel) {
      const isActive = webIntel.indicios_de_operacao_ativa;
      dom.webIntelStatus.innerHTML = `
        <span class="dot ${isActive ? 'active' : 'inactive'}"></span>
        <span>${isActive ? 'Indícios de operação ativa' : 'Sem indícios de operação ativa'}</span>`;

      if (webIntel.link_principal_encontrado) {
        dom.webIntelLink.classList.remove('hidden');
        dom.webIntelLink.href = webIntel.link_principal_encontrado;
        dom.webIntelLink.textContent = '🔗 ' + webIntel.link_principal_encontrado;
      } else {
        dom.webIntelLink.classList.add('hidden');
      }

      dom.webIntelSummary.textContent = webIntel.resumo_da_atuacao || '—';
    }

    // Full Receita JSON
    dom.receitaJson.textContent = JSON.stringify(official, null, 2);

    // Collapse accordion by default
    dom.accordionBody.classList.remove('open');
    dom.accordionHeader.classList.remove('open');
  }

  function getInternalFields(client) {
    return [
      { label: 'Razão Social', value: client.razao_social },
      { label: 'Nome Fantasia', value: client.nome_fantasia },
      { label: 'Vendedor', value: client.vendedor },
      { label: 'CEP', value: client.cep },
      { label: 'Endereço', value: client.logradouro },
      { label: 'Município', value: client.municipio },
      { label: 'UF', value: client.uf },
      { label: 'CNAE', value: client.cnae },
      { label: 'Última Compra (ultcpr)', value: client.ultcpr },
      { label: 'Data Maior Compra (datmaicpr)', value: client.datmaicpr },
    ];
  }

  function getOfficialFields(official) {
    return [
      { label: 'Razão Social', value: official.razao_social, field: 'razao_social' },
      { label: 'Nome Fantasia', value: official.nome_fantasia, field: 'nome_fantasia' },
      { label: 'CEP', value: official.cep, field: 'cep' },
      { label: 'Endereço', value: [official.logradouro, official.numero].filter(Boolean).join(', '), field: 'logradouro' },
      { label: 'Município', value: official.municipio, field: 'municipio' },
      { label: 'UF', value: official.uf, field: 'uf' },
      { label: 'CNAE', value: official.cnae_fiscal_descricao, field: 'cnae' }
    ];
  }

  function renderFieldRows(fields, divergentFields = []) {
    return fields.map(f => {
      const isDivergent = divergentFields.includes(f.field);
      return `
        <div class="field-row ${isDivergent ? 'divergent' : ''}">
          <div class="field-label">${escapeHtml(f.label)} ${isDivergent ? '<span class="divergence-indicator">⚠️ divergente</span>' : ''}</div>
          <div class="field-value">${escapeHtml(f.value) || '<span class="text-muted">—</span>'}</div>
        </div>`;
    }).join('');
  }

  function toggleAccordion() {
    dom.accordionBody.classList.toggle('open');
    dom.accordionHeader.classList.toggle('open');
  }

  // ─── Export & Import ────────────────────────────────────────
  function handleExport(format) {
    if (dom.exportMenu) {
      dom.exportMenu.classList.add('hidden');
    }

    if (format === 'json') {
      // Export the full application state
      if (clients.length === 0) {
        showToast('Nenhum dado para exportar.', 'warning');
        return;
      }
      const state = {
        timestamp: new Date().toISOString(),
        clients: clients,
        results: results
      };
      Utils.exportToJSON(state, `auditbase_state_${state.timestamp.slice(0, 10)}.json`);
      showToast('Estado completo exportado em JSON.', 'success');
      return;
    }

    const exportResults = [];
    for (let i = 0; i < clients.length; i++) {
      if (results[i] && results[i].auditResult) {
        exportResults.push(results[i].auditResult);
      }
    }
    if (exportResults.length === 0) {
      showToast('Nenhum resultado processado para exportar.', 'warning');
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      const csv = Utils.exportToCSV(exportResults);
      Utils.downloadCSV(csv, `auditbase_resultados_${timestamp}.csv`);
      showToast(`${exportResults.length} resultados exportados em CSV!`, 'success');
    } else if (format === 'xlsx') {
      console.log('[AuditBase] Solicitando exportação XLSX para', clients.length, 'clientes e', results.length, 'resultados.');
      Utils.exportToXLSX(clients, results, `auditbase_resultados_${timestamp}.xlsx`);
      showToast(`${clients.length} registros exportados em Excel!`, 'success');
    }
  }

  function handleImportResults(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop().toLowerCase();
    
    if (fileExt === 'json') {
      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const state = JSON.parse(event.target.result);
          if (state.clients && state.results) {
            clients = state.clients;
            results = state.results;
            
            // Re-render UI
            dom.uploadArea.style.display = 'none';
            dom.fileInfo.classList.remove('hidden');
            dom.fileName.textContent = file.name;
            dom.fileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
            
            currentPage = 1;
            updateMetrics();
            applyFilters();
            renderDashboard();

            dom.btnProcess.disabled = true;
            dom.btnExport.disabled = false;
            
            const hasErrors = results.some(r => r.status === 'error');
            if (hasErrors) {
              dom.btnRetry.classList.remove('hidden');
            } else {
              dom.btnRetry.classList.add('hidden');
            }
            
            showToast('Análise JSON importada com sucesso!', 'success');
            saveSession();
          } else {
            showToast('Arquivo JSON inválido. Formato esperado não encontrado.', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Erro ao ler arquivo JSON.', 'error');
        }
      };
      reader.readAsText(file);
    } else if (fileExt === 'xlsx') {
      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (rows.length < 2) {
            showToast('Arquivo Excel vazio ou sem dados.', 'error');
            return;
          }
          
          const headers = rows[0];
          
          clients = [];
          results = [];
          
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const getVal = (colName) => {
              const idx = headers.indexOf(colName);
              return idx >= 0 ? row[idx] || '' : '';
            };
            
            const cnpj = getVal('CNPJ');
            if (!cnpj) continue;
            
            const client = {
              cgcCpf: cnpj,
              razao: getVal('Interno_Razao_Social'),
              vendedor: getVal('Vendedor_Responsavel'),
              cidade: getVal('Interno_Município'),
              estado: getVal('Interno_UF'),
            };
            
            const statusGeral = getVal('Status_Geral');
            let isDivergent = false;
            if (statusGeral === 'divergence') isDivergent = true;
            
            const result = {
              status: statusGeral === 'error' ? 'error' : 'success',
              isDivergent: isDivergent,
              auditResult: {
                cnpj: cnpj,
                status_geral: statusGeral,
                status_receita: getVal('Status_Receita'),
                prioridade: getVal('Prioridade_Contato'),
                score: parseInt(getVal('Score_Reativacao'), 10) || 0,
                vendedor_responsavel: getVal('Vendedor_Responsavel'),
                recomendacao: getVal('Recomendacao'),
                divergences: getVal('Divergencias') ? getVal('Divergencias').split(', ') : [],
                internalData: {
                  razao_social: getVal('Interno_Razao_Social'),
                  nome_fantasia: getVal('Interno_Nome_Fantasia'),
                  cep: getVal('Interno_CEP'),
                  logradouro: getVal('Interno_Endereço'),
                  municipio: getVal('Interno_Município'),
                  uf: getVal('Interno_UF'),
                  cnae: getVal('Interno_CNAE')
                },
                officialData: {
                  razao_social: getVal('Receita_Razao_Social'),
                  nome_fantasia: getVal('Receita_Nome_Fantasia'),
                  cep: getVal('Receita_CEP'),
                  logradouro: getVal('Receita_Endereço'),
                  municipio: getVal('Receita_Município'),
                  uf: getVal('Receita_UF'),
                  cnae_fiscal_descricao: getVal('Receita_CNAE')
                },
                observacoes: getVal('Observacoes')
              }
            };
            
            clients.push(client);
            results.push(result);
          }
          
          dom.uploadArea.style.display = 'none';
          dom.fileInfo.classList.remove('hidden');
          dom.fileName.textContent = file.name;
          dom.fileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
          
          currentPage = 1;
          updateMetrics();
          applyFilters();
          
          dom.btnProcess.disabled = true;
          dom.btnExport.disabled = false;
          
          showToast(`Arquivo Excel importado com ${clients.length} registros!`, 'success');
          saveSession();
          
        } catch (err) {
          console.error(err);
          showToast('Erro ao processar arquivo XLSX.', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      showToast('Formato não suportado para importação.', 'error');
    }
    
    // Reset file input
    e.target.value = '';
  }

  // ─── Toast Notifications ────────────────────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-message">${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ─── Session Caching ────────────────────────────────────────
  // Helper for IndexedDB
  const DB = {
    dbName: 'AuditBaseDB',
    storeName: 'sessionStore',
    db: null,

    init() {
      return new Promise((resolve, reject) => {
        if (this.db) return resolve(this.db);
        const request = indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    },

    get(key) {
      return this.init().then((db) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(this.storeName, 'readonly');
          const store = transaction.objectStore(this.storeName);
          const request = store.get(key);
          request.onsuccess = (e) => resolve(e.target.result);
          request.onerror = (e) => reject(e.target.error);
        });
      });
    },

    set(key, value) {
      return this.init().then((db) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(this.storeName, 'readwrite');
          const store = transaction.objectStore(this.storeName);
          const request = store.put(value, key);
          request.onsuccess = () => resolve();
          request.onerror = (e) => reject(e.target.error);
        });
      });
    },

    delete(key) {
      return this.init().then((db) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(this.storeName, 'readwrite');
          const store = transaction.objectStore(this.storeName);
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = (e) => reject(e.target.error);
        });
      });
    }
  };

  async function saveSession() {
    if (clients.length === 0) return;
    const sessionState = {
      clients: clients,
      results: results,
      fileName: dom.fileName.textContent || '',
      fileSize: dom.fileSize.textContent || ''
    };
    try {
      await DB.set('auditbase_session', sessionState);
    } catch (e) {
      console.error('Erro ao salvar sessão no IndexedDB:', e);
    }
  }

  async function clearSession() {
    try {
      await DB.delete('auditbase_session');
    } catch (e) {
      console.error('Erro ao limpar sessão do IndexedDB:', e);
    }
  }

  async function loadSession() {
    try {
      const state = await DB.get('auditbase_session');
      if (!state) return;
      if (state && state.clients && state.results) {
        clients = state.clients;
        results = state.results;
        
        // Restore UI
        dom.emptyState.classList.add('hidden');
        dom.fileInfo.classList.remove('hidden');
        dom.fileName.textContent = state.fileName || 'Sessão anterior';
        dom.fileSize.textContent = state.fileSize || '';
        
        dom.btnExport.disabled = false;
        
        const hasErrors = results.some(r => r.status === 'error');
        const isDone = results.every(r => r.status !== 'pending');
        
        if (isDone) {
          dom.btnProcess.disabled = true;
          dom.btnProcessText.textContent = 'Processamento Concluído';
        } else {
          dom.btnProcess.disabled = false;
          dom.btnProcessText.textContent = 'Retomar Processamento';
        }
        
        if (hasErrors) {
          dom.btnRetry.classList.remove('hidden');
        } else {
          dom.btnRetry.classList.add('hidden');
        }
        
        // Populate Vendedor Filter
        const vendedores = [...new Set(clients.map(c => c.vendedor).filter(Boolean))].sort();
        dom.filterVendedor.innerHTML = '<option value="">Todos os Vendedores</option>' + 
          vendedores.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
          
        applyFilters();
        showToast('Sessão anterior recuperada do navegador!', 'success');
      }
    } catch (e) {
      console.error('Erro ao ler sessão do IndexedDB:', e);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Public API ─────────────────────────────────────────────
  return {
    init,
    openDetailPanel,
    closeDetailPanel,
    goToPage,
    processOne,
    showToast
  };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
