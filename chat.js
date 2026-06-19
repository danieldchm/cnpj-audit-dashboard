window.Chat = (function() {
  let chatHistory = [];
  let statusInterval = null;
  
  function init() {
    const btnSend = document.getElementById('mcp-send-btn');
    const inputField = document.getElementById('mcp-input');
    const btnClear = document.getElementById('btn-clear-chat');
    
    if (btnSend && inputField) {
      btnSend.addEventListener('click', sendMessage);
      inputField.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      
      // Auto-grow input field
      inputField.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
      });
    }
    
    if (btnClear) {
      btnClear.addEventListener('click', clearConversation);
    }
    
    // Mobile sidebar toggle drawer handlers
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const chatSidebar = document.getElementById('chat-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (btnToggleSidebar && chatSidebar && sidebarOverlay) {
      btnToggleSidebar.addEventListener('click', () => {
        chatSidebar.classList.remove('max-[1024px]:right-[-320px]');
        chatSidebar.classList.add('max-[1024px]:right-0');
        sidebarOverlay.classList.remove('hidden');
      });
      
      sidebarOverlay.addEventListener('click', () => {
        chatSidebar.classList.add('max-[1024px]:right-[-320px]');
        chatSidebar.classList.remove('max-[1024px]:right-0');
        sidebarOverlay.classList.add('hidden');
      });
    }

    // Set initial log timestamp
    const initialLogTime = document.getElementById('initial-log-time');
    if (initialLogTime) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      initialLogTime.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(Math.floor(now.getMilliseconds() / 10))}`;
    }
    
    // Set initial CPU load
    setCpuLoad(1.2);
    
    // Check status immediately and set interval
    checkStatus();
    statusInterval = setInterval(checkStatus, 5000);
    
    // Initialize panel resizers
    initResizers();
  }
  
  function initResizers() {
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const chatSidebar = document.getElementById('chat-sidebar');
    const footerResizer = document.getElementById('footer-resizer');
    const logsFooter = document.getElementById('logs-footer');
    
    // Sidebar Resizer (Horizontal drag to resize width)
    if (sidebarResizer && chatSidebar) {
      sidebarResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        sidebarResizer.classList.add('bg-primary/80');
        
        function onMouseMove(moveEvent) {
          const newWidth = window.innerWidth - moveEvent.clientX;
          if (newWidth >= 220 && newWidth <= 600) {
            chatSidebar.style.width = newWidth + 'px';
          }
        }
        
        function onMouseUp() {
          document.body.style.cursor = 'default';
          sidebarResizer.classList.remove('bg-primary/80');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }
    
    // Footer Resizer (Vertical drag to resize height)
    if (footerResizer && logsFooter) {
      footerResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.style.cursor = 'row-resize';
        footerResizer.classList.add('bg-primary/80');
        
        function onMouseMove(moveEvent) {
          const newHeight = window.innerHeight - moveEvent.clientY;
          if (newHeight >= 64 && newHeight <= 450) {
            logsFooter.style.height = newHeight + 'px';
          }
        }
        
        function onMouseUp() {
          document.body.style.cursor = 'default';
          footerResizer.classList.remove('bg-primary/80');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }
  }
  
  async function checkStatus() {
    const dotBridge = document.getElementById('dot-bridge');
    const textBridge = document.getElementById('text-bridge');
    const dotOllama = document.getElementById('dot-ollama');
    const textOllama = document.getElementById('text-ollama');
    const dotMcp = document.getElementById('dot-mcp');
    const textMcp = document.getElementById('text-mcp');
    
    try {
      const response = await fetch('http://localhost:3001/api/status');
      const data = await response.json();
      
      // Update Bridge status
      updateDot(dotBridge, textBridge, data.bridge, 'Connected', 'Offline');
      // Update Ollama status
      updateDot(dotOllama, textOllama, data.ollama, 'Connected', 'Offline');
      // Update MCP status
      updateDot(dotMcp, textMcp, data.mcp, 'Connected', 'Offline');
      
      // Update aggregate system health status
      updateSystemStatus(data.bridge, data.ollama, data.mcp);
      
    } catch (err) {
      // Bridge is down entirely
      updateDot(dotBridge, textBridge, false, 'Connected', 'Offline');
      updateDot(dotOllama, textOllama, false, 'Connected', 'Offline');
      updateDot(dotMcp, textMcp, false, 'Connected', 'Offline');
      updateSystemStatus(false, false, false);
    }
  }
  
  function updateDot(dotElement, textElement, isOnline, successText, failText) {
    if (!dotElement) return;
    
    dotElement.className = 'w-1.5 h-1.5 rounded-full glow-dot';
    
    if (isOnline) {
      dotElement.classList.add('bg-primary', 'text-primary');
      if (textElement) {
        textElement.textContent = successText;
        textElement.className = 'text-[10px] font-label-code uppercase text-primary';
      }
    } else {
      dotElement.classList.add('bg-red-500', 'text-red-500');
      if (textElement) {
        textElement.textContent = failText;
        textElement.className = 'text-[10px] font-label-code uppercase text-red-500';
      }
    }
  }

  function updateSystemStatus(bridgeOnline, ollamaOnline, mcpOnline) {
    const systemDot = document.getElementById('dot-system-status');
    const systemText = document.getElementById('text-system-status');
    if (!systemDot || !systemText) return;
    
    systemDot.className = 'w-2.5 h-2.5 rounded-full glow-dot';
    
    if (bridgeOnline && ollamaOnline && mcpOnline) {
      systemDot.classList.add('bg-green-500', 'text-green-500');
      systemText.textContent = 'SYSTEM_OPERATIONAL';
      systemText.className = 'text-green-500';
    } else if (!bridgeOnline && !ollamaOnline && !mcpOnline) {
      systemDot.classList.add('bg-red-500', 'text-red-500');
      systemText.textContent = 'SYSTEM_OFFLINE';
      systemText.className = 'text-red-500';
    } else {
      systemDot.classList.add('bg-yellow-500', 'text-yellow-500', 'animate-pulse');
      systemText.textContent = 'SYSTEM_DEGRADED';
      systemText.className = 'text-yellow-500';
    }
  }

  function setCpuLoad(percentage) {
    const text = document.getElementById('cpu-load-text');
    const bar = document.getElementById('cpu-load-bar');
    if (text && bar) {
      text.textContent = percentage.toFixed(1) + '%';
      bar.style.width = percentage + '%';
    }
  }

  function setReceitaLatency(ms) {
    const latencyText = document.getElementById('latency-receita');
    if (latencyText) {
      latencyText.textContent = `LATENCY: ${ms}ms`;
    }
  }

  function appendProtocolLog(module, operation, status) {
    const tbody = document.getElementById('terminal-logs-tbody');
    if (!tbody) return;
    
    // Remove the initial default row if it exists
    const initialRow = document.getElementById('row-initial-log');
    if (initialRow) initialRow.remove();
    
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-primary/5 transition-colors border-b border-outline-variant/5';
    
    // Generate timestamp hh:mm:ss.SS
    const now = new Date();
    const pad = (n, width = 2) => String(n).padStart(width, '0');
    const timestamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(Math.floor(now.getMilliseconds() / 10))}`;
    
    let statusClass = 'text-on-surface-variant/40';
    if (status === 'SUCCESS' || status === 'COMPLETED' || status === '200_OK' || status === 'READY') {
      statusClass = 'text-green-500/70';
    } else if (status === 'RUNNING' || status === 'PENDING') {
      statusClass = 'text-primary animate-pulse';
    } else if (status === 'FAILED' || status === 'ERROR') {
      statusClass = 'text-red-500/70';
    }
    
    tr.innerHTML = `
      <td class="px-md py-1 text-outline/60">${timestamp}</td>
      <td class="px-md py-1 text-primary font-bold">${module}</td>
      <td class="px-md py-1 text-on-surface select-text">${operation}</td>
      <td class="px-md py-1 text-right font-bold ${statusClass}">${status}</td>
    `;
    
    tbody.appendChild(tr);
    
    // Auto-scroll the terminal panel
    const terminalBody = tbody.closest('.overflow-y-auto');
    if (terminalBody) {
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  }
  
  async function sendMessage() {
    const inputField = document.getElementById('mcp-input');
    const message = inputField.value.trim();
    if (!message) return;
    
    // Close mobile sidebar if open
    const sidebar = document.getElementById('chat-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && overlay) {
      sidebar.classList.add('max-[1024px]:right-[-320px]');
      sidebar.classList.remove('max-[1024px]:right-0');
      overlay.classList.add('hidden');
    }
    
    // Hide welcome screen
    const welcome = document.getElementById('welcome-screen');
    if (welcome) welcome.style.display = 'none';
    
    inputField.value = '';
    inputField.style.height = 'auto'; // Reset size
    inputField.disabled = true;
    
    appendMessage('user', message);
    showTyping();
    
    // Append logs
    appendProtocolLog('USER_INPUT', `Prompt: "${message.substring(0, 45)}${message.length > 45 ? '...' : ''}"`, 'SUCCESS');
    appendProtocolLog('API_CALL', 'POST /api/chat', 'RUNNING');
    
    // Increase CPU Load to simulate generation
    setCpuLoad(Math.random() * 25 + 65); // 65-90% CPU usage
    
    const startTime = Date.now();
    
    try {
      // Check if prompt references a CNPJ to log the tool execution
      const cnpjRegex = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2}/;
      const matchedCnpj = message.match(cnpjRegex);
      if (matchedCnpj) {
        appendProtocolLog('MCP_CALL', `fetch_cnpj_data(${matchedCnpj[0]})`, 'PENDING');
      }
      
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          history: chatHistory
        })
      });
      
      const data = await response.json();
      removeTyping();
      
      const latency = Date.now() - startTime;
      appendProtocolLog('API_CALL', `POST /api/chat - Response received (${latency}ms)`, '200_OK');
      
      if (data.error) {
        appendMessage('assistant', `⚠️ Erro: ${data.error}`);
        appendProtocolLog('SYSTEM', `Inference failed: ${data.error}`, 'FAILED');
      } else {
        // If it was a CNPJ query, log completion
        if (matchedCnpj) {
          appendProtocolLog('MCP_CALL', `fetch_cnpj_data(${matchedCnpj[0]})`, 'COMPLETED');
          // Update Latency in Receita stream
          setReceitaLatency(Math.floor(latency * 0.45)); // Simulate Receita call takes ~45% of total time
        }
        
        appendMessage('assistant', data.content);
        chatHistory = data.history;
      }
      
    } catch (err) {
      removeTyping();
      appendMessage('assistant', `⚠️ Erro de conexão com o Bridge: ${err.message}. Certifique-se que o comando npm start está rodando na raiz.`);
      appendProtocolLog('SYSTEM', `Connection failed: ${err.message}`, 'ERROR');
    } finally {
      inputField.disabled = false;
      inputField.focus();
      // Reset CPU Load back to idle
      setCpuLoad(Math.random() * 1.5 + 0.8);
    }
  }
  
  function appendMessage(role, text) {
    const historyDiv = document.getElementById('mcp-chat-history');
    if (!historyDiv) return;
    
    if (role === 'assistant') {
      let cleanText = text.replace(/<\|.*?\|>/g, "").trim();
      let thoughtText = "";
      
      const thoughtRegex = /\[\s*(?:Raciocínio|Resposta|Ação|Pensamento)\s+MCP\s*\]([\s\S]*?)(?=\[\s*(?:Raciocínio|Resposta|Ação|Pensamento|Resultado)\s*\]|$)/i;
      const match = cleanText.match(thoughtRegex);
      if (match) {
        thoughtText = match[1].trim();
        cleanText = cleanText.replace(thoughtRegex, "").trim();
        if (!cleanText) {
          cleanText = thoughtText;
          thoughtText = "";
        }
      }
      
      // Update Reasoning Core in Right Sidebar
      const sidebarReasoning = document.getElementById('sidebar-reasoning');
      if (thoughtText && sidebarReasoning) {
        sidebarReasoning.innerHTML = `<span class="text-primary/50">&gt; ROOT_PROCESS:</span><br>${formatMarkdown(thoughtText)}`;
        appendProtocolLog('REASONING', 'Reasoning layer synthesized', 'SUCCESS');
      }
      
      const rowDiv = document.createElement('div');
      rowDiv.className = 'flex justify-start mb-4';
      
      let htmlContent = `
        <div class="max-w-[90%] flex items-start gap-md w-full">
          <div class="w-8 h-8 rounded bg-surface-container-highest border border-outline-variant flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-primary text-[18px]" style="font-variation-settings: 'FILL' 1;">neurology</span>
          </div>
          <div class="bg-surface-container/80 backdrop-blur rounded-lg border-l-4 border-l-primary overflow-hidden border border-outline-variant shadow-2xl flex-1 p-md space-y-md select-text">
      `;
      
      if (thoughtText) {
        htmlContent += `
          <!-- Processing Box inside chat -->
          <div class="space-y-xs">
            <div class="flex items-center gap-sm">
              <span class="text-[10px] font-label-code text-primary animate-pulse-logic uppercase tracking-widest">Protocol Processing</span>
            </div>
            <div class="p-sm bg-surface-container-low/40 rounded border border-outline-variant/30 text-on-surface-variant font-label-code text-[12px] leading-relaxed">
              <span class="text-primary/70 mr-1">&gt;</span> ${formatMarkdown(thoughtText)}
            </div>
          </div>
        `;
      }
      
      htmlContent += `
            <div class="text-on-surface font-body-md leading-relaxed">${formatMarkdown(cleanText)}</div>
          </div>
        </div>
      `;
      
      rowDiv.innerHTML = htmlContent;
      historyDiv.appendChild(rowDiv);
    } else {
      // User message
      const rowDiv = document.createElement('div');
      rowDiv.className = 'flex justify-end mb-4';
      rowDiv.innerHTML = `
        <div class="max-w-[80%] p-md rounded-lg border border-primary/20 glass-panel logic-glow select-text">
          <p class="text-on-surface font-body-md">${formatMarkdown(text)}</p>
        </div>
      `;
      historyDiv.appendChild(rowDiv);
    }
    
    // Scroll chat area
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }
  
  function formatMarkdown(text) {
    if (!text) return "";
    
    // Escape HTML tags for safety
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
      
    // Code blocks
    html = html.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)\n```/g, '<pre class="bg-black/50 p-sm rounded border border-outline-variant/30 font-label-code text-xs overflow-x-auto my-xs"><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-surface-variant/40 px-1 rounded font-label-code text-xs text-tertiary">$1</code>');
    
    // Bold
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong class="font-bold text-on-surface">$1</strong>');
    
    // Italic
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-primary hover:text-primary-fixed underline transition-colors">$1</a>');
    
    // Lists, Headers, and Tables parsing line by line
    let lines = html.split('\n');
    let inList = false;
    let inTable = false;
    let tableHeaderDone = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Headers
      if (line.startsWith('### ')) {
        lines[i] = '<h4 class="font-headline-sm text-sm text-on-surface mt-sm mb-xs uppercase tracking-wider font-bold">' + line.substring(4) + '</h4>';
        continue;
      }
      if (line.startsWith('## ')) {
        lines[i] = '<h3 class="font-headline-sm text-base text-on-surface mt-md mb-sm font-bold">' + line.substring(3) + '</h3>';
        continue;
      }
      if (line.startsWith('# ')) {
        lines[i] = '<h2 class="font-headline-sm text-lg text-on-surface mt-lg mb-md font-extrabold">' + line.substring(2) + '</h2>';
        continue;
      }
      
      // Tables
      if (line.startsWith('|') && line.endsWith('|')) {
        if (line.match(/^\|[\s\-\|]+$/)) {
          lines[i] = ''; // Skip separator line
          tableHeaderDone = true;
          continue;
        }
        
        let cells = line.split('|').slice(1, -1).map(c => c.trim());
        let cellTag = (!tableHeaderDone && !inTable) ? 'th' : 'td';
        let rowHtml = '<tr class="border-b border-outline-variant/10 hover:bg-surface-variant/10 transition-colors">' + cells.map(c => `<${cellTag} class="border border-outline-variant/20 p-xs text-left ${cellTag==='th'?'bg-surface-container-high font-bold text-xs text-primary':'text-xs text-on-surface-variant'}">${c}</${cellTag}>`).join('') + '</tr>';
        
        if (!inTable) {
          lines[i] = '<table class="border-collapse w-full my-sm text-xs border border-outline-variant/30">' + rowHtml;
          inTable = true;
        } else {
          lines[i] = rowHtml;
        }
        continue;
      } else {
        if (inTable) {
          lines[i-1] = lines[i-1] + '</table>';
          inTable = false;
          tableHeaderDone = false;
        }
      }
      
      // Lists
      if (line.startsWith('* ') || line.startsWith('- ')) {
        let content = line.substring(2);
        if (!inList) {
          lines[i] = '<ul class="list-disc pl-md space-y-xs my-sm"><li>' + content + '</li>';
          inList = true;
        } else {
          lines[i] = '<li>' + content + '</li>';
        }
      } else {
        if (inList) {
          lines[i-1] = lines[i-1] + '</ul>';
          inList = false;
        }
      }
    }
    
    if (inTable) {
      lines[lines.length - 1] = lines[lines.length - 1] + '</table>';
    }
    if (inList) {
      lines[lines.length - 1] = lines[lines.length - 1] + '</ul>';
    }
    
    html = lines.join('\n');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    return html;
  }
  
  function showTyping() {
    const historyDiv = document.getElementById('mcp-chat-history');
    if (!historyDiv) return;
    
    const rowDiv = document.createElement('div');
    rowDiv.className = 'flex justify-start mb-4';
    rowDiv.id = 'typing-indicator-row';
    
    rowDiv.innerHTML = `
      <div class="max-w-[90%] flex items-start gap-md w-full">
        <div class="w-8 h-8 rounded bg-surface-container-highest border border-outline-variant flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-primary text-[18px]" style="font-variation-settings: 'FILL' 1;">neurology</span>
        </div>
        <div class="space-y-sm">
          <div class="flex items-center gap-sm">
            <span class="text-[10px] font-label-code text-primary animate-pulse-logic uppercase tracking-widest">Protocol Processing</span>
            <div class="flex gap-1.5">
              <div class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce shadow-[0_0_5px_rgba(184,195,255,0.5)]"></div>
              <div class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s] shadow-[0_0_5px_rgba(184,195,255,0.5)]"></div>
              <div class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s] shadow-[0_0_5px_rgba(184,195,255,0.5)]"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    historyDiv.appendChild(rowDiv);
    
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }
  
  function removeTyping() {
    const typing = document.getElementById('typing-indicator-row');
    if (typing) typing.remove();
  }
  
  function clearConversation() {
    chatHistory = [];
    const historyDiv = document.getElementById('mcp-chat-history');
    if (!historyDiv) return;
    
    // Restore welcome screen
    historyDiv.innerHTML = `
      <div id="welcome-screen" class="welcome-screen flex flex-col items-center text-center py-lg my-auto">
        <div class="welcome-icon text-[3rem] mb-sm animate-[float_4s_ease-in-out_infinite] select-none">🎓</div>
        <h2 class="font-headline-sm text-2xl font-bold mb-xs text-on-surface">Demonstração Acadêmica MCP</h2>
        <p class="text-on-surface-variant font-body-sm max-w-[500px] mb-md leading-relaxed">
          Este painel permite interagir em tempo real com o modelo local <strong>Qwen 2.5 Coder (7B)</strong> usando ferramentas do protocolo MCP. Faça perguntas ou selecione um comando abaixo para auditar CNPJs.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-sm max-w-[700px] w-full">
          <button class="p-sm bg-surface-container hover:bg-surface-variant/40 border border-outline-variant rounded text-left transition-all hover:-translate-y-0.5" onclick="sendSuggestion('Faça uma auditoria no CNPJ 19.131.243/0001-97')">
            <span class="block text-[11px] font-bold text-primary font-label-code uppercase tracking-wider mb-1">📋 Auditoria Completa</span>
            <span class="text-xs text-on-surface-variant">"Faça uma auditoria no CNPJ 19.131.243/0001-97"</span>
          </button>
          <button class="p-sm bg-surface-container hover:bg-surface-variant/40 border border-outline-variant rounded text-left transition-all hover:-translate-y-0.5" onclick="sendSuggestion('Valide se o CNPJ 00.000.000/0000-00 está correto')">
            <span class="block text-[11px] font-bold text-primary font-label-code uppercase tracking-wider mb-1">🛡️ Validação Matemática</span>
            <span class="text-xs text-on-surface-variant">"Valide se o CNPJ 00.000.000/0000-00 está correto"</span>
          </button>
          <button class="p-sm bg-surface-container hover:bg-surface-variant/40 border border-outline-variant rounded text-left transition-all hover:-translate-y-0.5" onclick="sendSuggestion('Busque os dados cadastrais da receita para o CNPJ 45.997.418/0001-53')">
            <span class="block text-[11px] font-bold text-primary font-label-code uppercase tracking-wider mb-1">🌐 Consulta Cadastral</span>
            <span class="text-xs text-on-surface-variant">"Busque os dados da receita para o CNPJ 45.997.418/0001-53"</span>
          </button>
        </div>
      </div>
    `;
    
    // Clear sidebar reasoning
    const sidebarReasoning = document.getElementById('sidebar-reasoning');
    if (sidebarReasoning) {
      sidebarReasoning.innerHTML = `<span class="text-primary/50">&gt; ROOT_PROCESS:</span> Aguardando comandos ou interações de auditoria para processar o raciocínio MCP...`;
    }
    
    // Clear logs and re-insert the initial one
    const tbody = document.getElementById('terminal-logs-tbody');
    if (tbody) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(Math.floor(now.getMilliseconds() / 10))}`;
      
      tbody.innerHTML = `
        <tr class="hover:bg-primary/5 transition-colors" id="row-initial-log">
          <td class="px-md py-1 text-outline/60">${timestamp}</td>
          <td class="px-md py-1 text-primary font-bold">SYSTEM</td>
          <td class="px-md py-1 text-on-surface">Console de atividades MCP limpo e reinicializado.</td>
          <td class="px-md py-1 text-right text-green-500/70">READY</td>
        </tr>
      `;
    }
    
    // Reset CPU load
    setCpuLoad(1.2);
  }
  
  return { init };
})();

// External global trigger for suggestions
window.sendSuggestion = function(text) {
  const inputField = document.getElementById('mcp-input');
  if (inputField) {
    inputField.value = text;
    // Auto-grow
    inputField.style.height = 'auto';
    inputField.style.height = (inputField.scrollHeight) + 'px';
    // Trigger button click
    const btnSend = document.getElementById('mcp-send-btn');
    if (btnSend) btnSend.click();
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.Chat) window.Chat.init();
});
