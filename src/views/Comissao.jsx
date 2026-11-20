import { useMemo, useState } from 'react';
import { acertoQuinzena, addDias, brl, centavos, dataBR, hoje, metricas, num, quinzena, quinzenaAnterior, quinzenaSeguinte } from '../lib.js';
import { gerarPdf } from '../pdf.js';
import { act, useStore } from '../store.js';
import { Chips, Icon, Money, Vazio } from '../ui.jsx';
import { H2 } from '../components/Recolher.jsx';

function Desconto({ onAdd }) {
  const [d, setD] = useState('');
  const [v, setV] = useState(0);
  return (
    <div className="form" style={{ marginTop: 10 }}>
      <label className="f">Desconto (motivo)<input className="inp" value={d} onChange={(e) => setD(e.target.value)} placeholder="Ex.: adiantamento, multa" /></label>
      <label className="f">Valor<Money live valor={v} onChange={setV} /></label>
      <button className="btn sm" disabled={!d.trim() || v <= 0} onClick={() => { onAdd(d.trim(), v); setD(''); setV(0); }}><Icon n="plus" size={16} /> Adicionar</button>
    </div>
  );
}

export default function Comissao() {
  const S = useStore();
  const [qNav, setQ] = useState(() => quinzena(hoje()));
  const [livre, setLivre] = useState(false);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [aberto, setAberto] = useState('');
  const h = hoje();
  const q = useMemo(() => (livre ? { ini: de || qNav.ini, fim: ate || h, livre: true } : qNav), [livre, de, ate, qNav, h]);   // período livre: só consulta (não aprova)

  const acertos = useMemo(() => S.motoristas.map((m) => acertoQuinzena(S, m, q)).filter((a) => a.bruto > 0 || a.reg), [S, q]);
  const totalLiq = acertos.reduce((t, a) => t + a.liquido, 0);
  const aPagar = acertos.filter((a) => !a.aprovado);
  const falta = aPagar.reduce((t, a) => t + a.liquido, 0);
  const dados = useMemo(() => metricas(S, { ini: q.ini, fim: q.fim }), [S, q]);

  const linhasPdf = (lista) => lista.map((a) => [a.motorista.nome, num(a.pacotes), brl(a.bruto), brl(a.totalDesc), brl(a.liquido), a.aprovado ? 'Pago' : 'A pagar']);
  const colunas = ['Motorista', 'Pacotes', 'Bruto', 'Descontos', 'Líquido', 'Situação'];
  const resumoDe = (lista) => [['Total líquido', brl(lista.reduce((t, a) => t + a.liquido, 0))], ['Já pago', brl(lista.filter((a) => a.aprovado).reduce((t, a) => t + a.liquido, 0))], ['Falta pagar', brl(lista.filter((a) => !a.aprovado).reduce((t, a) => t + a.liquido, 0))], ['Descontos do período', brl(lista.reduce((t, a) => t + a.totalDesc, 0))]];
  const pdfQuinzena = () => gerarPdf({ titulo: 'Fechamento da quinzena', subtitulo: `${dataBR(q.ini)} a ${dataBR(q.fim)}`, colunas, linhas: linhasPdf(acertos), resumo: resumoDe(acertos), arquivo: `fechamento-quinzena-${q.ini}.pdf` });
  const pdfMes = () => {
    const q1 = quinzena(q.ini.slice(0, 8) + '01'), q2 = quinzenaSeguinte(q1);
    const juntos = S.motoristas.map((m) => {
      const a = acertoQuinzena(S, m, q1), b = acertoQuinzena(S, m, q2);
      return { motorista: m, pacotes: a.pacotes + b.pacotes, bruto: a.bruto + b.bruto, totalDesc: a.totalDesc + b.totalDesc, liquido: a.liquido + b.liquido, aprovado: (a.liquido === 0 || a.aprovado) && (b.liquido === 0 || b.aprovado) };
    }).filter((a) => a.bruto > 0);
    return gerarPdf({ titulo: 'Fechamento do mês', subtitulo: `${dataBR(q1.ini)} a ${dataBR(q2.fim)}`, colunas, linhas: linhasPdf(juntos), resumo: resumoDe(juntos), arquivo: `fechamento-mes-${q1.ini.slice(0, 7)}.pdf` });
  };

  if (!S.paradas.length && !S.motoristas.some((m) => m.tipo === 'fixo')) return <div className="card"><Vazio titulo="Sem comissões ainda" texto="As comissões aparecem quando houver entregas baixadas pelos motoristas." /></div>;

  return (
    <div className="stack">
      <div className="grid g2">
        <div className="card">
          <div className="row between"><div className="k-l">{livre ? 'Período livre (consulta)' : 'Quinzena'}</div>
            <Chips opcoes={[['q', 'Quinzena'], ['l', 'Escolher datas']]} valor={livre ? 'l' : 'q'} onChange={(v) => setLivre(v === 'l')} /></div>
          {livre ? (
            <div className="row" style={{ margin: '8px 0', gap: 10, flexWrap: 'wrap' }}>
              <label className="f">De<input className="inp" type="date" value={de || q.ini} max={ate || undefined} onChange={(e) => setDe(e.target.value)} /></label>
              <label className="f">Até<input className="inp" type="date" value={ate || q.fim} min={de || undefined} onChange={(e) => setAte(e.target.value)} /></label>
            </div>
          ) : (<div className="row" style={{ margin: '8px 0' }}>
            <button className="btn icon" onClick={() => setQ(quinzenaAnterior(qNav))} aria-label="Quinzena anterior"><Icon n="left" /></button>
            <b style={{ font: 'italic 800 24px var(--f1)' }}>{dataBR(q.ini)} a {dataBR(q.fim)}</b>
            <button className="btn icon" onClick={() => setQ(quinzenaSeguinte(qNav))} aria-label="Próxima quinzena" disabled={qNav.fim >= addDias(h, 15)}><Icon n="right" /></button>
          </div>)}
          {livre && <p className="small muted">Só consulta: para aprovar e lançar no caixa, volte para a quinzena.</p>}
          <div className="k-v">{brl(totalLiq)}</div><div className="k-s">total líquido de todos os motoristas</div>
        </div>
        <div className="card ac">
          <div className="k-l">Falta aprovar</div><div className="k-v">{brl(falta)}</div>
          <p className="k-s">{aPagar.length} motorista(s) com acerto aberto. Aprovar lança a saída no caixa.</p>
        </div>
      </div>

      <div className="card">
        <H2>O que fica para a empresa nesta quinzena</H2>
        {dados.receita > 0 ? (
          <div className="list"><div className="item"><span>As parceiras pagam</span><b>{brl(dados.receita)}</b></div><div className="item"><span>Vai para os motoristas</span><b>− {brl(totalLiq + acertos.reduce((t, a) => t + a.totalDesc, 0))}</b></div><div className="item"><span>Fica para a empresa</span><b>{brl(dados.receita - totalLiq - acertos.reduce((t, a) => t + a.totalDesc, 0))}</b></div></div>
        ) : <p className="muted small">Informe quanto cada parceira paga por pacote em Ajustes, em Empresas. Assim o sistema mostra quanto entrou, quanto vai para os motoristas e quanto sobra.</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn ac" onClick={pdfQuinzena}><Icon n="print" size={18} /> Baixar fechamento da quinzena (PDF)</button>
          <button className="btn" onClick={pdfMes}><Icon n="print" size={18} /> Baixar fechamento do mês (PDF)</button>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>O fechamento traz o total de todos os motoristas, o que já foi pago, o que falta pagar e os descontos do período.</p>
      </div>

      <div className="card">
        <H2>Acertos por motorista ({acertos.length})</H2>
        <p className="sub">{brl(falta)} a pagar · {livre ? 'toque para ver o detalhe (período livre: sem aprovação)' : 'toque para ver e aprovar'}</p>
        {acertos.some((a) => a.pacotesDepois > 0) && <p className="small l-err" role="alert">{acertos.filter((a) => a.pacotesDepois > 0).length} acerto(s) com pacotes entregues depois da aprovação. Abra o motorista marcado para lançar o complemento.</p>}
        {!acertos.length ? <p className="muted">Nenhum acerto nesta quinzena.</p> : (
          <div className="list">
            {acertos.map((a) => {
              const m = a.motorista, ab = aberto === m.id;
              return (
                <div key={m.id}>
                  <button className="item" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setAberto(ab ? '' : m.id)} aria-expanded={ab}>
                    <span><b>{m.nome}</b>{m.desligadoEm && <span className="tag" style={{ marginLeft: 8 }}>Desligado em {dataBR(m.desligadoEm)} · acerto final</span>}<br /><span className="muted small">{m.tipo === 'fixo' ? 'Salário fixo (metade)' : `${num(a.pacotes)} pacote(s)`}</span></span>
                    <span className="row"><b>{brl(a.liquido)}</b>{a.pacotesDepois > 0 && <span className="tag bad">+{num(a.pacotesDepois)} após aprovar</span>}<span className={`tag ${a.aprovado ? 'ok' : 'warn'}`}>{a.aprovado ? 'Aprovado' : 'Aberto'}</span><Icon n="down" size={18} /></span>
                  </button>
                  {ab && (
                    <div style={{ padding: '0 4px 16px' }}>
                      <div className="list small">
                        <div className="item"><span>Bruto</span><b>{brl(a.bruto)}</b></div>
                        {(a.atrasoLinhas || []).map((l) => <div className="item" key={l.assinatura}><span>Entrega fora do horário · {l.rotulo}: {num(l.pacotes)} pacote(s), {brl(l.reducao)} a menos em cada</span><b>− {brl(l.total)}</b></div>)}
                        {a.descontos.map((d) => (<div className="item" key={d.id}><span>Desconto · {d.desc}</span><span className="row"><b>− {brl(d.valor)}</b>{!a.aprovado && <button className="btn sm danger" onClick={() => act.descontoDel(a.reg.id, d.id)} aria-label="Remover desconto"><Icon n="x" size={14} /></button>}</span></div>))}
                        <div className="item"><span>Líquido</span><b>{brl(a.liquido)}</b></div>
                      </div>
                      {a.pacotesDepois > 0 && (
                        <div className="card" style={{ padding: 12, borderColor: 'var(--bad)', marginBottom: 10 }} role="alert">
                          <p className="small"><b>{num(a.pacotesDepois)} pacote(s) foram entregues depois da aprovação</b> e não estão no valor pago. Diferença a pagar: <b>{brl(a.complemento)}</b>.</p>
                          {!livre && a.complemento > 0 && <button className="btn sm ac" onClick={() => window.confirm(`Lançar no caixa o complemento de ${brl(a.complemento)} para ${m.nome}?`) && act.complementar(a.reg.id, m.nome, q, a.complemento, a.vivo, h)}><Icon n="check" size={16} /> Lançar complemento de {brl(a.complemento)}</button>}
                        </div>
                      )}
                      {livre ? null : a.aprovado
                        ? <div className="row" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => act.desaprovar(a.reg.id)}>Desfazer aprovação</button></div>
                        : (<>
                          <Desconto onAdd={(d, v) => act.descontoAdd(m.id, q, d, v)} />
                          <div className="row" style={{ marginTop: 12 }}><button className="btn ac" disabled={a.liquido <= 0} onClick={() => act.aprovar(m.id, q, a.liquido, m.nome, h, { pacotes: a.pacotes, bruto: a.bruto, descAtraso: a.descAtraso, totalDesc: a.totalDesc, liquido: a.liquido })}><Icon n="check" size={18} /> Aprovar e lançar no caixa</button></div>
                        </>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
