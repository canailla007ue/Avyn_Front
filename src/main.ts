import './style.css'
import Logo from './assets/logo.svg'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://localhost:8443';
const TOKEN_KEY = 'avyn_token';
const app = document.getElementById('app');

// Variables globales para el chat y audio
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let mediaStream: MediaStream | null = null;

let messagesElement: HTMLDivElement;
let inputElement: HTMLInputElement;
let micBtnElement: HTMLButtonElement;
let sendBtnElement: HTMLButtonElement;

if (!app) throw new Error('#app no encontrado');

// --- Gestión del Token ---
function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// --- Vista de Login ---
function mostrarLogin() {
  app!.innerHTML = `
    <div class="login-container" style="display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f5f7fb;">
      <form id="login-form" class="login-card" style="display: flex; flex-direction: column; width: 100%; max-width: 400px; padding: 2.5rem; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); gap: 1.2rem;">
        <div style="text-align: center; margin-bottom: 1rem;">
          <img src="${Logo}" alt="Logo AVYN" style="height: 50px; margin-bottom: 1rem;">
          <h1 style="font-size: 1.8rem; color: #1e293b; margin: 0;">Acceso a AVYN</h1>
          <p style="color: #64748b; font-size: 0.9rem; margin-top: 0.4rem;">Introduce tus credenciales para continuar</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <label for="email" style="font-size: 0.85rem; font-weight: 600; color: #475569;">Email</label>
          <input 
            type="email" 
            id="email" 
            placeholder="ejemplo@correo.com" 
            required 
            style="padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem;"
          />
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <label for="password" style="font-size: 0.85rem; font-weight: 600; color: #475569;">Contraseña</label>
          <input 
            type="password" 
            id="password" 
            placeholder="••••••••" 
            required 
            style="padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem;"
          />
        </div>

        <button type="submit" style="padding: 0.75rem; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s;">
          Entrar
        </button>

        <p id="login-error" style="color: #ef4444; font-size: 0.9rem; text-align: center; margin: 0; min-height: 1.2rem; font-weight: 500;"></p>
      </form>
    </div>
  `;

  const form = document.getElementById('login-form') as HTMLFormElement;
  const errorElement = document.getElementById('login-error') as HTMLParagraphElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorElement.textContent = ''; // Limpiar errores previos

    const email = (document.getElementById('email') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        // Captura el mensaje exacto que devuelve tu backend ("Credenciales de acceso incorrectas", etc.)
        errorElement.textContent = data.detail || 'Usuario o contraseña incorrectos';
        return;
      }

      // Guardamos el token (access_token según tus capturas de Bruno)
      saveToken(data.access_token);
      mostrarChat();

    } catch (err) {
      errorElement.textContent = 'Error de conexión con el servidor';
    }
  });
}

// --- Vista de Chat ---
function mostrarChat() {
  app!.innerHTML = `
    <div class="chat-container">
      <header class="chat-header">
        <div class="header-title" style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
          <img src="${Logo}" class="framework" alt="Logo AVYN">
          <button id="logout-btn" style="padding: 0.5rem 1rem; background: #e2e8f0; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">Cerrar sesión</button>
        </div>
      </header>
      <main class="chat-content">
        <h1 class="welcome-text">¿Cómo podemos ayudarte?</h1>
        <div class="messages" role="log"></div>
      </main>
      <footer class="chat-footer">
     
        <div class="input-area">
          <button class="plus-btn">+</button>
          <input type="text" id="chat-input" placeholder="Escribe algo o usa el micro...">
          <button type="button" id="mic-btn" class="audio-btn">🎤</button>
          <button type="button" id="send-btn" class="send-btn">↑</button>
        </div>
        <p class="disclaimer">La IA puede cometer errores. Verifica la información importante.</p>
      </footer>
    </div>
  `;

  // Mapear elementos del DOM del chat tras ser inyectados
  messagesElement = document.querySelector('.messages') as HTMLDivElement;
  inputElement = document.getElementById('chat-input') as HTMLInputElement;
  micBtnElement = document.getElementById('mic-btn') as HTMLButtonElement;
  sendBtnElement = document.getElementById('send-btn') as HTMLButtonElement;
  const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
  const chipBtn = document.querySelector('.chip') as HTMLButtonElement;

  // Registrar listeners del Chat
  sendBtnElement.addEventListener('click', () => void mandarMensaje());

  inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void mandarMensaje();
    }
  });

  if (chipBtn) {
    chipBtn.addEventListener('click', () => {
      inputElement.value = 'Navega a la web';
      inputElement.focus();
    });
  }

  logoutBtn.addEventListener('click', () => {
    clearToken();
    mostrarLogin();
  });

  // Configurar el micrófono
  inicializarMicrofono();
}

// --- Funciones del Chat ---
function toggleLoading(isLoading: boolean) {
  const existing = document.getElementById('loading-indicator');
  if (isLoading) {
    inputElement.disabled = true;
    sendBtnElement.disabled = true;
    const loader = document.createElement('div');
    loader.id = 'loading-indicator';
    loader.className = 'message bot thinking';
    loader.textContent = 'AVYN está pensando...';
    messagesElement.appendChild(loader);
    messagesElement.scrollTop = messagesElement.scrollHeight;
  } else {
    inputElement.disabled = false;
    sendBtnElement.disabled = false;
    existing?.remove();
    inputElement.focus();
  }
}

function mostrarMensaje(type: 'user' | 'bot', text: string) {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.textContent = text;
  messagesElement.appendChild(div);
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

async function mandarMensaje() {
  const text = inputElement.value.trim();
  if (!text || inputElement.disabled) return;

  mostrarMensaje('user', text);
  inputElement.value = '';
  toggleLoading(true);

  try {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}` // Adjuntamos token de seguridad
      },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    manejarRespuesta(data);
  } catch (err) {
    mostrarMensaje('bot', 'Error de conexión con el servidor.');
  } finally {
    toggleLoading(false);
  }
}

// --- Lógica del Micrófono / Grabación ---
function getSupportedAudioMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

function inicializarMicrofono() {
  micBtnElement.addEventListener('click', async () => {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
      micBtnElement.classList.remove('recording');
      micBtnElement.textContent = '🎤';
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        mostrarMensaje('bot', 'Tu navegador no soporta grabación de audio.');
        return;
      }

      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      mediaRecorder = mimeType
          ? new MediaRecorder(mediaStream, { mimeType })
          : new MediaRecorder(mediaStream);

      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const blobType = mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks, { type: blobType });
        await enviarAudio(audioBlob);
        mediaStream?.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      };
      mediaRecorder.start();
      micBtnElement.classList.add('recording');
      micBtnElement.textContent = '🛑';
    } catch {
      mostrarMensaje('bot', 'No se pudo acceder al micrófono. Revisa permisos del navegador.');
    }
  });
}

async function enviarAudio(blob: Blob) {
  mostrarMensaje('user', '🎤 Audio enviado');
  toggleLoading(true);
  micBtnElement.disabled = true;

  const formData = new FormData();
  const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
  const fileName = `recording-${Date.now()}.${ext}`;
  formData.append('file', blob, fileName);
  formData.append('mimetype', blob.type || 'audio/webm');

  try {
    const res = await fetch(`${API_BASE_URL}/chat/audio`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`
      },
      body: formData
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = data.message || `Error al procesar audio (HTTP ${res.status})`;
      mostrarMensaje('bot', message);
      return;
    }

    manejarRespuesta(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error al procesar audio';
    mostrarMensaje('bot', msg);
  } finally {
    toggleLoading(false);
    micBtnElement.disabled = false;
  }
}

// --- Manejo de Respuestas de la API ---
function manejarRespuesta(data: any) {
  const res = data.response || data;

  if (res.type === 'form') {
    mostrarFormulario(res);
  } else {
    const texto = typeof res === 'string' ? res : (res.text || "No entiendo la respuesta");
    mostrarMensaje('bot', texto);
  }
}

function mostrarFormulario(config: any) {
  const card = document.createElement('div');
  card.className = 'message bot message-form';

  const title = document.createElement('h3');
  title.className = 'form-title';
  title.textContent = config.title;

  const description = document.createElement('p');
  description.className = 'form-description';
  description.textContent = config.description || '';

  const form = document.createElement('form');
  form.className = 'dynamic-form';

  config.fields.forEach((f: any) => {
    const fieldLabel = document.createElement('label');
    fieldLabel.className = 'form-field';

    const span = document.createElement('span');
    span.textContent = f.label;

    const inputField = document.createElement('input');
    inputField.type = f.type;
    inputField.name = f.name;
    inputField.placeholder = f.label;
    inputField.required = f.required ?? true;

    fieldLabel.appendChild(span);
    fieldLabel.appendChild(inputField);
    form.appendChild(fieldLabel);
  });

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'form-submit';
  submitBtn.textContent = config.submitText;

  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dataObj = Object.fromEntries(new FormData(form).entries());

    mostrarMensaje('user', `Enviando datos...`);
    toggleLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(dataObj)
      });
      const resData = await res.json();
      manejarRespuesta(resData);
    } catch {
      mostrarMensaje('bot', 'Error al enviar formulario');
    } finally {
      toggleLoading(false);
    }
  });

  card.appendChild(title);
  if (config.description) card.appendChild(description);
  card.appendChild(form);
  messagesElement.appendChild(card);
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

// --- Flujo Inicial de Arranque ---
const token = getToken();
if (token) {
  mostrarChat();
} else {
  mostrarLogin();
}