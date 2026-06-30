const express = require('express');
const cors = require('cors');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { Ollama } = require('ollama');

const app = express();
app.use(cors());
app.use(express.json());

const OLLAMA_HOST = 'http://127.0.0.1:11434';
const MODEL = 'gemma4:12b-mlx';

const ollama = new Ollama({ host: OLLAMA_HOST });

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
    modelName: MODEL,
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

/**
 * Faz streaming do /api/chat do Ollama (NDJSON) chamando a API HTTP diretamente
 * com `think: true` e `stream: true`. Isso garante que o campo `thinking` seja
 * enviado independentemente da versão do client npm.
 *
 * @param {Object} payload - corpo da requisição (model, messages, tools, options)
 * @param {(delta:{thinking?:string, content?:string}) => void} onDelta
 * @returns {Promise<{role:string, content:string, thinking:string, tool_calls:Array}>}
 */
async function streamOllama(payload, onDelta) {
  const resp = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: true, think: true }),
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`Ollama respondeu HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let thinking = '';
  let toolCalls = [];
  let role = 'assistant';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.error) throw new Error(obj.error);

      const msg = obj.message || {};
      if (msg.role) role = msg.role;
      if (msg.thinking) { thinking += msg.thinking; onDelta({ thinking: msg.thinking }); }
      if (msg.content) { content += msg.content; onDelta({ content: msg.content }); }
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
        toolCalls = toolCalls.concat(msg.tool_calls);
      }
    }
  }

  return { role, content, thinking, tool_calls: toolCalls };
}

app.post('/api/chat', async (req, res) => {
  // Server-Sent Events: thinking/content/tool/done são emitidos ao vivo.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const { message, history = [] } = req.body;

    // Obter tools do MCP e mapear para o formato do Ollama
    const toolsResponse = await mcpClient.listTools();
    const ollamaTools = toolsResponse.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));

    const systemPrompt = {
      role: 'system',
      content: `Você é o Assistente do AuditBase. Esta é uma demonstração acadêmica do protocolo MCP (Model Context Protocol).
Você tem acesso autorizado a ferramentas locais que retornam dados públicos da Receita Federal (incluindo o Quadro Societário - QSA).

Você DEVE utilizar e detalhar as informações retornadas pelas ferramentas (tools) para responder de forma factual ao usuário. Nunca recuse a resposta ou diga que não tem acesso, pois os dados são fornecidos diretamente pelas ferramentas acionadas.

Ao apresentar o resultado: seja claro, didático e factual. Se houver Quadro de Sócios e Administradores (QSA) no resultado da ferramenta, liste obrigatoriamente todos os sócios e seus respectivos cargos/qualificações de forma organizada.`
    };

    const messages = [...history];
    if (!(messages.length > 0 && messages[0].role === 'system')) {
      messages.unshift(systemPrompt);
    }
    messages.push({ role: 'user', content: message });

    // ── Fase 1 ── o modelo pode raciocinar e/ou decidir chamar uma ferramenta.
    // Transmitimos o "thinking" ao vivo; o "content" fica em buffer (pode ser a
    // resposta final OU o texto de uma chamada de ferramenta).
    const first = await streamOllama(
      { model: MODEL, messages, tools: ollamaTools, options: { num_ctx: 8192 } },
      (delta) => {
        if (delta.thinking) send({ type: 'thinking', delta: delta.thinking });
        if (delta.content) send({ type: 'content', delta: delta.content });
      }
    );

    // Detectar chamadas de ferramenta (estruturadas ou via texto no content)
    let toolCalls = first.tool_calls;
    if ((!toolCalls || toolCalls.length === 0) && first.content) {
      const textToolCall = extractTextToolCall(first.content);
      if (textToolCall) toolCalls = [{ function: textToolCall }];
    }

    if (toolCalls && toolCalls.length > 0) {
      messages.push({ role: 'assistant', content: first.content || '', tool_calls: toolCalls });

      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall.function;
        send({ type: 'tool', name, status: 'running' });
        try {
          const mcpResult = await mcpClient.callTool({ name, arguments: args });
          const resultText = (mcpResult.content && mcpResult.content[0] && mcpResult.content[0].text) || 'Success';
          messages.push({ role: 'tool', content: resultText, name });
          send({ type: 'tool', name, status: 'done' });
        } catch (err) {
          messages.push({ role: 'tool', content: `Error: ${err.message}`, name });
          send({ type: 'tool', name, status: 'error' });
        }
      }

      // Limpa o conteúdo parcial da fase 1 (ex.: texto de uma tool-call) antes
      // de transmitir a resposta final.
      send({ type: 'reset_content' });

      // ── Fase 2 ── resposta final com raciocínio + conteúdo ao vivo.
      const final = await streamOllama(
        { model: MODEL, messages, options: { num_ctx: 8192 } },
        (delta) => {
          if (delta.thinking) send({ type: 'thinking', delta: delta.thinking });
          if (delta.content) send({ type: 'content', delta: delta.content });
        }
      );
      // No histórico guardamos só o conteúdo (sem o thinking) para não inflar o contexto.
      messages.push({ role: 'assistant', content: final.content });
      send({ type: 'done', history: messages });
    } else {
      // Sem ferramenta: o content da fase 1 já foi transmitido ao vivo acima.
      messages.push({ role: 'assistant', content: first.content });
      send({ type: 'done', history: messages });
    }
  } catch (err) {
    console.error("Erro no chat:", err);
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

const PORT = 3001;
app.listen(PORT, async () => {
  console.log(`Bridge Server rodando na porta ${PORT} (modelo: ${MODEL})`);
  await setupMCP().catch(console.error);
});
