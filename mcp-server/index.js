const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Load Core Logic via VM ---
const rootDir = path.resolve(__dirname, '..');
let utilsCode = fs.readFileSync(path.join(rootDir, 'utils.js'), 'utf8');
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

let apiCode = fs.readFileSync(path.join(rootDir, 'api.js'), 'utf8');
apiCode = apiCode.replace('const API =', 'var API =');

const apiContext = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Date: Date,
  Math: Math,
  Utils: Utils,
  fetch: global.fetch,
  AbortController: global.AbortController, // habilita o timeout de fetch (fetchWithTimeout)
};
vm.createContext(apiContext);
vm.runInContext(apiCode, apiContext);
const API = apiContext.API;

// --- Initialize MCP Server ---
const server = new Server(
  {
    name: "auditbase-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Register Tools ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "validate_cnpj",
        description: "Valida matematicamente um CNPJ (verifica dígitos).",
        inputSchema: {
          type: "object",
          properties: {
            cnpj: {
              type: "string",
              description: "O CNPJ a ser validado.",
            },
          },
          required: ["cnpj"],
        },
      },
      {
        name: "fetch_cnpj_data",
        description: "Busca os dados oficiais de um CNPJ na BrasilAPI.",
        inputSchema: {
          type: "object",
          properties: {
            cnpj: {
              type: "string",
              description: "O CNPJ a ser consultado.",
            },
          },
          required: ["cnpj"],
        },
      },
      {
        name: "generate_audit_result",
        description: "Executa a pipeline completa de auditoria para um CNPJ (calcula score Distribuidora, validação e web intelligence).",
        inputSchema: {
          type: "object",
          properties: {
            clientData: {
              type: "object",
              description: "Dados do cliente, contendo no mínimo a chave 'cnpj' e, opcionalmente, outros campos como 'razao', 'fantasia', 'cnae', 'porte', etc.",
            },
          },
          required: ["clientData"],
        },
      },
    ],
  };
});

// --- Handle Tool Calls ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "validate_cnpj") {
    const { cnpj } = request.params.arguments;
    const isValid = Utils.validateCNPJ(cnpj);
    return {
      content: [{ type: "text", text: JSON.stringify({ valid: isValid }) }],
    };
  }

  if (request.params.name === "fetch_cnpj_data") {
    const { cnpj } = request.params.arguments;
    try {
      const data = await API.fetchCNPJData(cnpj);
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: true, message: e.message }) }],
      };
    }
  }

  if (request.params.name === "generate_audit_result") {
    const { clientData } = request.params.arguments;
    try {
      const result = await API.processClient(clientData);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: true, message: e.message }) }],
      };
    }
  }

  throw new Error("Tool not found");
});

// --- Start Server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AuditBase MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
