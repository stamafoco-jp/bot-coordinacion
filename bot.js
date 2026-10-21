const https = require('https');

const TELEGRAM_TOKEN = '8924821773:AAHKa1VS2OWO02H_8yVUtvrxeYCJ3UP60zI';
const SUPABASE_URL = 'mrguzwanppznmvpxsnqq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZ3V6d2FucHB6bm12cHhzbnFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODA3MjYsImV4cCI6MjA5MjI1NjcyNn0.cVPzW5PH1BeH49EefybHVGGTcBHYBa14aS9Z8mKziOo';

const AREAS = ['Marketing','RRHH','Comercial','Administración','IT','Tec','Medios','Agro','Real Estate','Coordinación'];
const RESPONSABLES = ['Dolo','Jose','Japo','Rafi','Gonza','Raúl','MKT','Coordinación','Lean G','Lean F','Ana Paula','Vero','Albana','Martin Glade','Hernán','Mariana','Gabriela'];
const TIPOS = ['Seguimiento','Validar','Desarrollar','Revisión','Reunión','Entrega','Prioridad Alta','Otro'];

// WHITELIST - agregá los chat IDs acá después
const ALLOWED_CHATS = [];

const sessions = {};
let offset = 0;

function apiRequest(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function supabaseRequest(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/tasks',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function saveTask(task) {
  const body = {
    title: task.titulo,
    area: task.area,
    person: task.responsable,
    tipo: task.tipo,
    status: 'pending',
    date: task.deadline || null,
    nota: '',
    created_date: new Date().toISOString().split('T')[0]
  };
  console.log('Guardando tarea:', JSON.stringify(body));
  const status = await supabaseRequest(body);
  console.log('Supabase status:', status);
  if (status === 201) console.log('Tarea guardada OK:', task.titulo);
  else console.log('Error guardando tarea, status:', status);
  return status === 201;
}

function makeKeyboard(options) {
  const rows = [];
  for (let i = 0; i < options.length; i += 2) {
    rows.push(options.slice(i, i + 2).map(text => ({ text })));
  }
  return { keyboard: rows, one_time_keyboard: true, resize_keyboard: true };
}

async function sendMessage(chatId, text, keyboard) {
  const params = { chat_id: chatId, text };
  if (keyboard) params.reply_markup = keyboard;
  else params.reply_markup = { remove_keyboard: true };
  await apiRequest('sendMessage', params);
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  console.log('Mensaje de chat_id:', chatId, 'texto:', text);

  // Verificar whitelist (si está vacía, todos pueden usar)
  if (ALLOWED_CHATS.length > 0 && !ALLOWED_CHATS.includes(chatId)) {
    await sendMessage(chatId, '⛔ No tenés acceso a este bot.');
    return;
  }

  if (!sessions[chatId]) sessions[chatId] = { step: 'idle' };
  const session = sessions[chatId];

  if (text === '/nueva') {
    session.step = 'titulo';
    session.data = {};
    await sendMessage(chatId, '📝 ¿Cuál es el título de la tarea?');
    return;
  }

  if (text === '/start' || text === '/ayuda') {
    await sendMessage(chatId, '👋 Hola! Usá /nueva para cargar una tarea al tablero.');
    return;
  }

  if (session.step === 'titulo') {
    session.data.titulo = text;
    session.step = 'area';
    await sendMessage(chatId, '📁 ¿Área?', makeKeyboard(AREAS));
  } else if (session.step === 'area') {
    session.data.area = text;
    session.step = 'responsable';
    await sendMessage(chatId, '👤 ¿Responsable?', makeKeyboard(RESPONSABLES));
  } else if (session.step === 'responsable') {
    session.data.responsable = text;
    session.step = 'tipo';
    await sendMessage(chatId, '🏷️ ¿Tipo de tarea?', makeKeyboard(TIPOS));
  } else if (session.step === 'tipo') {
    session.data.tipo = text;
    session.step = 'deadline';
    await sendMessage(chatId, '📅 ¿Fecha límite? (formato DD/MM/AAAA o escribí "sin fecha")');
  } else if (session.step === 'deadline') {
    let fecha = null;
    if (text.toLowerCase() !== 'sin fecha') {
      const partes = text.split('/');
      if (partes.length === 3) {
        fecha = `${partes[2]}-${partes[1].padStart(2,'0')}-${partes[0].padStart(2,'0')}`;
      }
    }
    session.data.deadline = fecha;
    session.step = 'confirmar';
    const resumen = `✅ Confirmá la tarea:\n\n📝 *${session.data.titulo}*\n📁 ${session.data.area}\n👤 ${session.data.responsable}\n🏷️ ${session.data.tipo}\n📅 ${session.data.deadline || 'Sin fecha'}`;
    await apiRequest('sendMessage', {
      chat_id: chatId,
      text: resumen,
      parse_mode: 'Markdown',
      reply_markup: makeKeyboard(['✅ Confirmar', '❌ Cancelar'])
    });
  } else if (session.step === 'confirmar') {
    if (text === '✅ Confirmar') {
      const ok = await saveTask(session.data);
      if (ok) await sendMessage(chatId, '🎉 ¡Tarea cargada al tablero!');
      else await sendMessage(chatId, '❌ Hubo un error al guardar. Intentá de nuevo con /nueva');
    } else {
      await sendMessage(chatId, '❌ Tarea cancelada. Usá /nueva para empezar de nuevo.');
    }
    session.step = 'idle';
  }
}

async function poll() {
  try {
    const res = await apiRequest('getUpdates', { offset, timeout: 30 });
    if (res.ok && res.result.length > 0) {
      for (const update of res.result) {
        offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
      }
    }
  } catch (err) {
    console.log('Poll error:', err.message, '- reintentando en 5s...');
    await new Promise(r => setTimeout(r, 5000));
  }
  poll();
}

console.log('🤖 Bot Coordinación GR iniciado');
poll();
