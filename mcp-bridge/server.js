const express = require('express');
const cors = require('cors');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { Ollama } = require('ollama');

const app = express();
app.use(cors());
app.use(express.json());

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });

let mcpClient = null;

async function setupMCP() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["../mcp-server/index.js"],
  });
  
  mcpClient = new Client(
    {
      name: "mcp-bridge",
      version: "1.0.0",
    },
    {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
      },
    }
  );
  
  await mcpClient.connect(transport);
  console.log("Conectado ao MCP Server localmente via Stdio.");
}

// Endpoint de Diagnóstico de Status
app.get('/api/status', async (req, res) => {
  const status = {
    bridge: true,
    ollama: false,
    mcp: false,
    modelName: 'qwen2.5-coder:7b',
    details: {}
  };

  // 1. Verificar Ollama
  try {
    const list = await ollama.list();
    status.ollama = true;
    status.details.ollama = `Ativo. Modelos disponíveis: ${list.models.map(m => m.name).join(', ')}`;
  } catch (err) {
    status.details.ollama = `Inativo (erro na porta 11434: ${err.message})`;
  }

  // 2. Verificar MCP Client
  try {
    if (mcpClient) {
      await mcpClient.listTools();
      status.mcp = true;
      status.details.mcp = "Conectado com sucesso via Stdio.";
    } else {
      status.details.mcp = "Cliente MCP não instanciado.";
    }
  } catch (err) {
    status.details.mcp = `Erro na conexão Stdio: ${err.message}`;
  }

  res.json(status);
});

function extractTextToolCall(text) {
  if (!text) return null;
  
  // 1. Regex para encontrar o nome da função (suporta aspas simples, duplas ou sem aspas)
  const nameMatch = text.match(/['"]?name['"]?\s*:\s*['"]([^'"]+)['"]/);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  
  // 2. Tentar encontrar o bloco de parâmetros/argumentos
  const argsMatch = text.match(/['"]?(?:parameters|arguments)['"]?\s*:\s*(\{[\s\S]*?\})/);
  let args = {};
  if (argsMatch) {
    let rawArgs = argsMatch[1];
    
    // Normalizar aspas para JSON.parse
    let argsJsonStr = rawArgs.replace(/'/g, '"');
    
    // Garantir que todas as chaves estejam com aspas duplas, ex: {cnpj: "..."} -> {"cnpj": "..."}
    argsJsonStr = argsJsonStr.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    
    try {
      args = JSON.parse(argsJsonStr);
    } catch (e) {
      console.warn("JSON.parse falhou na chamada textual de ferramenta, usando extração via Regex:", e);
      // Fallback via regex simples para pares chave:valor
      const kvMatches = rawArgs.matchAll(/['"]?([a-zA-Z0-9_]+)['"]?\s*:\s*['"]([^'"]+)['"]/g);
      for (const kv of kvMatches) {
        args[kv[1]] = kv[2];
      }
    }
  }
  
  return { name, arguments: args };
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    
    // Obter tools do MCP
    const toolsResponse = await mcpClient.listTools();
    const ollamaTools = toolsResponse.tools.map(tool => {
      // Mapear MCP JSON Schema para Ollama Tool Format
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      };
    });

    // Prompt de sistema acadêmico / explicativo
    const systemPrompt = {
      role: 'system',
      content: `Você é o Assistente do AuditBase. Esta é uma demonstração acadêmica do protocolo MCP (Model Context Protocol). 
Você tem acesso autorizado a ferramentas locais que retornam dados públicos da Receita Federal (incluindo o Quadro Societário - QSA).

Você DEVE utilizar e detalhar as informações retornadas pelas ferramentas (tools) para responder de forma factual ao usuário. Nunca recuse a resposta ou diga que não tem acesso, pois os dados são fornecidos diretamente pelas ferramentas acionadas.

Ao gerar sua resposta final (após obter o resultado da ferramenta):
1. Comece obrigatoriamente a resposta com o prefixo "[Raciocínio MCP]" descrevendo qual ferramenta você executou e por que ela foi necessária.
2. Apresente os resultados de forma clara, didática e factual.
3. Muito IMPORTANTE: se houver Quadro de Sócios e Administradores (QSA) no resultado da ferramenta, liste obrigatoriamente todos os sócios e seus respectivos cargos/qualificações de forma organizada.`
    };

    const messages = [...history];
    const hasSystemPrompt = messages.length > 0 && messages[0].role === 'system';
    if (!hasSystemPrompt) {
      messages.unshift(systemPrompt);
    }
    messages.push({ role: 'user', content: message });
    
    // Primeira chamada pro Ollama
    const response = await ollama.chat({
      model: 'qwen2.5-coder:7b',
      messages: messages,
      tools: ollamaTools,
      options: {
        num_ctx: 8192
      }
    });

    // Verificar se o modelo decidiu chamar uma ferramenta (estruturada ou via texto no content)
    let toolCalls = [];
    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      toolCalls = response.message.tool_calls;
    } else {
      const textToolCall = extractTextToolCall(response.message.content);
      if (textToolCall) {
        console.log("Detectou chamada de ferramenta textual no conteúdo:", textToolCall);
        toolCalls = [{
          function: textToolCall
        }];
        response.message.tool_calls = toolCalls; // Simular no objeto de mensagem
      }
    }

    if (toolCalls.length > 0) {
      console.log("Ollama decidiu usar uma ferramenta:", response.message.tool_calls);
      messages.push(response.message); // adicionar a resposta do assistente (que contem o tool_call)
      
      for (const toolCall of response.message.tool_calls) {
        const { name, arguments: args } = toolCall.function;
        console.log(`Chamando MCP Tool: ${name}`, args);
        
        try {
          const mcpResult = await mcpClient.callTool({
            name: name,
            arguments: args
          });
          
          let resultText = "";
          if (mcpResult.content && mcpResult.content.length > 0) {
            resultText = mcpResult.content[0].text;
          } else {
            resultText = "Success";
          }
          
          messages.push({
            role: 'tool',
            content: resultText,
            name: name
          });
        } catch (err) {
          console.error("Erro na ferramenta:", err);
          messages.push({
            role: 'tool',
            content: `Error: ${err.message}`,
            name: name
          });
        }
      }
      
      // Chamar Ollama novamente para gerar a resposta final
      console.log("Enviando resultados para o Ollama...");
      const finalResponse = await ollama.chat({
        model: 'qwen2.5-coder:7b',
        messages: messages,
        options: {
          num_ctx: 8192
        }
      });
      
      return res.json({
        content: finalResponse.message.content,
        history: [...messages, finalResponse.message]
      });
    } else {
      return res.json({
        content: response.message.content,
        history: [...messages, response.message]
      });
    }
    
  } catch (err) {
    console.error("Erro no chat:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, async () => {
  console.log(`Bridge Server rodando na porta ${PORT}`);
  await setupMCP().catch(console.error);
});
