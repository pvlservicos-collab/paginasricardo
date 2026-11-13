// Tela "Uso da VPS" do painel (só admin). A VPS grava uma linha a cada 5 min em vps_uso (/usr/local/bin/painel-uso).
//   GET ?horas=24|72|168 → { atual, serie (por hora), resumo, desde }
import { protegido, json } from '../lib/servidor.mjs';
import { sql, usandoBanco, bancoAtual } from '../lib/store.mjs';

export const GET = protegido(async (request, url) => {
  if (!usandoBanco || bancoAtual === 'neon') return json({ semVps: true });
  const horas = [24, 72, 168].includes(Number(url.searchParams.get('horas'))) ? Number(url.searchParams.get('horas')) : 24;
  const [{ existe }] = await sql`select to_regclass('public.vps_uso') is not null as existe`;
  if (!existe) return json({ semDados: true });
  const [atual] = await sql`select * from vps_uso order by em desc limit 1`;
  const serie = await sql.query(`
    select date_trunc('hour', em) as hora,
      round(avg(cpu_pct)::numeric, 1)::float as cpu, round(max(cpu_pct)::numeric, 1)::float as cpu_max,
      round(avg(mem_usada_mb * 100.0 / nullif(mem_total_mb, 0))::numeric, 1)::float as mem,
      round(max(disco_usado_gb * 100.0 / nullif(disco_total_gb, 0))::numeric, 1)::float as disco,
      max(conexoes)::int as conexoes, sum(transacoes)::int as transacoes,
      round(sum(rede_in_mb + rede_out_mb)::numeric, 2)::float as rede_mb, round(max(load1)::numeric, 2)::float as load1,
      count(*)::int as amostras
    from vps_uso where em > now() - make_interval(hours => $1) group by 1 order by 1`, [horas]);
  const [resumo] = await sql.query(`
    select round(avg(cpu_pct)::numeric, 1)::float as cpu_media, round(max(cpu_pct)::numeric, 1)::float as cpu_pico,
      round(avg(mem_usada_mb)::numeric)::int as mem_media_mb, max(mem_usada_mb)::int as mem_pico_mb,
      max(conexoes)::int as conexoes_pico, sum(transacoes)::bigint as transacoes,
      round(sum(rede_in_mb + rede_out_mb)::numeric, 1)::float as rede_mb
    from vps_uso where em > now() - make_interval(hours => $1)`, [horas]);
  const [{ desde }] = await sql`select min(em) as desde from vps_uso`;
  return json({ horas, atual: atual || null, serie, resumo, desde });
}, { admin: true });
