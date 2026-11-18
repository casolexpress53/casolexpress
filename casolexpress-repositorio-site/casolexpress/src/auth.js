/*
  Autenticação. Sem as variáveis VITE_SUPABASE_* o sistema roda em modo demonstração
  (sem senha, dados só neste navegador). Com elas, usa o Supabase Auth de verdade.
*/
const URL_SB = import.meta.env.VITE_SUPABASE_URL;
const CHAVE_SB = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const temServidor = Boolean(URL_SB && CHAVE_SB);
/* O modo demonstração NÃO tem senha. Em produção sem Supabase configurado, o sistema se recusa a abrir
   (em vez de entregar uma tela de entrada livre). Para publicar uma demonstração de propósito: VITE_PERMITIR_DEMO=sim. */
export const demoBloqueado = import.meta.env.PROD && !temServidor && import.meta.env.VITE_PERMITIR_DEMO !== 'sim';

let cliente;
export async function sb() {
  if (!temServidor) throw new Error('Supabase não configurado');
  if (!cliente) {
    const { createClient } = await import('@supabase/supabase-js');
    cliente = createClient(URL_SB, CHAVE_SB);
  }
  return cliente;
}

export async function entrar(email, senha) {
  const c = await sb();
  const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  const { data: perfil, error: e2 } = await c.from('perfis').select('papel').eq('id', data.user.id).maybeSingle();
  if (e2 || !perfil) { await c.auth.signOut(); throw new Error('Este usuário ainda não tem acesso liberado. Fale com o administrador.'); }
  return { papel: perfil.papel, email: data.user.email };
}

export async function sessaoAtual() {
  if (!temServidor) return null;
  const c = await sb();
  const { data } = await c.auth.getSession();
  if (!data.session) return null;
  const { data: perfil } = await c.from('perfis').select('papel').eq('id', data.session.user.id).maybeSingle();
  return perfil ? { papel: perfil.papel, email: data.session.user.email } : null;
}

export async function sair() {
  if (temServidor) { const c = await sb(); await c.auth.signOut(); }
}
