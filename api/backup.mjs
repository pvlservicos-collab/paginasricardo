// Backup diário e mensal do banco (ver lib/backup.mjs).
//   GET com Authorization: Bearer CRON_SECRET (Vercel Cron, todo dia às 00:00 de Brasília) → faz o backup e a faxina
//   GET logado como admin → lista os backups guardados (sem o endereço dos arquivos)
import crypto from 'node:crypto';
import { protegido, json, erro } from '../lib/servidor.mjs';
import { registrar } from '../lib/auth.mjs';
import { fazerBackup, faxina, listarBackups } from '../lib/backup.mjs';

function ehCron(request) {
  const s = process.env.CRON_SECRET;
  const a = request.headers.get('authorization') || '';
  if (!s || a.length !== `Bearer ${s}`.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(`Bearer ${s}`));
}

const doPainel = protegido(async () => json({
  backups: (await listarBackups()).map(({ tipo, data, bytes, em }) => ({ tipo, data, bytes, em })),
}), { admin: true });

export async function GET(request) {
  if (!ehCron(request)) return doPainel(request);
  try {
    const r = await fazerBackup();
    const limpeza = await faxina();
    await registrar('backup_feito', { usuario: 'cron', detalhe: { dia: r.dia, bytes: r.bytes, mensal: r.mensal, apagados: r.apagados, segundos: r.segundos, limpeza } });
    return json({ ...r, limpeza });
  } catch (e) {
    await registrar('backup_falhou', { usuario: 'cron', detalhe: { msg: e.message.slice(0, 300) } });
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/backup', msg: e.message }));
    return erro('Backup falhou: ' + e.message, e.status || 500);
  }
}
