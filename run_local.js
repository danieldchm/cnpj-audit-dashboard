/**
 * run_local.js — Suíte de testes locais do AuditBase (engine lógica).
 *
 * Carrega utils.js, insights.js e api.js num contexto de VM (sem DOM) e exercita
 * validação de CNPJ (numérico e alfanumérico jul/2026), parsing de CSV/datas,
 * scoring v2, divergências, inferências agregadas e o mapeamento de erros da API.
 *
 * Uso: node run_local.js
 */
const fs = require('fs');
const vm = require('vm');

console.log('--- Carregando módulos do dashboard na VM ---');

/** Carrega um módulo IIFE expondo `const <name> =` como variável no contexto. */
function loadModule(file, name, extra = {}) {
  let code = fs.readFileSync(file, 'utf8').replace(`const ${name} =`, `var ${name} =`);
  const ctx = Object.assign(
    { console, setTimeout, clearTimeout, Date, Math, Intl },
    extra
  );
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  if (!ctx[name]) {
    console.error(`ERRO: não foi possível carregar ${name} de ${file}`);
    process.exit(1);
  }
  return ctx[name];
}

const Utils = loadModule('utils.js', 'Utils');
console.log('✅ utils.js carregado.');
const Insights = loadModule('insights.js', 'Insights', { Utils });
console.log('✅ insights.js carregado.');

// API com fetch mockável (substituído nos testes de API no final)
let apiCode = fs.readFileSync('api.js', 'utf8').replace('const API =', 'var API =');
const apiContext = {
  console, setTimeout, clearTimeout, Date, Math, Intl, Utils,
  fetch: async () => ({ status: 404, ok: false, statusText: 'Not Found' }),
  AbortController: typeof AbortController !== 'undefined' ? AbortController : undefined,
};
vm.createContext(apiContext);
vm.runInContext(apiCode, apiContext);
const API = apiContext.API;
console.log('✅ api.js carregado.');

// ─── Mini framework ──────────────────────────────────────────
let testsPassed = 0;
let testsFailed = 0;
function assert(condition, message) {
  if (condition) { console.log(`  [OK] ${message}`); testsPassed++; }
  else { console.error(`  [FALHA] ${message}`); testsFailed++; }
}
function section(t) { console.log(`\n--- ${t} ---`); }

// ═══════════════════════════════════════════════════════════
// 1. Validação de CNPJ — numérico
// ═══════════════════════════════════════════════════════════
section('Validação de CNPJ (numérico)');
assert(Utils.validateCNPJ('33.000.167/0001-01') === true, 'Petrobras válido');
assert(Utils.validateCNPJ('47.960.950/0001-21') === true, 'Magalu válido');
assert(Utils.validateCNPJ('07.526.557/0001-00') === true, 'Ambev válido');
assert(Utils.validateCNPJ('00.000.000/0001-91') === true, 'Banco do Brasil válido (zeros à esquerda)');
assert(Utils.validateCNPJ('00.000.000/0000-00') === false, 'zeros inválido');
assert(Utils.validateCNPJ('11.111.111/1111-11') === false, 'dígitos iguais inválido');
assert(Utils.validateCNPJ('33.000.167/0001-00') === false, 'DV incorreto inválido');
assert(Utils.validateCNPJ('33.000.167/0001') === false, 'curto demais inválido');

// ═══════════════════════════════════════════════════════════
// 2. Validação de CNPJ — ALFANUMÉRICO (novo padrão jul/2026)
// ═══════════════════════════════════════════════════════════
section('Validação de CNPJ (alfanumérico — jul/2026)');
assert(Utils.validateCNPJ('12.ABC.345/01DE-35') === true, 'exemplo oficial 12.ABC.345/01DE-35 válido');
assert(Utils.validateCNPJ('12ABC34501DE35') === true, 'mesmo sem máscara válido');
assert(Utils.validateCNPJ('12.abc.345/01de-35') === true, 'minúsculo normalizado e válido');
assert(Utils.validateCNPJ('12.ABC.345/01DE-34') === false, 'DV alfanumérico incorreto inválido');
assert(Utils.validateCNPJ('1A.BC3.45D/01EF-AB') === false, 'DV não-numérico inválido');

// ═══════════════════════════════════════════════════════════
// 3. cleanCNPJ / formatCNPJ
// ═══════════════════════════════════════════════════════════
section('cleanCNPJ / formatCNPJ');
assert(Utils.cleanCNPJ('33.000.167/0001-01') === '33000167000101', 'cleanCNPJ remove máscara');
assert(Utils.cleanCNPJ('  12abc34501de35 ') === '12ABC34501DE35', 'cleanCNPJ trim + uppercase + mantém letras');
assert(Utils.formatCNPJ('33000167000101') === '33.000.167/0001-01', 'formatCNPJ numérico');
assert(Utils.formatCNPJ('12ABC34501DE35') === '12.ABC.345/01DE-35', 'formatCNPJ alfanumérico');
assert(Utils.formatCNPJ('123') === '123', 'formatCNPJ devolve original se inválido');

// ═══════════════════════════════════════════════════════════
// 4. parseCSV (máquina de estados)
// ═══════════════════════════════════════════════════════════
section('parseCSV');
let csv = Utils.parseCSV('cnpj,nome\n123,Foo');
assert(csv.length === 1 && csv[0].cnpj === '123' && csv[0].nome === 'Foo', 'básico vírgula');
assert(Utils.parseCSV('cnpj;nome\n1;Foo')[0].nome === 'Foo', 'auto-detecta delimitador ;');
assert(Utils.parseCSV('cnpj,nome\n1,"Foo, Bar"')[0].nome === 'Foo, Bar', 'campo com vírgula entre aspas');
let multil = Utils.parseCSV('cnpj,nome\n1,"Linha1\nLinha2"');
assert(multil.length === 1 && multil[0].nome.includes('\n'), 'quebra de linha dentro de aspas não corrompe');
assert(Utils.parseCSV('a,b\n1,"He said ""hi"""')[0].b === 'He said "hi"', 'aspas escapadas ("")');
assert(Object.keys(Utils.parseCSV('﻿cnpj,nome\n1,X')[0])[0] === 'cnpj', 'remove BOM do header');
assert(Utils.parseCSV('CNPJ,Nome\n1,X')[0].cnpj === '1', 'headers em minúsculas');
assert(Utils.parseCSV('cnpj,nome\n1,A\n\n2,B').length === 2, 'linha vazia ignorada');

// ═══════════════════════════════════════════════════════════
// 5. parseDateFlexible
// ═══════════════════════════════════════════════════════════
section('parseDateFlexible');
let d1 = Utils.parseDateFlexible('15/03/2024');
assert(d1 && d1.getFullYear() === 2024 && d1.getMonth() === 2 && d1.getDate() === 15, 'dd/mm/aaaa pt-BR (não vira US)');
let d2 = Utils.parseDateFlexible('2024-03-15');
assert(d2 && d2.getFullYear() === 2024 && d2.getMonth() === 2 && d2.getDate() === 15, 'ISO aaaa-mm-dd');
let d3 = Utils.parseDateFlexible('05/03/24');
assert(d3 && d3.getFullYear() === 2024, 'ano de 2 dígitos → 2024');
assert(Utils.parseDateFlexible('') === null, 'vazio → null');
assert(Utils.parseDateFlexible('não é data') === null, 'lixo → null');
assert(Utils.parseDateFlexible('32/01/2024') === null, 'dia inválido → null');
let dser = Utils.parseDateFlexible(45100); // serial Excel ≈ meados/2023 (mid-year evita borda de fuso)
assert(dser instanceof Date && dser.getUTCFullYear() === 2023, 'serial do Excel → Date');

// ═══════════════════════════════════════════════════════════
// 6. detectPorte / getCnaeAffinity
// ═══════════════════════════════════════════════════════════
section('detectPorte / getCnaeAffinity');
assert(Utils.detectPorte({ porte: 'MICRO EMPRESA' }) === 'ME', 'MICRO EMPRESA → ME');
assert(Utils.detectPorte({ porte: 'EMPRESA DE PEQUENO PORTE' }) === 'EPP', 'PEQUENO PORTE → EPP');
assert(Utils.detectPorte({ opcao_pelo_mei: true }) === 'MEI', 'opcao_pelo_mei → MEI');
assert(Utils.detectPorte({}) === 'DESCONHECIDO', 'sem porte → DESCONHECIDO');
assert(Utils.getCnaeAffinity({ cnae_fiscal: '4761003' }).score === 100, 'CNAE papelaria 4761003 → 100');
assert(Utils.getCnaeAffinity({ cnae_fiscal: '9999999' }).score === 20, 'CNAE fora da tabela → default 20');
assert(Utils.getCnaeAffinity({ cnae_fiscal_descricao: 'PAPELARIA' }).score === 100, 'fallback por palavra-chave PAPELARIA → 100');

// Confirma presença das chaves de afinidade no SCORE_CONFIG (config calibrada)
section('Tabela de afinidade CNAE (SCORE_CONFIG)');
const aff = Utils.SCORE_CONFIG.cnaeAffinity;
assert(aff['47610'] === 90, 'CNAE 47610 = 90');
assert(aff['46478'] === 85, 'CNAE 46478 = 85');
assert(aff['4789099'] === 60, 'CNAE 4789099 = 60');
assert(aff['47890'] === 50, 'CNAE 47890 = 50');
assert(aff['47555'] === 70, 'CNAE 47555 = 70');

// ═══════════════════════════════════════════════════════════
// 7. generateDivergences
// ═══════════════════════════════════════════════════════════
section('generateDivergences');
assert(
  Utils.generateDivergences({ razao_social: 'FOO LTDA' }, { razao_social: 'FOO LIMITADA' }).length === 0,
  'LTDA vs LIMITADA não diverge (normalização)'
);
assert(
  Utils.generateDivergences({ uf: 'SP' }, { uf: 'RJ' }).some(d => d.campo_com_divergencia === 'uf'),
  'UF diferente diverge'
);
assert(
  Utils.generateDivergences({ cep: '01001-000' }, { cep: '01001000' }).length === 0,
  'CEP compara só dígitos (sem divergência)'
);
assert(
  Utils.generateDivergences({ cnae: '4761003' }, { cnae_fiscal: '4761003' }).length === 0,
  'CNAE código igual não diverge'
);
assert(
  Utils.generateDivergences({ cnae: '4761003' }, { cnae_fiscal: '4789099' }).some(d => d.campo_com_divergencia === 'cnae'),
  'CNAE código diferente diverge'
);

// ═══════════════════════════════════════════════════════════
// 8. calculateVpaScore (engine v2)
// ═══════════════════════════════════════════════════════════
section('calculateVpaScore');
// Data recente dinâmica (~30 dias) para o teste não decair com o tempo
const recente = new Date(Date.now() - 30 * 86400000);
const ultcprRecente = `${String(recente.getDate()).padStart(2, '0')}/${String(recente.getMonth() + 1).padStart(2, '0')}/${recente.getFullYear()}`;

const quente = Utils.calculateVpaScore(
  { ultcpr: ultcprRecente },
  { descricao_situacao_cadastral: 'ATIVA', porte: 'MICRO EMPRESA', cnae_fiscal: '4761003' },
  []
);
assert(quente.priority === 'ALTA' && quente.scoreOportunidade >= 75, 'ATIVA + recente + papelaria → ALTA (≥75)');
assert(quente.breakdown.gate === 1.0, 'gate ATIVA = 1.0');

const baixada = Utils.calculateVpaScore(
  { ultcpr: ultcprRecente },
  { descricao_situacao_cadastral: 'BAIXADA', porte: 'MICRO EMPRESA', cnae_fiscal: '4761003' },
  []
);
assert(baixada.scoreOportunidade === 0 && baixada.priority === 'DESCARTE', 'BAIXADA → score 0 / DESCARTE (gate 0)');

const semData = Utils.calculateVpaScore(
  {},
  { descricao_situacao_cadastral: 'ATIVA', cnae_fiscal: '4761003' },
  []
);
assert(semData.flags.includes('SEM_DATA_ULTIMA_COMPRA'), 'sem data → flag SEM_DATA_ULTIMA_COMPRA');
assert(semData.breakdown.scoreRecencia === 'N/D', 'sem data → recência N/D (peso redistribuído)');

const futura = Utils.calculateVpaScore(
  { ultcpr: '01/01/2099' },
  { descricao_situacao_cadastral: 'ATIVA', cnae_fiscal: '4761003' },
  []
);
assert(futura.flags.includes('DATA_ULTIMA_COMPRA_FUTURA'), 'data futura → flag (não vira bônus)');

// ═══════════════════════════════════════════════════════════
// 9. Insights (inferências agregadas)
// ═══════════════════════════════════════════════════════════
section('Insights (sócios, redes, cohorts)');
const mkResult = (cnpj, situacao, socio, dias) => ({
  status: 'success',
  priority: 'ALTA',
  auditResult: {
    cnpj_analisado: cnpj,
    vendedor: 'VEN_01',
    prioridade_geral: situacao === 'ATIVA' ? 'ALTA' : 'DESCARTE',
    score_oportunidade: 80,
    score_higiene: 70,
    num_divergencias: 0,
    score_breakdown: { porteDetectado: 'ME', diasInativos: dias, scoreAfinidade: 90, scorePorte: 85 },
    dados_completos_receita: {
      razao_social: 'EMPRESA ' + cnpj,
      descricao_situacao_cadastral: situacao,
      uf: 'SP', municipio: 'São Paulo', capital_social: 50000,
      cnae_fiscal_descricao: 'Comércio varejista de artigos de papelaria',
      qsa: [{ nome_socio: socio, qualificacao_socio: 'Sócio-Administrador' }],
    },
  },
});
const mock = [
  mkResult('11.222.333/0001-81', 'ATIVA', 'JOAO SILVA', 100),   // matriz raiz 11222333
  mkResult('11.222.333/0002-62', 'ATIVA', 'MARIA SANTOS', 400), // filial mesma raiz
  mkResult('44.555.666/0001-99', 'BAIXADA', 'JOAO SILVA', 800), // sócio compartilhado → reabertura
];
const ins = Insights.computeInsights(mock);
assert(ins.totalValidos === 3, 'computeInsights conta 3 válidos');
assert(ins.socios.totalGrupos >= 1, 'detecta grupo de sócios (JOAO SILVA em 2 CNPJs)');
assert(ins.socios.reabertas.length === 1, 'detecta 1 reabertura (sócio ativo + inativo)');
assert(ins.redes.length === 1 && ins.redes[0].unidades === 2, 'detecta rede matriz/filial (raiz 11222333, 2 unidades)');
assert(ins.cohorts['Ativos (< 6 meses)'] === 1, 'cohort recência: 1 ativo < 6 meses (100 dias)');
assert(ins.cohorts['1-2 anos'] === 1, 'cohort recência: 1 entre 1-2 anos (400 dias)');

// ═══════════════════════════════════════════════════════════
// 9b. Round-trip Excel (parseCarteiraRow + reconstrução)
// ═══════════════════════════════════════════════════════════
section('Round-trip XLSX (parseCarteiraRow)');
assert(Utils.parseBRNumber('R$ 1.234,56') === 1234.56, 'parseBRNumber pt-BR (R$ 1.234,56)');
assert(Utils.parseBRNumber('50000') === 50000, 'parseBRNumber inteiro');
assert(Utils.parseBRNumber('') === 0, 'parseBRNumber vazio → 0');
assert(
  Utils.parseSimNao('Sim') === true && Utils.parseSimNao('Não') === false && Utils.parseSimNao('N/D') === null,
  'parseSimNao Sim/Não/N/D'
);
const qsaP = Utils.parseQsaString('JOAO SILVA (Sócio-Administrador); MARIA (Sócia)');
assert(qsaP.length === 2 && qsaP[0].nome_socio === 'JOAO SILVA' && qsaP[0].qualificacao_socio === 'Sócio-Administrador', 'parseQsaString');
const cnaeP = Utils.parseCnaesString('4761003 - Papelaria; 4789099 - Outros');
assert(cnaeP.length === 2 && cnaeP[0].codigo === '4761003' && cnaeP[0].descricao === 'Papelaria', 'parseCnaesString');

// Fidelidade: (client, official) → audit1; serializa para linha "Carteira";
// reimporta com parseCarteiraRow; recalcula → mesmos números do original.
const rtClient = {
  cnpj: '33000167000101', razao_social: 'PETROLEO BR', vendedor: 'VEN_01', codigo: 'C1',
  ultcpr: ultcprRecente, cep: '', logradouro: '', municipio: '', uf: '', cnae: '4761003',
  nome_fantasia: '', datmaicpr: '',
};
const rtOfficial = {
  razao_social: 'PETROLEO BR', nome_fantasia: 'PETRO', descricao_situacao_cadastral: 'ATIVA',
  data_situacao_cadastral: '01/01/2010', capital_social: 50000, data_inicio_atividade: '01/01/2010',
  porte: 'MICRO EMPRESA', cnae_fiscal: '4761003', cnae_fiscal_descricao: 'Comércio varejista de artigos de papelaria',
  opcao_pelo_simples: true, opcao_pelo_mei: false, cep: '01001000', logradouro: 'Rua X',
  bairro: 'Centro', municipio: 'São Paulo', uf: 'SP', ddd_telefone_1: '(11) 1111-1111', email: 'x@x.com',
  qsa: [{ nome_socio: 'JOAO SILVA', qualificacao_socio: 'Sócio-Administrador' }],
  cnaes_secundarios: [{ codigo: '4789099', descricao: 'Outros' }],
};
const audit1 = Utils.generateAuditResult(rtClient, rtOfficial);
const fmtBool = (v) => (v === true ? 'Sim' : v === false ? 'Não' : 'N/D');
const exportedRow = {
  'CNPJ': Utils.formatCNPJ(rtClient.cnpj),
  'Razão Social (Interno)': rtClient.razao_social,
  'Vendedor Responsável': rtClient.vendedor,
  'Código Cliente': rtClient.codigo,
  'Última Compra (ultcpr)': rtClient.ultcpr,
  'CNAE (Interno)': rtClient.cnae,
  'Razão Social (Receita Federal)': rtOfficial.razao_social,
  'Situação Cadastral (RFB)': rtOfficial.descricao_situacao_cadastral,
  'Capital Social': rtOfficial.capital_social,
  'Porte (RFB)': rtOfficial.porte,
  'Data Abertura': rtOfficial.data_inicio_atividade,
  'Data Situação Cadastral': rtOfficial.data_situacao_cadastral,
  'CNAE Principal Código': rtOfficial.cnae_fiscal,
  'CNAE Principal Descrição': rtOfficial.cnae_fiscal_descricao,
  'Simples Nacional': fmtBool(rtOfficial.opcao_pelo_simples),
  'MEI': fmtBool(rtOfficial.opcao_pelo_mei),
  'Telefone 1': rtOfficial.ddd_telefone_1,
  'E-mail': rtOfficial.email,
  'Quadro Societário (QSA)': 'JOAO SILVA (Sócio-Administrador)',
  'CNAEs Secundários': '4789099 - Outros',
  'Status Processamento': 'success',
};
const rt = Utils.parseCarteiraRow(exportedRow);
const audit2 = Utils.generateAuditResult(rt.client, rt.official);
assert(rt.client.cnpj === '33000167000101', 'round-trip: CNPJ recuperado');
assert(rt.official.qsa.length === 1 && rt.official.capital_social === 50000, 'round-trip: QSA e capital reconstruídos');
assert(audit2.score_breakdown.porteDetectado === 'ME', 'round-trip: porte recuperado (Porte RFB) → ME');
assert(audit2.score_oportunidade === audit1.score_oportunidade, 'round-trip: score de oportunidade idêntico ao original');
assert(audit2.prioridade_geral === audit1.prioridade_geral, 'round-trip: prioridade idêntica ao original');

// ═══════════════════════════════════════════════════════════
// 10. API — mapeamento de erros (assíncrono)
// ═══════════════════════════════════════════════════════════
(async () => {
  section('API.processClient / generateWebIntelligence');

  const invalido = await API.processClient({ cnpj: '33.000.167/0001-00', razao_social: 'X', vendedor: 'V' });
  assert(invalido._status === 'inactive', 'CNPJ inválido localmente → _status inactive');
  assert(invalido.status_receita === 'INVÁLIDO', 'CNPJ inválido → status_receita INVÁLIDO');
  assert(invalido.acao_recomendada.includes('CNPJ inválido'), 'ação menciona CNPJ inválido');

  const naoEncontrado = await API.processClient({ cnpj: '33.000.167/0001-01', razao_social: 'Y', vendedor: 'V' });
  assert(naoEncontrado._status === 'inactive', 'CNPJ válido + 404 → _status inactive');
  assert(naoEncontrado.status_receita === 'NÃO ENCONTRADO', '404 → status_receita NÃO ENCONTRADO');
  assert(naoEncontrado.acao_recomendada.includes('não encontrado'), 'ação menciona não encontrado');

  const ativaCap0 = API.generateWebIntelligence({ descricao_situacao_cadastral: 'ATIVA', capital_social: 0 });
  assert(ativaCap0.indicios_de_operacao_ativa === true, 'ATIVA capital 0 → indícios true');
  const ativaNull = API.generateWebIntelligence({ descricao_situacao_cadastral: 'ativa', capital_social: null });
  assert(ativaNull.indicios_de_operacao_ativa === true, 'ativa (case-insensitive) capital null → indícios true');
  const baixadaIntel = API.generateWebIntelligence({ descricao_situacao_cadastral: 'BAIXADA', capital_social: 100000 });
  assert(baixadaIntel.indicios_de_operacao_ativa === false, 'BAIXADA → indícios false');

  // ─── Resultado ───
  console.log('\n--- RESULTADOS DOS TESTES ---');
  console.log(`Passou: ${testsPassed}`);
  console.log(`Falhou: ${testsFailed}`);
  if (testsFailed > 0) { process.exit(1); }
  console.log('🎉 Todos os testes passaram!');
  process.exit(0);
})();
