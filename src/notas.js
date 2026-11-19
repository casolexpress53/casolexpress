import { useCallback, useEffect, useState } from 'react';
import { sb, temServidor } from './auth.js';
import { uid } from './lib.js';

/* Notas fiscais enviadas pelos motoristas. Arquivos num bucket PRIVADO do Supabase (nunca ficam públicos):
   quem abre usa um link temporário. O motorista só vê e envia as próprias; dono e quem tem a aba "Notas fiscais" veem todas. */
export const MAX_BYTES = 10 * 1024 * 1024;
export const TIPOS_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'];
const limpar = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'nota';
export const fmtTamanho = (b = 0) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const daLinha = (r) => ({ id: r.id, motoristaId: r.motorista_id, motorista: r.motorista_nome || '—', numero: r.numero || '', obs: r.observacao || '', arquivo: r.arquivo, nome: r.nome_arquivo, mime: r.mime, tamanho: r.tamanho || 0, em: r.criado_em, vistoEm: r.visto_em });

export async function listarNotas({ ini, fim } = {}) {
  const c = await sb();
  let q = c.from('notas_fiscais').select('*').order('criado_em', { ascending: false }).limit(500);
  if (ini) q = q.gte('criado_em', `${ini}T00:00:00-03:00`);
  if (fim) q = q.lt('criado_em', `${new Date(new Date(`${fim}T12:00:00-03:00`).getTime() + 864e5).toISOString().slice(0, 10)}T00:00:00-03:00`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map(daLinha);
}

/* motorista: valida e envia o arquivo; se a gravação do registro falhar, não deixa o arquivo solto */
export async function enviarNota({ motoristaId, motoristaNome, arquivo, numero, obs }) {
  if (!arquivo) throw new Error('Escolha o arquivo da nota.');
  if (arquivo.size > MAX_BYTES) throw new Error('O arquivo passa de 10 MB. Envie uma foto menor ou o PDF.');
  const tipo = arquivo.type || (arquivo.name.toLowerCase().endsWith('.xml') ? 'application/xml' : '');
  if (!TIPOS_OK.includes(tipo)) throw new Error('Formato não aceito. Envie PDF, foto (JPG, PNG) ou XML.');
  const c = await sb();
  const caminho = `${motoristaId}/${uid()}-${limpar(arquivo.name)}`;
  const up = await c.storage.from('notas-fiscais').upload(caminho, arquivo, { contentType: tipo, upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { error } = await c.from('notas_fiscais').insert({ motorista_id: motoristaId, motorista_nome: motoristaNome, numero: numero?.trim() || null, observacao: obs?.trim() || null, arquivo: caminho, nome_arquivo: arquivo.name.slice(0, 120), mime: tipo, tamanho: arquivo.size });
  if (error) { await c.storage.from('notas-fiscais').remove([caminho]); throw new Error(error.message); }
}

export async function apagarNota(n) {
  const c = await sb();
  const { error } = await c.from('notas_fiscais').delete().eq('id', n.id);
  if (error) throw new Error(error.message);
  await c.storage.from('notas-fiscais').remove([n.arquivo]);
}

/* link temporário (2 min). `baixar`: força o download com o nome original */
export async function linkNota(n, baixar = false) {
  const c = await sb();
  const { data, error } = await c.storage.from('notas-fiscais').createSignedUrl(n.arquivo, 120, baixar ? { download: n.nome } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function marcarVista(ids, vista = true) {
  const c = await sb();
  const { data: u } = await c.auth.getUser();
  const { error } = await c.from('notas_fiscais').update({ visto_em: vista ? new Date().toISOString() : null, visto_por: vista ? u?.user?.id ?? null : null }).in('id', ids);
  if (error) throw new Error(error.message);
}

/* lista com atualização a cada 30 s (só no modo servidor) */
export function useNotas(filtro = {}) {
  const [d, setD] = useState({ notas: [], carregando: true, erro: '' });
  const recarregar = useCallback(async () => {
    if (!temServidor) return setD({ notas: [], carregando: false, erro: '' });
    try { setD({ notas: await listarNotas(filtro), carregando: false, erro: '' }); }
    catch (e) { setD((x) => ({ ...x, carregando: false, erro: e.message })); }
  }, [filtro.ini, filtro.fim]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { recarregar(); if (!temServidor) return undefined; const t = setInterval(() => !document.hidden && recarregar(), 30000); return () => clearInterval(t); }, [recarregar]);
  return { ...d, recarregar };
}

/* aviso do painel: quantas notas ainda não foram abertas por ninguém do escritório */
export function useNotasNovas() {
  const [novas, setNovas] = useState({ n: 0, ultimas: [] });
  useEffect(() => {
    if (!temServidor) return undefined;
    let vivo = true;
    const buscar = async () => {
      try {
        const c = await sb();
        const { data, count } = await c.from('notas_fiscais').select('*', { count: 'exact' }).is('visto_em', null).order('criado_em', { ascending: false }).limit(5);
        if (vivo) setNovas({ n: count || 0, ultimas: (data || []).map(daLinha) });
      } catch { /* sem acesso a notas (permissão) ou sem rede: não mostra o aviso */ }
    };
    buscar(); const t = setInterval(() => !document.hidden && buscar(), 30000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  return novas;
}
