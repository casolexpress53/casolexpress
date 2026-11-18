import { useMemo, useState } from 'react';
import { addDias, brl, comissoesAbertas, custoMotoristas, dataBR, fluxoPeriodo, hoje, metricas, num, PERIODOS, pct, periodo, rotuloMes, saldoHoje, saldoPrevisto } from '../lib.js';
import { gerarPdf } from '../pdf.js';
import { useStore } from '../store.js';
import { Chips, Delta, Icon, Vazio } from '../ui.jsx';

export default function Painel({ ir }) {
  const S = useStore();
  const [per, setPer] = useState(() => localStorage.getItem('casol_per') || 'mes');
  const [emp, setEmp] = useState('');
  const [mot, setMot] = useState('');
  const mudar = (v) => { setPer(v); try { localStorage.setItem('casol_per', v); } catch { /* ok */ } };

  const h = hoje();
  const P = useMemo(() => periodo(per), [per]);
  const f = { empresaId: emp, motoristaId: mot };
  const M = useMemo(() => metricas(S, { ...P, ...f }), [S, P, emp, mot]);
  const A = useMemo(() => metricas(S, { ...P.ant, ...f }), [S, P, emp, mot]);
  const dias14 = useMemo(() => metricas(S, { ini: addDias(h, -13), fim: h, ...f }).porDia, [S, emp, mot]);
  const abertas = useMemo(() => comissoesAbertas(S), [S]);
  const semMotorista = useMemo(() => S.paradas.filter((p) => !p.motoristaId && p.status === 'pendente').length, [S.paradas]);

  if (!S.romaneios.length) {
    return <div className="card"><Vazio titulo="Nada por aqui ainda" texto="Importe o primeiro romaneio para o painel ganhar vida, ou carregue os dados fictícios em Ajustes.">
      <div className="row" style={{ justifyContent: 'center' }}><button className="btn ac" onClick={() => ir('romaneio')}><Icon n="upload" size={18} /> Importar romaneio</button></div>
    </Vazio></div>;
  }

  const custo = custoMotoristas(S, P.ini, P.fim, M.porMotorista, mot);
  const fluxo = fluxoPeriodo(S, P.ini, P.fim);
  const sobra = M.receita - custo.total;
  const total = M.entregues + M.ocorrencias;
  const noPrazo = M.entregues ? M.noPrazo / M.entregues : 0;
  const ocorr = total ? M.ocorrencias / total : 0;
  const custoPct = M.entregues ? (custo.total + fluxo.despesas) / M.entregues : 0;
  const diasOp = Math.max(Object.keys(M.porDia).length, 1);
  const hoje0 = saldoHoje(S);
  const prev30 = saldoPrevisto(S, addDias(h, 30));
  const saidas30 = fluxoPeriodo(S, addDias(h, -30), h).saidas;
  const folego = saidas30 > 0 ? Math.floor(hoje0 / (saidas30 / 30)) : null;
  const meta = S.ajustes.meta;
  const mes = metricas(S, { ...periodo('mes'), ...f });
  const dias = Array.from({ length: 14 }, (_, i) => addDias(h, i - 13));
  const topo = Math.max(...dias.map((d) => dias14[d] || 0), 1);

  const ranking = Object.entries(M.porMotorista).filter(([id]) => id !== '_').map(([id, v]) => {
    const m = S.motoristas.find((x) => x.id === id);
    return { id, nome: m?.nome || 'Removido', ...v, taxa: v.entregues + v.ocorrencias ? v.entregues / (v.entregues + v.ocorrencias) : 0, custo: custo.por[id] || 0 };
  }).sort((a, b) => b.entregues - a.entregues);
  const cidades = Object.entries(M.porCidade).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxC = cidades[0]?.[1] || 1;

  const pdf = () => gerarPdf({
    titulo: 'Relatório do painel', subtitulo: `${dataBR(P.ini)} a ${dataBR(P.fim)}`, arquivo: `painel-${P.ini}-${P.fim}.pdf`,
    resumo: [['Pacotes entregues', num(M.entregues)], ['Entregas no prazo', pct(noPrazo)], ['Ocorrências', pct(ocorr)], ['Receita das parceiras', M.semTarifa ? 'tarifa não informada' : brl(M.receita)], ['Custo com motoristas', brl(custo.total)]],
    colunas: ['Motorista', 'Pacotes', 'Taxa de entrega', 'Ocorrências', 'Custo'],
    linhas: ranking.map((r) => [r.nome, num(r.entregues), pct(r.taxa), num(r.ocorrencias), brl(r.custo)]),
  });

  return (
    <div className="stack">
      <div className="card" style={{ '--i': 0 }}>
        <div className="stack">
          <Chips opcoes={PERIODOS} valor={per} onChange={mudar} />
          <div className="form">
            <label className="f">Parceira<select className="sel" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Todas as parceiras</option>{S.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
            <label className="f">Motorista<select className="sel" value={mot} onChange={(e) => setMot(e.target.value)}><option value="">Todos os motoristas</option>{S.motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
            <button className="btn ac" onClick={pdf}><Icon n="print" size={18} /> Relatório do painel (PDF)</button>
          </div>
          <p className="small muted">{rotuloMes(P.fim)} · {dataBR(P.ini)} a {dataBR(P.fim)}, comparado com {dataBR(P.ant.ini)} a {dataBR(P.ant.fim)}.</p>
        </div>
      </div>

      <div className="grid g21">
        <div className="card" style={{ '--i': 1 }}>
          <div className="k-l">Saldo previsto em 30 dias</div>
          <div className="k-v big">{brl(prev30)}</div>
          <div className="row small"><span className="pill">Hoje em conta {brl(hoje0)}</span><span className={`pill ${fluxo.resultado < 0 ? 'down' : ''}`}>Resultado do período {brl(fluxo.resultado)}</span></div>
          <p className="k-l" style={{ margin: '18px 0 8px' }}>Pacotes entregues por dia (14 dias)</p>
          <div className="bars" role="img" aria-label="Pacotes entregues por dia nos últimos 14 dias">
            {dias.map((d, i) => (<div key={d} className={`bar${i === 13 ? ' hi' : ''}`} title={`${dataBR(d)}: ${dias14[d] || 0}`}><i style={{ height: `${((dias14[d] || 0) / topo) * 100}%` }} /><span>{d.slice(8)}</span></div>))}
          </div>
        </div>
        <div className="stack">
          <div className="card ac" style={{ '--i': 2 }}>
            <div className="k-l">Precisa de você</div>
            {abertas.length || semMotorista ? (<>
              <div className="k-v" style={{ fontSize: 28 }}>{abertas.length ? `${abertas.length} acerto(s) para aprovar` : `${num(semMotorista)} paradas sem motorista`}</div>
              <p className="k-s">{abertas.length ? `Total a pagar ${brl(abertas.reduce((t, a) => t + a.liquido, 0))}.` : 'Distribua por cidade para o motorista ver no celular.'}</p>
              <button className="btn dark" style={{ marginTop: 14 }} onClick={() => ir(abertas.length ? 'comissao' : 'romaneio')}><Icon n="arrow" size={18} /> {abertas.length ? 'Ver comissões' : 'Distribuir rotas'}</button>
            </>) : <div className="k-v" style={{ fontSize: 26 }}>Tudo em dia</div>}
          </div>
          <div className="card" style={{ '--i': 3 }}>
            <div className="k-l">Pacotes entregues</div>
            <div className="k-v">{num(M.entregues)}</div>
            <div className="k-s"><Delta atual={M.entregues} anterior={A.entregues} /> · {num(Math.round(M.entregues / diasOp))} por dia de operação</div>
          </div>
        </div>
      </div>

      <div className="grid g4">
        <div className="card" style={{ '--i': 4 }}><div className="k-l">Entregas no prazo</div><div className="k-v">{M.entregues ? pct(noPrazo) : '—'}</div><div className="k-s">{num(M.foraPrazo)} pacote(s) fora do prazo</div></div>
        <div className="card" style={{ '--i': 5 }}><div className="k-l">Ocorrências</div><div className="k-v">{total ? pct(ocorr) : '—'}</div><div className="k-s">Ausente, recusado, avaria, endereço errado e reagendar.</div></div>
        <div className="card" style={{ '--i': 6 }}><div className="k-l">Custo por pacote</div><div className="k-v">{M.entregues ? brl(Math.round(custoPct)) : '—'}</div><div className="k-s">Comissões e despesas pagas ÷ pacotes entregues.</div></div>
        <div className="card" style={{ '--i': 7 }}><div className="k-l">Fôlego de caixa</div><div className="k-v">{folego === null ? '—' : `${folego} dias`}</div><div className="k-s">{saidas30 ? `No ritmo de saída dos últimos 30 dias (${brl(Math.round(saidas30 / 30))} por dia).` : 'Sem saídas nos últimos 30 dias.'}</div></div>
      </div>

      <div className="grid g2">
        <div className="card" style={{ '--i': 8 }}>
          <h2>Quanto fica para a empresa</h2>
          <p className="sub">{dataBR(P.ini)} a {dataBR(P.fim)}</p>
          {M.semTarifa && <p className="warn small" style={{ marginBottom: 10 }}>Falta informar quanto cada parceira paga por pacote. <button className="btn sm" onClick={() => ir('ajustes')}>Abrir Ajustes</button></p>}
          <div className="list">
            <div className="item"><span>As parceiras pagam</span><b>{brl(M.receita)}</b></div>
            <div className="item"><span>Vai para os motoristas</span><b>− {brl(custo.total)}</b></div>
            <div className="item"><span>Fica para a empresa</span><b className={sobra < 0 ? 'down' : 'up'}>{brl(sobra)}{M.receita ? ` · ${pct(sobra / M.receita)}` : ''}</b></div>
          </div>
        </div>
        <div className="card" style={{ '--i': 9 }}>
          <h2>Meta do mês</h2>
          {meta > 0 ? (<>
            <p className="sub">{num(mes.entregues)} de {num(meta)} pacotes · dia {Number(h.slice(8))}</p>
            <div className="prog"><i style={{ width: `${Math.min((mes.entregues / meta) * 100, 100)}%` }} /></div>
            <p className="small muted">{pct(Math.min(mes.entregues / meta, 9.99))} da meta. Defina outra em Ajustes.</p>
          </>) : (<><p className="sub">Defina uma meta de pacotes para acompanhar o ritmo do mês.</p><button className="btn" onClick={() => ir('ajustes')}>Definir a meta</button></>)}
        </div>
      </div>

      <div className="grid g21">
        <div className="card" style={{ '--i': 10 }}>
          <h2>Ranking de motoristas</h2>
          <p className="sub">Taxa de entrega = entregues ÷ (entregues + ocorrências) no período.</p>
          {ranking.length ? (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>Motorista</th><th className="r">Pacotes</th><th className="r">Taxa</th><th className="r">Ocorr.</th><th className="r">Custo</th></tr></thead>
              <tbody>{ranking.map((r, i) => (<tr key={r.id}><td>{i + 1}</td><td>{r.nome}</td><td className="r">{num(r.entregues)}</td><td className="r">{pct(r.taxa)}</td><td className="r">{num(r.ocorrencias)}</td><td className="r">{brl(r.custo)}</td></tr>))}</tbody></table></div>
          ) : <p className="muted">Sem entregas atribuídas a motoristas neste período.</p>}
        </div>
        <div className="card" style={{ '--i': 11 }}>
          <h2>Onde está falhando</h2>
          <p className="sub">{num(M.ocorrencias)} pacote(s) com ocorrência no período.</p>
          {cidades.length ? cidades.map(([c, n]) => (<div className="hbar" key={c}><span>{c}</span><div><i style={{ width: `${(n / maxC) * 100}%` }} /></div><b>{n}</b></div>)) : <p className="muted">Nenhuma ocorrência no período.</p>}
        </div>
      </div>
    </div>
  );
}
