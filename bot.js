// Bot de Telegram para Tablero de Coordinación GR
const https = require('https');

const TELEGRAM_TOKEN = '8924821773:AAHKa1VS2OWO02H_8yVUtvrxeYCJ3UP60zI';
const SUPABASE_URL = 'mrguzwanppznmvpxsnqq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZ3V6d2FucHB6bm12cHhzbnFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODA3MjYsImV4cCI6MjA5MjI1NjcyNn0.cVPzW5PH1BeH49EefybHVGGTcBHYBa14aS9Z8mKziOo';

const sessions = {};

const AREAS = ['Marketing', 'RRHH', 'Comercial', 'Administración', 'IT', 'Tecnología', 'Medios', 'Agro', 'Real Estate', 'Coordinación'];
const RESPONSABLES = ['Sil', 'Dolo', 'Jose', 'Japo', 'Rafi'];
const TIPOS = ['Seguimiento', 'Validar', 'Desarrollar', 'Revisión', 'Reunión', 'Entrega', 'Prioridad Alta', 'Otro'];

function httpRequest(options, postData) {
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
    if (postData) req.write(postData);
    req.end();
  });
}

async function sendMessage(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = { keyboard, one_time_keyboard: true, resize_keyboard: true };
  const postData = JSON.stringify(body);
  return httpRequest({
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  }, postData);
}

async function guardarTarea(session) {
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const tarea = {
    title: session.titulo, area: session.area, person: session.responsable,
    tipo: session.tipo, date: session.deadline, status: 'pending', created_date: today
  };
  const postData = JSON.stringify(tarea);
  const res = await httpRequest({
    hostname: SUPABASE_URL,
    path: '/rest/v1/tasks',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    }
  }, postData);
  return true;
}

async function processMessage(chatId, text) {
  if (!sessions[chatId]) sessions[chatId] = { step: 0 };
  const session = sessions[chatId];

  if (text === '/start' || text === '/nueva' || text.toLowerCase().includes('nueva tarea')) {
    sessions[chatId] = { step: 1 };
    await sendMessage(chatId, '📋 <b>Nueva tarea</b>\n\n¿Cuál es el título?');
    return;
  }
  if (text === '/cancelar') {
    sessions[chatId] = { step: 0 };
    await sendMessage(chatId, '❌ Cancelado. Mandá /nueva para empezar.');
    return;
  }

  switch (session.step) {
    case 0:
      await sendMessage(chatId, '👋 Hola! Mandá /nueva para cargar una tarea.');
      break;
    case 1:
      session.titulo = text; session.step = 2;
      const ak = []; for (let i=0;i<AREAS.length;i+=2) ak.push(AREAS.slice(i,i+2));
      await sendMessage(chatId, `✅ Título: <b>${text}</b>\n\n¿A qué área pertenece?`, ak);
      break;
    case 2:
      if (!AREAS.includes(text)) { await sendMessage(chatId, '⚠️ Elegí un área de la lista.'); return; }
      session.area = text; session.step = 3;
      const rk = []; for (let i=0;i<RESPONSABLES.length;i+=2) rk.push(RESPONSABLES.slice(i,i+2));
      await sendMessage(chatId, `✅ Área: <b>${text}</b>\n\n¿Quién es la responsable?`, rk);
      break;
    case 3:
      if (!RESPONSABLES.includes(text)) { await sendMessage(chatId, '⚠️ Elegí una responsable de la lista.'); return; }
      session.responsable = text; session.step = 4;
      const tk = []; for (let i=0;i<TIPOS.length;i+=2) tk.push(TIPOS.slice(i,i+2));
      await sendMessage(chatId, `✅ Responsable: <b>${text}</b>\n\n¿Qué tipo de acción es?`, tk);
      break;
    case 4:
      if (!TIPOS.includes(text)) { await sendMessage(chatId, '⚠️ Elegí un tipo de la lista.'); return; }
      session.tipo = text; session.step = 5;
      await sendMessage(chatId, `✅ Tipo: <b>${text}</b>\n\n¿Cuál es el deadline?\nFormato: DD/MM/AAAA (ej: 25/10/2026)`);
      break;
    case 5:
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) { await sendMessage(chatId, '⚠️ Formato incorrecto. Usá DD/MM/AAAA'); return; }
      session.deadline = text; session.step = 6;
      await sendMessage(chatId, `📋 <b>Resumen:</b>\n\n📌 ${session.titulo}\n🏢 ${session.area}\n👤 ${session.responsable}\n⚡ ${session.tipo}\n📅 ${session.deadline}\n\n¿Confirmás?`, [['✅ Confirmar', '❌ Cancelar']]);
      break;
    case 6:
      if (text === '✅ Confirmar') {
        await guardarTarea(session);
        await sendMessage(chatId, '🎉 <b>¡Tarea cargada!</b> Ya aparece en el tablero.\n\nMandá /nueva para cargar otra.');
      } else {
        await sendMessage(chatId, '❌ Cancelado. Mandá /nueva para empezar.');
      }
      sessions[chatId] = { step: 0 };
      break;
  }
}

async function poll(offset = 0) {
  try {
    const data = await httpRequest({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=30`,
      method: 'GET'
    });
    let nextOffset = offset;
    for (const update of data.result || []) {
      nextOffset = update.update_id + 1;
      if (update.message && update.message.text) {
        await processMessage(update.message.chat.id, update.message.text);
      }
    }
    poll(nextOffset);
  } catch(e) {
    console.error('Error:', e.message);
    setTimeout(() => poll(offset), 5000);
  }
}

console.log('🤖 Bot Coordinación GR iniciado');
poll();
