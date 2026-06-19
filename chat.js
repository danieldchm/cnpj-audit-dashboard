window.Chat = (function() {
  let chatHistory = [];
  let statusInterval = null;
  
  function init() {
    const btnSend = document.getElementById('mcp-send-btn');
    const inputField = document.getElementById('mcp-input');
    const btnClear = document.getElementById('btn-clear-chat');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const chatSidebar = document.getElementById('chat-sidebar');
    
    if (btnSend && inputField) {
      btnSend.addEventListener('click', sendMessage);
      inputField.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          sendMessage();
        }
      });
    }
    
    if (btnClear) {
      btnClear.addEventListener('click', clearConversation);
    }

    // Mobile sidebar toggle handlers
    if (btnToggleSidebar && chatSidebar && sidebarOverlay) {
      btnToggleSidebar.addEventListener('click', () => {
        chatSidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
      });
    }

    if (btnCloseSidebar && chatSidebar && sidebarOverlay) {
      btnCloseSidebar.addEventListener('click', () => {
        chatSidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
      });
    }

    if (sidebarOverlay && chatSidebar) {
      sidebarOverlay.addEventListener('click', () => {
        chatSidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
      });
    }
    
    // Check status immediately and set interval
    checkStatus();
    statusInterval = setInterval(checkStatus, 5000);
  }
  
  async function checkStatus() {
    const dotBridge = document.getElementById('dot-bridge');
    const dotOllama = document.getElementById('dot-ollama');
    const dotMcp = document.getElementById('dot-mcp');
    const dotBridgeMobile = document.getElementById('dot-bridge-mobile');
    const dotOllamaMobile = document.getElementById('dot-ollama-mobile');
    const dotMcpMobile = document.getElementById('dot-mcp-mobile');
    
    try {
      const response = await fetch('http://localhost:3001/api/status');
      const data = await response.json();
      
      // Update Bridge
      updateDot(dotBridge, data.bridge);
      updateDot(dotBridgeMobile, data.bridge);
      // Update Ollama
      updateDot(dotOllama, data.ollama);
      updateDot(dotOllamaMobile, data.ollama);
      // Update MCP
      updateDot(dotMcp, data.mcp);
      updateDot(dotMcpMobile, data.mcp);
      
    } catch (err) {
      // Bridge is down entirely
      updateDot(dotBridge, false);
      updateDot(dotBridgeMobile, false);
      updateDot(dotOllama, false);
      updateDot(dotOllamaMobile, false);
      updateDot(dotMcp, false);
      updateDot(dotMcpMobile, false);
    }
  }
  
  function updateDot(element, isOnline) {
    if (!element) return;
    element.className = 'status-dot'; // Reset classes
    if (isOnline) {
      element.classList.add('online');
    } else {
      element.classList.add('offline');
    }
  }
  
  async function sendMessage() {
    const inputField = document.getElementById('mcp-input');
    const message = inputField.value.trim();
    if (!message) return;
    
    // Close mobile sidebar if open
    const chatSidebar = document.getElementById('chat-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (chatSidebar && sidebarOverlay) {
      chatSidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    }
    
    // Hide welcome screen if visible
    const welcome = document.getElementById('welcome-screen');
    if (welcome) {
      welcome.style.display = 'none';
    }
    
    inputField.value = '';
    inputField.disabled = true;
    
    appendMessage('user', message);
    showTyping();
    
    try {
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
      
      if (data.error) {
        appendMessage('assistant', `⚠️ Erro: ${data.error}`);
      } else {
        appendMessage('assistant', data.content);
        chatHistory = data.history; // Update history for follow-ups
      }
      
    } catch (err) {
      removeTyping();
      appendMessage('assistant', `⚠️ Erro de conexão com o Bridge: ${err.message}. Certifique-se que o comando npm start está rodando na raiz.`);
    } finally {
      inputField.disabled = false;
      inputField.focus();
    }
  }
  
  function appendMessage(role, text) {
    const historyDiv = document.getElementById('mcp-chat-history');
    
    const rowDiv = document.createElement('div');
    rowDiv.className = `message-row ${role}`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    
    if (role === 'assistant') {
      // Limpar resíduos de tokens de controle de template se houver
      let cleanText = text.replace(/<\|.*?\|>/g, "").trim();
      let thoughtText = "";
      
      const thoughtRegex = /\[\s*(?:Raciocínio|Resposta|Ação|Pensamento)\s+MCP\s*\]([\s\S]*?)(?=\[\s*(?:Raciocínio|Resposta|Ação|Pensamento|Resultado)\s*\]|$)/i;
      const match = cleanText.match(thoughtRegex);
      if (match) {
        thoughtText = match[1].trim();
        cleanText = cleanText.replace(thoughtRegex, "").trim();
        // Se após remover o bloco de pensamento a resposta principal ficar vazia,
        // usamos o próprio bloco como texto principal para não deixar o balão vazio.
        if (!cleanText) {
          cleanText = thoughtText;
          thoughtText = "";
        }
      }
      
      let htmlText = "";
      if (thoughtText) {
        htmlText += `
          <div class="mcp-thought-block">
            <div class="mcp-thought-title">
              <span style="font-size:1rem; line-height:1;">🧠</span> Raciocínio &amp; Ferramenta MCP
            </div>
            <div>${formatMarkdown(thoughtText)}</div>
          </div>
        `;
      }
      
      htmlText += `<div>${formatMarkdown(cleanText)}</div>`;
      bubbleDiv.innerHTML = htmlText;
    } else {
      bubbleDiv.innerHTML = formatMarkdown(text);
    }
    
    rowDiv.appendChild(bubbleDiv);
    historyDiv.appendChild(rowDiv);
    
    // Scroll chat area
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }
  
  function formatMarkdown(text) {
    if (!text) return "";
    
    // Escapar tags HTML para segurança
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
      
    // Code blocks
    html = html.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)\n```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--blue-400);text-decoration:underline;">$1</a>');
    
    // Lists, Headers, and Tables parsing line by line
    let lines = html.split('\n');
    let inList = false;
    let inTable = false;
    let tableHeaderDone = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Headers
      if (line.startsWith('### ')) {
        lines[i] = '<h4 style="margin-top:12px;margin-bottom:6px;color:var(--text-primary);font-size:1rem;font-weight:600;">' + line.substring(4) + '</h4>';
        continue;
      }
      if (line.startsWith('## ')) {
        lines[i] = '<h3 style="margin-top:16px;margin-bottom:8px;color:var(--text-primary);font-size:1.1rem;font-weight:700;">' + line.substring(3) + '</h3>';
        continue;
      }
      if (line.startsWith('# ')) {
        lines[i] = '<h2 style="margin-top:20px;margin-bottom:10px;color:var(--text-primary);font-size:1.25rem;font-weight:800;">' + line.substring(2) + '</h2>';
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
        let rowHtml = '<tr>' + cells.map(c => `<${cellTag} style="border:1px solid var(--border-default);padding:8px;text-align:left;background:${cellTag==='th'?'rgba(255,255,255,0.05)':'transparent'};font-weight:${cellTag==='th'?'600':'400'};">${c}</${cellTag}>`).join('') + '</tr>';
        
        if (!inTable) {
          lines[i] = '<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:0.88rem;border:1px solid var(--border-default);">' + rowHtml;
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
          lines[i] = '<ul style="margin:0 0 12px 0;padding-left:20px;"><li>' + content + '</li>';
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
    
    const rowDiv = document.createElement('div');
    rowDiv.className = 'message-row assistant';
    rowDiv.id = 'typing-indicator-row';
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble typing-container';
    bubbleDiv.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    
    rowDiv.appendChild(bubbleDiv);
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
    
    // Clear and restore welcome screen
    historyDiv.innerHTML = `
      <div class="welcome-screen" id="welcome-screen">
        <div class="welcome-icon">🎓</div>
        <h2>Demonstração Acadêmica MCP</h2>
        <p>
          Este chat permite interagir localmente com o modelo Qwen 2.5 Coder (7B). Ele usará ferramentas do protocolo MCP para consultar o AuditBase em tempo real. Faça perguntas didáticas sobre auditorias.
        </p>
        
        <div class="welcome-suggestions">
          <button class="suggestion-btn" onclick="sendSuggestion('Faça uma auditoria no CNPJ 19.131.243/0001-97')">
            <span class="title">📋 Processo de Auditoria Completo</span>
            <span>"Faça uma auditoria no CNPJ 19.131.243/0001-97"</span>
          </button>
          <button class="suggestion-btn" onclick="sendSuggestion('Valide se o CNPJ 00.000.000/0000-00 está correto')">
            <span class="title">🛡️ Validação Matemática</span>
            <span>"Valide se o CNPJ 00.000.000/0000-00 está correto"</span>
          </button>
          <button class="suggestion-btn" onclick="sendSuggestion('Busque os dados cadastrais da receita para o CNPJ 45.997.418/0001-53')">
            <span class="title">🌐 Consulta Cadastral</span>
            <span>"Busque os dados da receita para o CNPJ 45.997.418/0001-53"</span>
          </button>
        </div>
      </div>
    `;
  }
  
  return { init };
})();

// External global trigger for suggestion buttons
window.sendSuggestion = function(text) {
  const inputField = document.getElementById('mcp-input');
  if (inputField) {
    inputField.value = text;
    // Trigger button click
    const btnSend = document.getElementById('mcp-send-btn');
    if (btnSend) btnSend.click();
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.Chat) window.Chat.init();
});
