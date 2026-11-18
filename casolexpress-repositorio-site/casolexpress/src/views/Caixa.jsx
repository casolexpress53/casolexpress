import { useMemo, useState } from 'react';
import { addDias, brl, CAT_COMISSAO, CATEGORIAS_BASE, comissoesAbertas, custoMotoristas, dataBR, fluxoPeriodo, hoje, metricas, pct, periodo, rotuloMes, saldoHoje, saldoPrevisto, shiftMes } from '../lib.js';
import { act, useStore } from '../store.js';
import { Chips, Icon, Money, Vazio } from '../ui.jsx';

function Novo({ cats }) {
  const h = hoje();
  const [modo, setModo] = useState('lanc');
  const [f, setF] = useState({ tipo: 'saida', descricao: '', categoria: cats[1], valor: 0, data: h, pago: true, parcelas: 3 });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const ev = (k) => (e) => set(k)(e.target.value);

  function salvar() {
    const d = f.descricao.trim();
    if (!d || f.valor <= 0) return;
    if (modo === 'lanc') act.add('lancamentos', { tipo: f.tipo, descricao: d, categoria: f.categoria, valor: f.valor, data: f.data, pago: f.pago, venc: f.data });
    else if (modo === 'boleto') act.add('lancamentos', { tipo: 'saida', descricao: d, categoria: f.categoria, valor: f.valor, data: f.data, pago: false, venc: f.data });
    else {
      const n = Math.max(2, Math.min(Number(f.parcelas) || 2, 60)), base = Math.floor(f.valor / n), resto = f.valor - base * n;
      for (let i = 0; i < n; i++) { const venc = shiftMes(f.data, i); act.add('lancamentos', { tipo: 'saida', descricao: `${d} (${i + 1}/${n})`, categoria: f.categoria, valor: base + (i === 0 ? resto : 0), data: venc, pago: false, venc }); }
    }
    setF((x) => ({ ...x, descricao: '', valor: 0 }));
  }
  return (
    <div className="stack">
      <Chips valor={modo} onChange={setModo} opcoes={[['lanc', 'Entrada ou saída'], ['boleto', 'Boleto'], ['parc', 'Compra parcelada']]} />
      <p className="small muted">{modo === 'lanc' ? 'Para o que já aconteceu ou vai acontecer em uma data.' : modo === 'boleto' ? 'Saída com vencimento, fica prevista até você marcar como paga.' : 'Divide o valor total em parcelas mensais, todas previstas.'}</p>
      <div className="form">
        {modo === 'lanc' && <label className="f">Tipo<select className="sel" value={f.tipo} onChange={ev('tipo')}><option value="saida">Saída</option><option value="entrada">Entrada</option></select></label>}
        <label className="f">Descrição<input className="inp" value={f.descricao} onChange={ev('descricao')} /></label>
        <label className="f">Categoria<select className="sel" value={f.categoria} onChange={ev('categoria')}>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">{modo === 'parc' ? 'Valor total' : 'Valor'}<Money live valor={f.valor} onChange={set('valor')} /></label>
        <label className="f">{modo === 'lanc' ? 'Data' : modo === 'boleto' ? 'Vencimento' : '1º vencimento'}<input className="inp" type="date" value={f.data} onChange={ev('data')} /></label>
        {modo === 'parc' && <label className="f">Parcelas<input className="inp" type="number" min="2" max="60" value={f.parcelas} onChange={ev('parcelas')} /></label>}
        {modo === 'lanc' && <label className="f">Situação<select className="sel" value={f.pago ? '1' : '0'} onChange={(e) => set('pago')(e.target.value === '1')}><option value="1">Já aconteceu</option><option value="0">Previsto</option></select></label>}
        <button className="btn ac" disabled={!f.descricao.trim() || f.valor <= 0} onClick={salvar}><Icon n="plus" size={18} /> Lançar</button>
      </div>
    </div>
  );
}

export default function Caixa({ ir }) {
  const S = useStore();
  const h = hoje();
  const cats = useMemo(() => [...new Set([...CATEGORIAS_BASE, ...S.ajustes.categorias])], [S.ajustes.categorias]);
  const [lim, setLim] = useState(40);

  const saldo = saldoHoje(S);
  const abertas = useMemo(() => comissoesAbertas(S), [S]);
  const totalAb = abertas.reduce((t, a) => t + a.liquido, 0);
  const P = periodo('mes');
  const M = useMemo(() => metricas(S, P), [S]);
  const custo = custoMotoristas(S, P.ini, P.fim, M.porMotorista);
  const fluxo = fluxoPeriodo(S, P.ini, P.fim);
  const fica = M.receita - custo.total - fluxo.despesas;
  const lanc = useMemo(() => [...S.lancamentos].sort((a, b) => b.data.localeCompare(a.data)), [S.lancamentos]);

  return (
    <div className="stack">
      <div className="grid g21">
        <div className="card ac">
          <div className="k-l">Saldo em conta hoje</div>
          <div className="k-v big">{brl(saldo)}</div>
          <label className="f" style={{ maxWidth: 320, color: 'inherit', opacity: 0.9 }}>Saldo inicial (quanto tinha antes de começar a lançar)
            <Money valor={S.ajustes.saldoInicial} onChange={(v) => act.ajustes({ saldoInicial: v })} />
          </label>
        </div>
        <div className="card">
          <div className="k-l">Previsão do saldo</div>
          {[30, 60, 90].map((d) => (
            <div className="item" key={d}><span className="muted small">Em {d} dias · {dataBR(addDias(h, d))}</span><b style={{ font: 'italic 800 22px var(--f1)' }}>{brl(saldoPrevisto(S, addDias(h, d)))}</b></div>
          ))}
          <p className="small muted">Considera boletos, parcelas, o que está “previsto” e as comissões geradas pelas entregas que ainda não foram aprovadas ({brl(totalAb)}).</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Quanto a empresa ganha em {rotuloMes(h)}</h2>
          {M.receita > 0 ? (
            <div className="list"><div className="item"><span>As parceiras pagam</span><b>{brl(M.receita)}</b></div><div className="item"><span>Motoristas (comissões e fixos)</span><b>− {brl(custo.total)}</b></div><div className="item"><span>Despesas pagas</span><b>− {brl(fluxo.despesas)}</b></div><div className="item"><span>Fica para a empresa</span><b className={fica < 0 ? 'down' : 'up'}>{brl(fica)} · {pct(fica / M.receita)}</b></div></div>
          ) : <p className="muted small">Informe quanto cada parceira paga por pacote em Ajustes para ver esta conta.</p>}
          <p className="small muted" style={{ marginTop: 10 }}>Esta conta usa as entregas do mês e o valor combinado com cada parceira. Ela é separada do saldo em conta, que só mostra o dinheiro que realmente entrou e saiu.</p>
        </div>
        <div className="card">
          <h2>Comissões a pagar</h2>
          <p className="sub">O que as entregas já geraram para os motoristas e ainda não saiu do caixa.</p>
          <div className="k-v">{brl(totalAb)}</div><div className="k-s">{abertas.length} acerto(s) em aberto</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => ir('comissao')}>Aprovar e pagar em Comissão</button>
        </div>
      </div>

      <div className="card"><h2>Novo lançamento</h2><Novo cats={cats} /></div>

      <div className="card">
        <h2>Lançamentos</h2>
        {!lanc.length ? <Vazio titulo="Caixa vazio" texto="Lance a primeira entrada ou saída acima." /> : (
          <div className="list">
            {lanc.slice(0, lim).map((l) => (
              <div className="item" key={l.id}>
                <span><b>{l.descricao}</b><br /><span className="muted small">{dataBR(l.data)} · {l.categoria}{!l.pago ? ` · vence ${dataBR(l.venc)}` : ''}</span></span>
                <span className="row">
                  <b className={l.tipo === 'entrada' ? 'up' : ''}>{l.tipo === 'entrada' ? '+' : '−'} {brl(l.valor)}</b>
                  {l.categoria !== CAT_COMISSAO && <button className={`chip ${l.pago ? 'on' : ''}`} onClick={() => act.upd('lancamentos', l.id, { pago: !l.pago })}>{l.pago ? (l.tipo === 'entrada' ? 'Recebido' : 'Pago') : 'Previsto'}</button>}
                  <button className="btn sm danger" onClick={() => window.confirm('Excluir este lançamento?') && act.del('lancamentos', l.id)} aria-label="Excluir lançamento"><Icon n="x" size={14} /></button>
                </span>
              </div>
            ))}
          </div>
        )}
        {lanc.length > lim && <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}><button className="btn" onClick={() => setLim(lim + 60)}>Mostrar mais</button></div>}
      </div>
    </div>
  );
}
