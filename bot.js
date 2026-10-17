const https = require('https');

const TELEGRAM_TOKEN = '8924821773:AAHKa1VS2OWO02H_8yVUtvrxeYCJ3UP60zI';
const SUPABASE_URL = 'mrguzwanppznmvpxsnqq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZ3V6d2FucHB6bm12cHhzbnFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODA3MjYsImV4cCI6MjA5MjI1NjcyNn0.cVPzW5PH1BeH49EefybHVGGTcBHYBa14aS9Z8mKziOo';

const AREAS = ['Marketing','RRHH','Comercial','Adm','IT','Tec','Medios','Agro','Real Estate','Coordinación'];
const RESPONSABLES = ['Dolo','Jose','Japo','Rafi','Gonza','Raúl','MKT','Coordinación','Lean G','Lean F','Ana Paula','Vero','Albana','Martin Glade','Hernán','Mariana','Gabriela'];
const TIPOS = ['Seguimiento','Validar','Desarrollar','Revisión','Reunión','Entrega','Prioridad Alta','Otro'];

const sessions = {};

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function tgRequest(method, params) {
  const body = JSON.stringify(params);
  return httpRequest({
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_TOKEN}/${method}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);
}

function sendMessage(chatId, text, keyboard) {
  const params = { chat_id: chatId, text };
  if (keyboard) params.reply_markup = { keyboard, resize_keyboard: true, one_time_keyboard: true };
  return tgRequest('sendMessage', params);
}

async function saveTask(task) {
  const body = JSON.stringify({
    title: task.titulo,
    area: task.area,
    responsible: task.responsable,
    type: task.tipo,
    status: 'Pendiente',
    deadline: task.deadline || null,
    notes: ''
  });
  return httpRequest({
    hostname: SUPABASE_URL,
    path: '/rest/v1/tasks',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    }
  }, body);
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  let s = sessions[chatId] || { step: 'idle' };

  if (text === '/nueva' || text === '/start') {
    sessions[chatId] = { step: 'titulo' };
    await sendMessage(chatId, '📝 *Nueva tarea*\n\n¿Cuál es el título?');
    return;
  }

  if (s.step === 'titulo') {
    s.titulo = text;
    s.step = 'area';
    sessions[chatId] = s;
    await sendMessage(chatId, '¿A qué área pertenece?', AREAS.map(a => [a]));
    return;
  }

  if (s.step === 'area') {
    s.area = text;
    s.step = 'responsable';
    sessions[chatId] = s;
    await sendMessage(chatId, '¿Quién es el responsable?', RESPONSABLES.map(r => [r]));
    return;
  }

  if (s.step === 'responsable') {
    s.responsable = text;
    s.step = 'tipo';
    sessions[chatId] = s;
    await sendMessage(chatId, '¿Qué tipo de tarea es?', TIPOS.map(t => [t]));
    return;
  }

  if (s.step === 'tipo') {
    s.tipo = text;
    s.step = 'deadline';
    sessions[chatId] = s;
    await sendMessage(chatId, '¿Tiene fecha límite? (ej: 2026-10-30) o escribí "sin fecha"');
    return;
  }

  if (s.step === 'deadline') {
    s.deadline = text === 'sin fecha' ? null : text;
    s.step = 'confirmar';
    sessions[chatId] = s;
    await sendMessage(chatId,
      `✅ *Confirmá la tarea:*\n\n📌 ${s.titulo}\n🏢 ${s.area}\n👤 ${s.responsable}\n🏷️ ${s.tipo}\n📅 ${s.deadline || 'Sin fecha'}`,
      [['✅ Confirmar'], ['❌ Cancelar']]
    );
    return;
  }

  if (s.step === 'confirmar') {
    if (text === '✅ Confirmar') {
      try {
        await saveTask(s);
        console.log('Tarea guardada:', s.titulo);
        await sendMessage(chatId, '🎉 ¡Tarea cargada al tablero!');
      } catch(e) {
        console.error('Error guardando:', e);
        await sendMessage(chatId, '❌ Error al guardar. Intentá de nuevo con /nueva');
      }
    } else {
      await sendMessage(chatId, '❌ Cancelado. Usá /nueva para empezar de nuevo.');
    }
    sessions[chatId] = { step: 'idle' };
    return;
  }

  await sendMessage(chatId, 'Usá /nueva para cargar una tarea.');
}

let offset = 0;
async function poll() {
  try {
    const res = await tgRequest('getUpdates', { offset, timeout: 30 });
    if (res.result && res.result.length > 0) {
      for (const update of res.result) {
        offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
      }
    }
  } catch(e) {
    console.error('Poll error:', e.message);
    await new Promise(r => setTimeout(r, 5000));
  }
  poll();
}

console.log('🤖 Bot Coordinación GR iniciado');
poll();
