/**
 * @file dashboard.js
 * @description Camada de visualização do AuditBase (UI/UX v2).
 *
 * Responsável por:
 *   • Navegação por abas (Visão Geral / Carteira / Inteligência / Plano de Ação)
 *   • Gráficos agregados (Chart.js) da aba Visão Geral
 *   • Painéis de inferência (sócios, redes, vendedores, anomalias, capital)
 *   • Worklist priorizada (Plano de Ação) com exportação
 *
 * Consome Insights.computeInsights(results). Carregar depois de insights.js.
 */

const Dashboard = (function () {
  'use strict';

  const PALETTE = {
    blue: '#60a5fa', purple: '#a78bfa', green: '#34d399', yellow: '#fbbf24',
    red: '#f87171', cyan: '#22d3ee', orange: '#fb923c', gray: '#94a3b8',
    pink: '#f472b6', indigo: '#818cf8',
  };
  const SERIES = Object.values(PALETTE);

  const _charts = {};
  let _lastInsights = null;
  let _threshold = 35; // score mínimo padrão (moderado) para exibir na fila

  const $ = (id) => document.getElementById(id);
  const fmtInt = (n) => Number(n || 0).toLocaleString('pt-BR');
  const fmtBRL = (n) =>
    Number(n || 0).toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
    });
  const esc = (s) => {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };

  // ───────────────────────────────────────────────
  // Navegação por abas
  // ───────────────────────────────────────────────

  function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === name)
    );
    document.querySelectorAll('.tab-panel').forEach((p) =>
      p.classList.toggle('active', p.id === `tab-${name}`)
    );
  }

  // ───────────────────────────────────────────────
  // Chart.js helpers
  // ───────────────────────────────────────────────

  function _setChartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family =
      "'Inter', system-ui, sans-serif";
    Chart.defaults.borderColor = 'rgba(148,163,184,0.12)';
  }

  function _chart(id, config) {
    if (!window.Chart) return;
    const el = $(id);
    if (!el) return;
    if (_charts[id]) _charts[id].destroy();
    _charts[id] = new Chart(el.getContext('2d'), config);
  }

  function _doughnut(id, data, colors) {
    _chart(id, {
      type: 'doughnut',
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          data: data.map((d) => d.value),
          backgroundColor: colors || SERIES,
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } } },
      },
    });
  }

  function _bar(id, labels, values, color, horizontal) {
    _chart(id, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: color || PALETTE.blue,
          borderRadius: 6,
          maxBarThickness: 38,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: !horizontal }, ticks: { precision: 0 } },
          y: { grid: { display: horizontal }, ticks: { precision: 0 } },
        },
      },
    });
  }

  // ───────────────────────────────────────────────
  // Render principal
  // ───────────────────────────────────────────────

  function render(results) {
    if (!window.Insights) return;
    const ins = Insights.computeInsights(results);
    _lastInsights = ins;
    _setChartDefaults();

    const has = ins.totalValidos > 0;
    document.querySelectorAll('.needs-data').forEach((el) =>
      el.classList.toggle('hidden', !has)
    );
    document.querySelectorAll('.empty-dash').forEach((el) =>
      el.classList.toggle('hidden', has)
    );
    if (!has) return;

    renderOverview(ins);
    renderIntel(ins);
    renderPlano(ins);
  }

  // ── Aba Visão Geral ─────────────────────────────
  function renderOverview(ins) {
    const c = ins.capital;
    setKpi('kpi-potencial', fmtBRL(c.potencialAtivo));
    setKpi('kpi-quente', fmtBRL(c.quenteAlto));
    setKpi('kpi-risco', fmtBRL(c.emRiscoInativo));
    setKpi('kpi-grupos', fmtInt(ins.socios.totalGrupos));
    setKpi('kpi-reabertas', fmtInt(ins.socios.reabertas.length));
    setKpi('kpi-dormentes', fmtInt(ins.anomalias.dormentes.length));

    const situacaoColors = ins.distributions.situacao.map((d) =>
      d.label === 'ATIVA' ? PALETTE.green :
      d.label === 'BAIXADA' || d.label === 'NULA' ? PALETTE.red :
      d.label === 'SUSPENSA' ? PALETTE.orange :
      d.label === 'INAPTA' ? PALETTE.purple : PALETTE.gray
    );
    _doughnut('chart-situacao', ins.distributions.situacao, situacaoColors);

    const prioColors = ins.distributions.prioridade.map((d) =>
      d.label === 'ALTA' ? PALETTE.red :
      d.label === 'MEDIA' ? PALETTE.yellow :
      d.label === 'BAIXA' ? PALETTE.green :
      d.label === 'DESCARTE' ? PALETTE.gray : PALETTE.blue
    );
    _doughnut('chart-prioridade', ins.distributions.prioridade, prioColors);
    _doughnut('chart-regime', ins.distributions.regime,
      [PALETTE.cyan, PALETTE.indigo, PALETTE.gray]);

    const co = ins.cohorts;
    _bar('chart-cohorts', Object.keys(co), Object.values(co), PALETTE.purple);

    const sh = ins.distributions.scoreHist;
    _bar('chart-score', Object.keys(sh), Object.values(sh), PALETTE.blue);

    _bar('chart-porte',
      ins.distributions.porte.map((d) => d.label),
      ins.distributions.porte.map((d) => d.value), PALETTE.cyan);

    _bar('chart-uf',
      ins.geografia.uf.slice(0, 10).map((d) => d.label),
      ins.geografia.uf.slice(0, 10).map((d) => d.value), PALETTE.green, true);

    _bar('chart-segmentos',
      ins.segmentos.map((d) => d.label.length > 32 ? d.label.slice(0, 32) + '…' : d.label),
      ins.segmentos.map((d) => d.value), PALETTE.indigo, true);
  }

  function setKpi(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  // ── Aba Inteligência ────────────────────────────
  function renderIntel(ins) {
    renderVendedores(ins.vendedores);
    renderReabertas(ins.socios.reabertas);
    renderGrupos(ins.socios.grupos);
    renderRedes(ins.redes);
    renderAnomalias(ins.anomalias);
  }

  function renderVendedores(vend) {
    const el = $('intel-vendedores');
    if (!el) return;
    if (!vend.length) { el.innerHTML = '<p class="muted">Sem dados de vendedor.</p>'; return; }
    let h = `<table class="intel-table"><thead><tr>
      <th>Vendedor</th><th>Clientes</th><th>% Ativos</th><th>Quentes</th>
      <th>Score médio</th><th>Divergências</th><th>Capital carteira</th></tr></thead><tbody>`;
    for (const v of vend) {
      const healthColor = v.pctAtivo >= 70 ? 'ok' : v.pctAtivo >= 40 ? 'warn' : 'bad';
      h += `<tr>
        <td><strong>${esc(v.vendedor)}</strong></td>
        <td>${fmtInt(v.total)}</td>
        <td><span class="pill ${healthColor}">${v.pctAtivo}%</span></td>
        <td>${v.quentes ? `<span class="pill hot">${v.quentes}</span>` : '0'}</td>
        <td>${v.scoreMedio}</td>
        <td>${fmtInt(v.divergencias)}</td>
        <td>${fmtBRL(v.capital)}</td>
      </tr>`;
    }
    h += '</tbody></table>';
    el.innerHTML = h;
  }

  function renderReabertas(reabertas) {
    const el = $('intel-reabertas');
    if (!el) return;
    if (!reabertas.length) {
      el.innerHTML = '<p class="muted">Nenhum indício de empresa reaberta encontrado nesta base. ' +
        'Esta inferência liga um CNPJ baixado/inapto a um CNPJ <em>ativo</em> que compartilha o mesmo sócio.</p>';
      return;
    }
    let h = '';
    for (const r of reabertas) {
      h += `<div class="reaberta-card">
        <div class="reaberta-head">👤 ${esc(r.socio)}</div>
        <div class="reaberta-cols">
          <div><div class="reaberta-tag bad">CNPJ(s) inativo(s)</div>
            ${r.inativas.map((e) => `<div class="reaberta-line">${esc(e.razao)} <span class="muted">(${esc(e.situacao)})</span><br><code>${esc(e.cnpj)}</code></div>`).join('')}
          </div>
          <div class="reaberta-arrow">➜</div>
          <div><div class="reaberta-tag ok">Provável reabertura (ATIVA)</div>
            ${r.ativas.map((e) => `<div class="reaberta-line">${esc(e.razao)}<br><code>${esc(e.cnpj)}</code> · score ${e.score}</div>`).join('')}
          </div>
        </div>
      </div>`;
    }
    el.innerHTML = h;
  }

  function renderGrupos(grupos) {
    const el = $('intel-socios');
    if (!el) return;
    if (!grupos.length) {
      el.innerHTML = '<p class="muted">Nenhum sócio compartilhado entre 2+ CNPJs nesta base.</p>';
      return;
    }
    let h = '';
    for (const g of grupos) {
      h += `<div class="grupo-card">
        <div class="grupo-head">👥 ${esc(g.socio)}
          <span class="grupo-badge">${g.qtde} CNPJs · ${g.ativas} ativos</span></div>
        <div class="grupo-empresas">
          ${g.empresas.map((e) => `<span class="grupo-chip ${e.ativo ? 'ok' : 'bad'}" title="${esc(e.cnpj)}">${esc(e.razao)}</span>`).join('')}
        </div></div>`;
    }
    el.innerHTML = h;
  }

  function renderRedes(redes) {
    const el = $('intel-redes');
    if (!el) return;
    if (!redes.length) {
      el.innerHTML = '<p class="muted">Nenhuma rede matriz/filial detectada (CNPJs com a mesma raiz de 8 dígitos).</p>';
      return;
    }
    let h = '';
    for (const r of redes) {
      h += `<div class="rede-card">
        <div class="rede-head">🏢 ${esc(r.razao)}
          <span class="grupo-badge">${r.unidades} unidades · ${r.ativas} ativas</span></div>
        <div class="grupo-empresas">
          ${r.estabelecimentos.map((e) => `<span class="grupo-chip ${e.ativo ? 'ok' : 'bad'}">${e.matriz ? '★ Matriz' : 'Filial'} · ${esc(e.cnpj)}</span>`).join('')}
        </div></div>`;
    }
    el.innerHTML = h;
  }

  function renderAnomalias(an) {
    _anomBlock('anom-dormentes', an.dormentes, (x) =>
      `${esc(x.razao)} <span class="muted">— inativo há ${x.dias}d, afinidade ${x.afinidade} · ${esc(x.vendedor)}</span>`);
    _anomBlock('anom-reativadas', an.recemReativadas, (x) =>
      `${esc(x.razao)} <span class="muted">— situação alterada há ${x.diasSituacao}d · ${esc(x.vendedor)}</span>`);
    _anomBlock('anom-semcontato', an.semContato, (x) =>
      `${esc(x.razao)} <span class="muted">— score ${x.score}, sem telefone/e-mail · ${esc(x.vendedor)}</span>`);
    _anomBlock('anom-grandesinativas', an.grandesInativas, (x) =>
      `${esc(x.razao)} <span class="muted">— ${esc(x.situacao)}, capital ${fmtBRL(x.capital)}</span>`);
  }

  function _anomBlock(id, items, fmt) {
    const el = $(id);
    if (!el) return;
    if (!items.length) { el.innerHTML = '<li class="muted">Nenhum registro.</li>'; return; }
    el.innerHTML = items.slice(0, 12).map((x) => `<li>${fmt(x)}</li>`).join('');
  }

  // ── Aba Plano de Ação ───────────────────────────
  function renderPlano(ins) {
    const { fila, inaptas } = ins.planoAcao;
    const sel = $('plano-vendedor');
    if (sel) {
      const atual = sel.value;
      const vends = Array.from(new Set(fila.map((x) => x.vendedor))).sort();
      sel.innerHTML = '<option value="">Todos os vendedores</option>' +
        vends.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
      sel.value = atual || '';
    }
    _drawPlano(fila, sel ? sel.value : '', _threshold);
    _drawInaptas(inaptas);
    const visivel = fila.filter((x) => x.score >= _threshold).length;
    setKpi('plano-count', `${visivel} de ${fila.length} cliente(s) na fila`);
  }

  function _drawPlano(fila, vendFilter, threshold) {
    const el = $('plano-table');
    if (!el) return;
    let rows = vendFilter ? fila.filter((x) => x.vendedor === vendFilter) : fila;
    if (!rows.length) { el.innerHTML = '<p class="muted">Sem clientes priorizados.</p>'; return; }

    let h = `<table class="intel-table"><thead><tr>
      <th>Prioridade</th><th>Cliente</th><th>Sócio / Responsável</th><th>Vendedor</th>
      <th>Score</th><th>Telefone</th><th>Ação recomendada</th></tr></thead><tbody>`;
    for (const x of rows) {
      const aboveThreshold = x.score >= threshold;
      const pillClass = x.prioridade === 'ALTA' ? 'hot' : x.prioridade === 'MEDIA' ? 'warn' : 'ok';
      const rowClass = aboveThreshold ? '' : 'below-threshold';
      h += `<tr class="${rowClass}">
        <td><span class="pill ${pillClass}">${esc(x.prioridade)}</span></td>
        <td><strong>${esc(x.razao)}</strong><br><code class="muted">${esc(x.cnpj)}</code></td>
        <td>${x.socio ? esc(x.socio) : '<span class="muted">—</span>'}</td>
        <td>${esc(x.vendedor)}</td>
        <td><strong>${x.score}</strong></td>
        <td>${x.telefone ? `<a href="tel:${esc(x.telefone)}" style="color:var(--cyan-400)">${esc(x.telefone)}</a>` : '<span class="muted">—</span>'}</td>
        <td class="acao-cell">${esc(x.acao)}</td>
      </tr>`;
    }
    h += '</tbody></table>';
    el.innerHTML = h;
  }

  function _drawInaptas(inaptas) {
    const el = $('plano-inaptas');
    if (!el) return;
    if (!inaptas.length) {
      el.innerHTML = '<p class="muted">Nenhuma empresa INAPTA nesta base.</p>';
      return;
    }
    let h = `<table class="intel-table"><thead><tr>
      <th>Cliente</th><th>Sócio / Responsável</th><th>Vendedor</th>
      <th>Score</th><th>Telefone</th><th>Gancho de abordagem</th></tr></thead><tbody>`;
    for (const x of inaptas) {
      h += `<tr>
        <td><strong>${esc(x.razao)}</strong><br><code class="muted">${esc(x.cnpj)}</code></td>
        <td>${x.socio ? esc(x.socio) : '<span class="muted">—</span>'}</td>
        <td>${esc(x.vendedor)}</td>
        <td>${x.score}</td>
        <td>${x.telefone ? `<a href="tel:${esc(x.telefone)}" style="color:var(--cyan-400)">${esc(x.telefone)}</a>` : '<span class="muted">—</span>'}</td>
        <td class="acao-cell">${esc(x.acao)}</td>
      </tr>`;
    }
    h += '</tbody></table>';
    el.innerHTML = h;
  }

  function exportPlano() {
    if (!_lastInsights) return;
    const sel = $('plano-vendedor');
    const f = sel ? sel.value : '';
    const { fila } = _lastInsights.planoAcao;
    const rows = (f ? fila.filter((x) => x.vendedor === f) : fila).filter((x) => x.score >= _threshold);
    if (!rows.length) return;
    const headers = ['prioridade', 'razao_social', 'cnpj', 'socio', 'vendedor', 'score', 'higiene', 'situacao', 'telefone', 'acao_recomendada'];
    const esc2 = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '﻿' + headers.join(',') + '\n' +
      rows.map((x) => [x.prioridade, x.razao, x.cnpj, x.socio, x.vendedor, x.score, x.higiene, x.situacao, x.telefone, x.acao].map(esc2).join(',')).join('\n');
    if (window.Utils && Utils.downloadCSV) Utils.downloadCSV(csv, 'plano_de_acao_vpa.csv');
  }

  function initPlanoControls() {
    const sel = $('plano-vendedor');
    if (sel) sel.addEventListener('change', () => {
      if (_lastInsights) {
        const { fila } = _lastInsights.planoAcao;
        _drawPlano(fila, sel.value, _threshold);
        const visivel = fila.filter((x) => x.score >= _threshold).length;
        setKpi('plano-count', `${visivel} de ${fila.length} cliente(s) na fila`);
      }
    });

    const slider = $('threshold-slider');
    const sliderVal = $('threshold-val');
    if (slider) {
      slider.addEventListener('input', () => {
        _threshold = parseInt(slider.value, 10);
        if (sliderVal) sliderVal.textContent = _threshold;
        if (_lastInsights) {
          const sel2 = $('plano-vendedor');
          const { fila } = _lastInsights.planoAcao;
          _drawPlano(fila, sel2 ? sel2.value : '', _threshold);
          const visivel = fila.filter((x) => x.score >= _threshold).length;
          setKpi('plano-count', `${visivel} de ${fila.length} cliente(s) na fila`);
        }
      });
    }

    const btn = $('plano-export');
    if (btn) btn.addEventListener('click', exportPlano);
  }

  function init() {
    initTabs();
    initPlanoControls();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { render, switchTab };
})();

if (typeof window !== 'undefined') window.Dashboard = Dashboard;
