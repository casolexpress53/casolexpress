import { useMemo, useState } from 'react';
import { dataBR, diaLocal, horaLocal, STATUS } from '../lib.js';
import { act, useStore } from '../store.js';
import { Chips, Modal, Vazio } from '../ui.jsx';
import FiltroPeriodo, { useFiltroPeriodo } from '../components/FiltroPeriodo.jsx';
import { H2 } from '../components/Recolher.jsx';

const tom = (s) => (s === 'entregue' ? 'ok' : s === 'pendente' ? '' : 'bad');

export default function Entregas() {
  const S = useStore();
  const [st, setSt] = useState('todas');
  const [rom, setRom] = useState('');
  const [mot, setMot] = useState('');
  const [lim, setLim] = useState(60);
  const [sel, setSel] = useState(null);
  const per = useFiltroPeriodo('tudo');

  const dataRom = useMemo(() => new Map(S.romaneios.map((r) => [r.id, r.data])), [S.romaneios]);
  const base = useMemo(() => S.paradas.filter((p) => (!rom || p.romaneioId === rom) && (!mot || (mot === '_' ? !p.motoristaId : p.motoristaId === mot)) && per.dentro(dataRom.get(p.romaneioId))), [S.paradas, rom, mot, per.ini, per.fim, dataRom]); // eslint-disable-line react-hooks/exhaustive-deps
  const cont = useMemo(() => { const c = { todas: base.length }; for (const k of Object.keys(STATUS)) c[k] = 0; for (const p of base) c[p.status]++; return c; }, [base]);
  const lista = useMemo(() => (st === 'todas' ? base : base.filter((p) => p.status === st)), [base, st]);
  const romsOrd = useMemo(() => [...S.romaneios].sort((a, b) => b.data.localeCompare(a.data)), [S.romaneios]);
  const nomeM = (id) => S.motoristas.find((m) => m.id === id)?.nome || 'Sem motorista';
  const parada = sel && S.paradas.find((p) => p.id === sel);
  const romDe = (p) => S.romaneios.find((r) => r.id === p.romaneioId);

  if (!S.paradas.length) return <div className="card"><Vazio titulo="Sem entregas" texto="As paradas aparecem aqui depois que você importar um romaneio." /></div>;

  return (
    <div className="stack">
      <div className="card">
        <div className="stack">
          <FiltroPeriodo f={per} onMudar={() => setLim(60)} />
          <Chips valor={st} onChange={(v) => { setSt(v); setLim(60); }} opcoes={[['todas', 'Todas', cont.todas], ...Object.entries(STATUS).map(([k, r]) => [k, r, cont[k]])]} />
          <div className="form">
            <label className="f">Romaneio<select className="sel" value={rom} onChange={(e) => setRom(e.target.value)}><option value="">Todos os romaneios</option>{romsOrd.map((r) => <option key={r.id} value={r.id}>{dataBR(r.data)} · {S.empresas.find((e) => e.id === r.empresaId)?.nome}{r.finalizado ? ' · finalizado' : ''}</option>)}</select></label>
            <label className="f">Motorista<select className="sel" value={mot} onChange={(e) => setMot(e.target.value)}><option value="">Todos os motoristas</option><option value="_">Sem motorista</option>{S.motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
          </div>
        </div>
      </div>

      <div className="card">
        <H2>Paradas ({lista.length})</H2>
        <p className="sub">{lista.reduce((t, p) => t + p.pacotes.length, 0)} pacotes · toque numa parada para ver os detalhes</p>
        {!lista.length ? <p className="muted">Nenhuma parada com esse filtro.</p> : (
          <div className="list">
            {lista.slice(0, lim).map((p) => (
              <button key={p.id} className="item" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setSel(p.id)}>
                <span><b>{p.endereco}</b><br /><span className="muted small">{[p.bairro, p.cidade].filter(Boolean).join(' · ')} · {p.cliente || 'Cliente'} · {p.pacotes.length} pacote(s)</span></span>
                <span className="row"><span className="muted small">{nomeM(p.motoristaId)}</span><span className={`tag ${tom(p.status)}`}>{STATUS[p.status]}</span></span>
              </button>
            ))}
          </div>
        )}
        {lista.length > lim && <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}><button className="btn" onClick={() => setLim(lim + 100)}>Mostrar mais</button></div>}
      </div>

      <Modal aberto={!!parada} fechar={() => setSel(null)} titulo="Detalhe da parada">
        {parada && (
          <div className="stack">
            <div><b>{parada.endereco}</b><p className="muted small">{[parada.bairro, parada.cidade].filter(Boolean).join(' · ')}</p><p className="muted small">{parada.cliente} · romaneio de {dataBR(romDe(parada)?.data)}</p></div>
            <div><p className="k-l">Pacotes ({parada.pacotes.length})</p><p className="small">{parada.pacotes.join(' · ')}</p></div>
            <label className="f">Motorista<select className="sel" value={parada.motoristaId || ''} onChange={(e) => act.upd('paradas', parada.id, { motoristaId: e.target.value || null })}><option value="">Sem motorista</option>{S.motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
            <div><p className="k-l">Situação</p><Chips valor={parada.status} onChange={(v) => (v === 'pendente' ? act.desfazer(parada.id) : act.baixar(parada.id, v, parada.gps))} opcoes={Object.entries(STATUS)} /></div>
            {parada.baixaEm && <p className="small muted">Baixa em {dataBR(diaLocal(parada.baixaEm))} {horaLocal(parada.baixaEm)}{parada.gps && <> · <a href={`https://www.google.com/maps?q=${parada.gps.lat},${parada.gps.lng}`} target="_blank" rel="noreferrer">ver posição</a></>}</p>}
            <div className="row"><button className="btn" onClick={() => setSel(null)}>Fechar</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
