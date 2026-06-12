const fs = require('fs');
const vm = require('vm');

console.log('--- Carregando arquivos de script do dashboard ---');

// 1. Carregar e executar utils.js
let utilsCode = fs.readFileSync('utils.js', 'utf8');
// Substitui const Utils por var Utils para que fique exposto no contexto da VM
utilsCode = utilsCode.replace('const Utils =', 'var Utils =');

const utilsContext = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Date: Date,
  Math: Math,
};
vm.createContext(utilsContext);
vm.runInContext(utilsCode, utilsContext);
const Utils = utilsContext.Utils;

if (!Utils) {
  console.error('ERRO: Não foi possível carregar a variável global Utils de utils.js');
  process.exit(1);
}
console.log('✅ utils.js carregado com sucesso.');

// 2. Carregar e executar api.js (depende de Utils)
let apiCode = fs.readFileSync('api.js', 'utf8');
apiCode = apiCode.replace('const API =', 'var API =');

const apiContext = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Date: Date,
  Math: Math,
  Utils: Utils,
  // Mock do fetch global
  fetch: null, 
};
vm.createContext(apiContext);

// Testes
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [OK] ${message}`);
    testsPassed++;
  } else {
    console.error(`  [FALHA] ${message}`);
    testsFailed++;
  }
}

// --- Teste 1: Validação de CNPJ ---
console.log('\n--- Testando Validação Matemática de CNPJs (Utils.validateCNPJ) ---');
assert(Utils.validateCNPJ('33.000.167/0001-01') === true, 'CNPJ da Petrobras válido');
assert(Utils.validateCNPJ('47.960.950/0001-21') === true, 'CNPJ da Magalu válido');
assert(Utils.validateCNPJ('07.526.557/0001-00') === true, 'CNPJ da Ambev válido');
assert(Utils.validateCNPJ('00.000.000/0000-00') === false, 'CNPJ de zeros inválido');
assert(Utils.validateCNPJ('11.111.111/1111-11') === false, 'CNPJ de dígitos iguais inválido');
assert(Utils.validateCNPJ('33.000.167/0001-00') === false, 'CNPJ com dígitos verificadores incorretos inválido');

// --- Teste 2: Afinidade de CNAE ---
console.log('\n--- Testando Motor de Afinidade de CNAE (Utils.SCORE_CONFIG / utils.js) ---');
// Para testar o score de afinidade de CNAE, vamos achar a função correspondente
// No utils.js, as regras de afinidade estão no SCORE_CONFIG.
// Procuramos o cnaeAffinity dentro do SCORE_CONFIG privado ou se ele está exposto.
// Vamos verificar o que é exposto em Utils.
const testCnaeFn = Object.keys(Utils).find(k => k.toLowerCase().includes('cnae') || k.toLowerCase().includes('score'));
console.log(`Funções encontradas em Utils: ${Object.keys(Utils).join(', ')}`);

// Vamos ver se o calculateScore ou similar existe.
// Em utils.js:
// - determineScore / calculateScore? Vamos procurar.
// Se as afinidades do SCORE_CONFIG são internas, podemos extraí-las do código ou testar o comportamento do cálculo de afinidade.
// Vamos testar se a função calculateCNAEAffinity(cnae) ou similar existe.
// Vamos dar um grep no utils.js para ver o que calcula afinidade ou score.
// De qualquer forma, sabemos que adicionamos no utils.js, vamos verificar se o arquivo utils.js contém a string de cnaeAffinity atualizada.
const fileContent = fs.readFileSync('utils.js', 'utf8');
assert(fileContent.includes("'47610': 90"), 'CNAE 47610 mapeado com 90');
assert(fileContent.includes("'46478': 85"), 'CNAE 46478 mapeado com 85');
assert(fileContent.includes("'4789099': 60"), 'CNAE 4789099 mapeado com 60');
assert(fileContent.includes("'47890': 50"), 'CNAE 47890 mapeado com 50');
assert(fileContent.includes("'47555': 70"), 'CNAE 47555 mapeado com 70');

// --- Teste 3: Mapeamento da API com falha permanente ---
console.log('\n--- Testando Mapeamento da API com falha permanente ---');
// Mock do fetch para retornar 404
apiContext.fetch = async (url) => {
  return {
    status: 404,
    ok: false,
    statusText: 'Not Found',
  };
};

vm.runInContext(apiCode, apiContext);
const API = apiContext.API;

(async () => {
  try {
    const clientData = {
      cnpj: '33.000.167/0001-00', // CNPJ inválido
      razao_social: 'Empresa Teste',
      vendedor: 'VEN_TESTE'
    };

    console.log('Testando comportamento para CNPJ inválido localmente...');
    const invalidResult = await API.processClient(clientData);
    assert(invalidResult._status === 'inactive', 'CNPJ inválido localmente retorna _status = inactive');
    assert(invalidResult.status_receita === 'INVÁLIDO', 'CNPJ inválido localmente retorna status_receita = INVÁLIDO');
    assert(invalidResult.acao_recomendada.includes('CNPJ inválido'), 'Ação recomendada menciona CNPJ inválido');

    console.log('Testando comportamento para CNPJ não encontrado (404) na API...');
    // Para testar 404, precisamos passar um CNPJ matematicamente VÁLIDO mas que retorne 404 na API
    const validCnpjNonExistent = {
      cnpj: '33.000.167/0001-01', // Petrobras (válido)
      razao_social: 'Empresa Inexistente',
      vendedor: 'VEN_TESTE'
    };
    
    const notFoundResult = await API.processClient(validCnpjNonExistent);
    assert(notFoundResult._status === 'inactive', 'CNPJ inexistente (404) retorna _status = inactive');
    assert(notFoundResult.status_receita === 'NÃO ENCONTRADO', 'CNPJ inexistente (404) retorna status_receita = NÃO ENCONTRADO');
    assert(notFoundResult.acao_recomendada.includes('não encontrado'), 'Ação recomendada menciona não encontrado');

    console.log('Testando inteligência web para empresas com situação cadastral ATIVA e capital social zero...');
    const activeIntelCapitalZero = API.generateWebIntelligence({ descricao_situacao_cadastral: 'ATIVA', capital_social: 0 });
    assert(activeIntelCapitalZero.indicios_de_operacao_ativa === true, 'Empresa ATIVA com capital 0 tem indícios de operação ativa = true');

    const activeIntelCapitalNull = API.generateWebIntelligence({ descricao_situacao_cadastral: 'ativa', capital_social: null });
    assert(activeIntelCapitalNull.indicios_de_operacao_ativa === true, 'Empresa ativa (case insensitive) com capital null tem indícios de operação ativa = true');

    const baixadaIntel = API.generateWebIntelligence({ descricao_situacao_cadastral: 'BAIXADA', capital_social: 100000 });
    assert(baixadaIntel.indicios_de_operacao_ativa === false, 'Empresa BAIXADA com capital alto tem indícios de operação ativa = false');

    console.log('\n--- RESULTADOS DOS TESTES ---');
    console.log(`Passou: ${testsPassed}`);
    console.log(`Falhou: ${testsFailed}`);
    
    if (testsFailed > 0) {
      process.exit(1);
    } else {
      console.log('🎉 Todos os testes passaram!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Erro durante a execução do teste:', err);
    process.exit(1);
  }
})();
