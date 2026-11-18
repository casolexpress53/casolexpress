// Casol Express · cria (ou redefine a senha de) o acesso de um motorista ou colaborador.
// SÓ o dono consegue chamar: a função confere o login de quem chama com public.eh_dono().
// A chave de administrador (SUPABASE_SERVICE_ROLE_KEY) existe apenas aqui dentro, no servidor do Supabase.
// O usuário já nasce com e-mail confirmado: não precisa de e-mail nem de autorização no painel do Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const TABELA: Record<string, string> = { motorista: 'motoristas', colaborador: 'colaboradores' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resp({ erro: 'metodo_invalido' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const quem = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: dono, error: e0 } = await quem.rpc('eh_dono');
    if (e0 || dono !== true) return resp({ erro: 'sem_permissao' }, 403);

    const { acao, tipo, id, email, senha } = await req.json();
    const tabela = TABELA[String(tipo)];
    if (!tabela || !UUID.test(String(id))) return resp({ erro: 'dados_invalidos' }, 400);
    if (typeof senha !== 'string' || senha.length < 10 || senha.length > 72) return resp({ erro: 'senha_curta' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: alvo } = await admin.from(tabela).select('id, user_id').eq('id', id).maybeSingle();
    if (!alvo) return resp({ erro: 'cadastro_nao_encontrado' }, 404);

    if (acao === 'redefinir_senha') {
      if (!alvo.user_id) return resp({ erro: 'sem_acesso' }, 400);
      const { error } = await admin.auth.admin.updateUserById(alvo.user_id, { password: senha });
      if (error) return resp({ erro: 'falha_senha', detalhe: error.message }, 400);
      return resp({ ok: true });
    }
    if (acao !== 'criar') return resp({ erro: 'acao_invalida' }, 400);

    const mail = String(email ?? '').trim().toLowerCase();
    if (!EMAIL.test(mail)) return resp({ erro: 'email_invalido' }, 400);
    const { data: novo, error } = await admin.auth.admin.createUser({ email: mail, password: senha, email_confirm: true });
    if (error || !novo?.user) {
      const jaExiste = /already|registered|exists/i.test(error?.message ?? '');
      return resp({ erro: jaExiste ? 'email_ja_existe' : 'falha_criar', detalhe: error?.message }, jaExiste ? 409 : 400);
    }
    const uid = novo.user.id;
    // o gatilho do banco cria o perfil como 'motorista'; aqui acerta o papel e liga o login ao cadastro
    await admin.from('perfis').upsert({ id: uid, papel: tipo, nome: mail.split('@')[0] });
    const { error: eLink } = await admin.from(tabela).update({ user_id: uid }).eq('id', id);
    if (eLink) {
      await admin.auth.admin.deleteUser(uid);   // não deixa conta solta
      return resp({ erro: 'falha_vinculo', detalhe: eLink.message }, 400);
    }
    return resp({ ok: true, user_id: uid });
  } catch (e) {
    return resp({ erro: 'erro_interno', detalhe: String((e as Error)?.message ?? e) }, 500);
  }
});
