import { useMemo, useState } from 'react';
import { temServidor } from '../auth.js';
import { dataBR } from '../lib.js';
import { fmtTamanho, linkNota, marcarVista, useNotas } from '../notas.js';
import { Chips, Icon, Vazio } from '../ui.jsx';
import { H2 } from '../components/Recolher.jsx';
import FiltroPeriodo, { useFiltroPeriodo } from '../components/FiltroPeriodo.jsx';

const quando = (iso) => { const d = new Date(iso); return `${dataBR(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d))} ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)}`; };

/* Dono e equipe: notas fiscais enviadas pelos motoristas. Abrir, baixar e marcar como vista. */
export default function Notas() {
  const per = useFiltroPeriodo('mes');
  const { notas, carregando, erro, recarregar } = useNotas({ ini: per.ini, fim: per.fim });
  const [st, setSt] = useState('novas');
  const [mot, setMot] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const motoristas = useMemo(() => [...new Map(notas.map((n) => [n.motoristaId || n.motorista, n.motorista])).entries()], [notas]);
  const lista = useMemo(() => notas.filter((n) => (st === 'todas' || !n.vistoEm) && (!mot || (n.motoristaId || n.motorista) === mot)), [notas, st, mot]);
  const novas = notas.filter((n) => !n.vistoEm).length;

  async function abrir(n, baixar) {
    setMsg(''); setBusy(n.id + (baixar ? 'b' : 'a'));
    const w = baixar ? null : window.open('', '_blank');           // abre a aba já no clique (o navegador não bloqueia)
    try {
      const url = await linkNota(n, baixar);
      if (baixar) { const a = document.createElement('a'); a.href = url; a.download = n.nome; document.body.appendChild(a); a.click(); a.remove(); }
      else if (w) w.location.href = url;
      if (!n.vistoEm) { await marcarVista([n.id]); recarregar(); }
    } catch (e) { w?.close(); setMsg(e.message); }
    setBusy('');
  }
  async function alternar(n) { setMsg(''); try { await marcarVista([n.id], !n.vistoEm); recarregar(); } catch (e) { setMsg(e.message); } }
  async function todasVistas() { setMsg(''); try { await marcarVista(lista.filter((n) => !n.vistoEm).map((n) => n.id)); recarregar(); } catch (e) { setMsg(e.message); } }

  if (!temServidor) return <div className="card"><Vazio titulo="Notas fiscais" texto="As notas enviadas pelos motoristas ficam guardadas no sistema online. Na demonstração não há envio de arquivos." /></div>;

  return (
    <div className="stack">
      <div className="card">
        <div className="stack">
          <FiltroPeriodo f={per} />
          <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Chips valor={st} onChange={setSt} opcoes={[['novas', 'Novas', novas], ['todas', 'Todas', notas.length]]} />
            <label className="f" style={{ minWidth: 220 }}>Motorista<select className="sel" value={mot} onChange={(e) => setMot(e.target.value)}><option value="">Todos os motoristas</option>{motoristas.map(([k, nome]) => <option key={k} value={k}>{nome}</option>)}</select></label>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="row between"><H2>Notas ({lista.length})</H2>{lista.some((n) => !n.vistoEm) && <button className="btn sm" onClick={todasVistas}><Icon n="check" size={16} /> Marcar todas como vistas</button>}</div>
        <p className="sub">Toque em Abrir para ver a nota ou em Baixar para guardar o arquivo. Os links são temporários e só funcionam para quem está logado.</p>
        {erro && <p className="l-err small" role="alert">{erro}</p>}
        {msg && <p className="l-err small" role="alert">{msg}</p>}
        {carregando ? <div className="empty">Carregando…</div> : !lista.length ? <Vazio titulo={st === 'novas' ? 'Nenhuma nota nova' : 'Nenhuma nota neste período'} texto={st === 'novas' ? 'Quando um motorista enviar uma nota, ela aparece aqui e no aviso do painel.' : 'Troque o período ou o motorista acima.'} /> : (
          <div className="list">
            {lista.map((n) => (
              <div className="item" key={n.id} style={{ alignItems: 'start', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <b>{n.motorista}</b> {!n.vistoEm && <span className="tag warn">Nova</span>}
                  <div className="small">{n.numero ? `NF ${n.numero} · ` : ''}{n.nome}</div>
                  <div className="small muted">{quando(n.em)} · {fmtTamanho(n.tamanho)}{n.obs ? ` · ${n.obs}` : ''}</div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn sm ac" disabled={!!busy} onClick={() => abrir(n, false)}>Abrir</button>
                  <button className="btn sm" disabled={!!busy} onClick={() => abrir(n, true)}>Baixar</button>
                  <button className="btn sm" onClick={() => alternar(n)}>{n.vistoEm ? 'Marcar como nova' : 'Marcar como vista'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
