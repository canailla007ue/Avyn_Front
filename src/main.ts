import './style.css'
import Logo from './assets/logo.svg'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001';

const app = document.getElementById('app');
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let mediaStream: MediaStream | null = null;

if (!app) throw new Error('#app no encontrado');


app.innerHTML = `
  <div class="chat-container">
    <header class="chat-header">
      <div class="header-title">
        <img src="${Logo}" class="framework" alt="Logo AVYN">
      </div>
    </header>
    <main class="chat-content">
      <h1 class="welcome-text">¿Cómo podemos ayudarte?</h1>
      <div class="messages" role="log"></div>
    </main>
    <footer class="chat-footer">
      <div class="suggestions">
        <button class="chip">Navega a la web</button>
      </div>
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

const messages = document.querySelector('.messages') as HTMLDivElement;
const input = document.getElementById('chat-input') as HTMLInputElement;
const micBtn = document.getElementById('mic-btn') as HTMLButtonElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

function toggleLoading(isLoading: boolean) {
  const existing = document.getElementById('loading-indicator');
  if (isLoading) {
    input.disabled = true;
    sendBtn.disabled = true;
    const loader = document.createElement('div');
    loader.id = 'loading-indicator';
    loader.className = 'message bot thinking';
    loader.textContent = 'AVYN está pensando...';
    messages.appendChild(loader);
    messages.scrollTop = messages.scrollHeight;
  } else {
    input.disabled = false;
    sendBtn.disabled = false;
    existing?.remove();
    input.focus();
  }
}

function mostrarMensaje(type: 'user' | 'bot', text: string) {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

async function mandarMensaje() {
  const text = input.value.trim();
  if (!text || input.disabled) return;

  mostrarMensaje('user', text);
  input.value = '';
  toggleLoading(true);

  try {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    console.log('Respuesta del servidor:', data); // debug
    manejarRespuesta(data);
  } catch (err) {
    mostrarMensaje('bot', 'Error de conexión con el servidor.');
    // TODO: diferenciar entre timeout, 500, y red caída
  } finally {
    toggleLoading(false);
  }
}



function getSupportedAudioMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }

  return '';
}

micBtn.addEventListener('click', async () => {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎤';
    return;
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      mostrarMensaje('bot', 'Tu navegador no soporta grabacion de audio.');
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
    micBtn.classList.add('recording');
    micBtn.textContent = '🛑';
  } catch {
    mostrarMensaje('bot', 'No se pudo acceder al microfono. Revisa permisos del navegador.');
  }
});

async function enviarAudio(blob: Blob) {
  console.log('Se envia audio:', blob.type, blob.size, 'bytes'); // debug
  mostrarMensaje('user', '🎤 Audio enviado');
  toggleLoading(true);
  micBtn.disabled = true;
  const formData = new FormData();
  const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
  const fileName = `recording-${Date.now()}.${ext}`;
  formData.append('file', blob, fileName);
  formData.append('mimetype', blob.type || 'audio/webm');

  try {
    const res = await fetch(`${API_BASE_URL}/chat/audio`, { method: 'POST', body: formData });
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
    micBtn.disabled = false;
  }
}



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
        headers: { 'Content-Type': 'application/json' },
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
  messages.appendChild(card);
  messages.scrollTop = messages.scrollHeight;
}



sendBtn.addEventListener('click', () => {
  void mandarMensaje();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    void mandarMensaje();
  }
});


const chipBtn = document.querySelector('.chip') as HTMLButtonElement;
if (chipBtn && input) {
  chipBtn.addEventListener('click', () => {
    input.value = 'Navega a la web';
    input.focus();
  });
}