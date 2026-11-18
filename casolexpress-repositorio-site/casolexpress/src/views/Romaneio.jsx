import { useMemo, useRef, useState } from 'react';
import { dataBR, hoje, norm, num } from '../lib.js';
import { linhasExemplo } from '../seed.js';
import { act, useStore } from '../store.js';
import { Icon, Vazio } from '../ui.jsx';

/* Descobre quais colunas da planilha são código, endereço, etc. (sem depender do nome exato). */
const COL = [
  ['entregador', /(entregador|motorista|courier|driver)/], ['codigo', /(codigo|cod\b|rastreio|tracking|awb|barcode|waybill|pedido|pacote)/],
  ['cidade', /(cidade|city|municipio)/], ['bairro', /(bairro|district)/], ['endereco', /(endereco|address|logradouro|rua)/], ['cliente', /(cliente|destinat|receiver|nome)/],
];
function mapear(linhas) {
  const cab = Object.keys(linhas[0] || {}), usadas = new Set(), m = {};
  for (const [k, rx] of COL) { const c = cab.find((x) => !usadas.has(x) && rx.test(norm(x))); if (c) { m[k] = c; usadas.add(c); } }
  return m;
}

function analisar(linhas, S, empresaId, data) {
  const m = mapear(linhas);
  if (!m.codigo || !m.endereco) return { erro: 'Não achei as colunas de código e de endereço. A planilha precisa ter, no mínimo, uma coluna com o código do pacote e outra com o endereço.' };
  const jaTem = new Set(S.paradas.filter((p) => { const r = S.romaneios.find((x) => x.id === p.romaneioId); return r && r.empresaId === empresaId && r.data === data; }).flatMap((p) => p.pacotes));
  const vistos = new Set(), grupos = new Map(), semCad = new Set();
  let repetidos = 0;
  for (const l of linhas) {
    const cod = String(l[m.codigo] ?? '').trim(), end = String(l[m.endereco] ?? '').trim();
    if (!cod || !end) continue;
    if (vistos.has(cod) || jaTem.has(cod)) { repetidos++; continue; }
    vistos.add(cod);
    const cidade = String(m.cidade ? l[m.cidade] : '').trim(), key = `${norm(end)}|${norm(cidade)}`;
    let g = grupos.get(key);
    if (!g) {
      g = { endereco: end, bairro: m.bairro ? String(l[m.bairro]).trim() : '', cidade, cliente: m.cliente ? String(l[m.cliente]).trim() : '', pacotes: [], motoristaId: null, gps: null };
      if (m.entregador) {
        const nome = norm(l[m.entregador]);
        if (nome) { const mo = S.motoristas.find((x) => norm(x.nome) === nome); if (mo) g.motoristaId = mo.id; else semCad.add(String(l[m.entregador]).trim()); }
      }
      grupos.set(key, g);
    }
    g.pacotes.push(cod);
  }
  const paradas = [...grupos.values()];
  return { paradas, pacotes: vistos.size, repetidos, atribuidas: paradas.filter((p) => p.motoristaId).length, semCad: [...semCad] };
}

async function lerArquivo(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}

export default function Romaneio() {
  const S = useStore();
  const [empresaId, setEmpresaId] = useState('');
  const [data, setData] = useState(hoje());
  const [prev, setPrev] = useState(null);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [novaEmp, setNovaEmp] = useState('');
  const inp = useRef(null);
  const emp = empresaId || S.empresas[0]?.id || '';

  async function receber(file) {
    setErro(''); setPrev(null);
    if (!file) return;
    try {
      const linhas = await lerArquivo(file);
      if (!linhas.length) return setErro('A planilha está vazia.');
      const r = analisar(linhas, S, emp, data);
      r.erro ? setErro(r.erro) : setPrev({ ...r, arquivo: file.name });
    } catch { setErro('Não consegui ler esse arquivo. Use .xlsx, .xls ou .csv.'); }
  }
  const exemplo = () => { setErro(''); const r = analisar(linhasExemplo(36, Math.floor(Math.random() * 900) + 100), S, emp, data); setPrev({ ...r, arquivo: 'exemplo-fictício.xlsx' }); };
  const confirmar = () => { act.importar({ empresaId: emp, data, arquivo: prev.arquivo, paradas: prev.paradas }); setPrev(null); };

  const semMot = useMemo(() => {
    const m = {};
    for (const p of S.paradas) if (!p.motoristaId && p.status === 'pendente') m[p.cidade || 'Sem cidade'] = (m[p.cidade || 'Sem cidade'] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [S.paradas]);
  const romaneios = useMemo(() => [...S.romaneios].sort((a, b) => b.data.localeCompare(a.data)), [S.romaneios]);

  return (
    <div className="stack">
      <div className="card">
        <h2>1. Traga a lista da plataforma</h2>
        <p className="sub">Baixe a lista da empresa parceira em Excel ou CSV e solte aqui. O sistema junta tudo que vai para o mesmo cliente. Se o arquivo trouxer o entregador cadastrado, cada parada já vai para o motorista certo.</p>
        {!S.empresas.length ? (
          <div className="form">
            <label className="f">Cadastre a primeira empresa parceira<input className="inp" placeholder="Ex.: nome da plataforma" value={novaEmp} onChange={(e) => setNovaEmp(e.target.value)} /></label>
            <button className="btn ac" disabled={!novaEmp.trim()} onClick={() => { act.add('empresas', { nome: novaEmp.trim(), tarifa: 0, prazoDias: 1 }); setNovaEmp(''); }}><Icon n="plus" size={18} /> Cadastrar empresa</button>
          </div>
        ) : (
          <div className="stack">
            <div className="form">
              <label className="f">Empresa<select className="sel" value={emp} onChange={(e) => setEmpresaId(e.target.value)}>{S.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
              <label className="f">Data da rota<input className="inp" type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
            </div>
            <div className={`drop${arrastando ? ' on' : ''}`} role="button" tabIndex={0}
              onClick={() => inp.current.click()} onKeyDown={(e) => e.key === 'Enter' && inp.current.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files[0]); }}>
              <Icon n="upload" size={30} /><p><b>Solte o arquivo aqui ou toque para escolher</b></p><p className="small muted">.xlsx, .xls ou .csv</p>
              <input ref={inp} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { receber(e.target.files[0]); e.target.value = ''; }} />
            </div>
            <div className="row"><button className="btn" onClick={exemplo}>Usar arquivo de exemplo (dados fictícios)</button></div>
          </div>
        )}
        {erro && <p className="down" role="alert" style={{ marginTop: 12 }}>{erro}</p>}
      </div>

      {prev && (
        <div className="card ac">
          <h2>Conferir antes de importar</h2>
          <p className="sub">{prev.arquivo}</p>
          <div className="grid g4">
            <div><div className="k-v">{num(prev.pacotes)}</div><div className="k-s">pacotes únicos</div></div>
            <div><div className="k-v">{num(prev.paradas.length)}</div><div className="k-s">paradas (agrupadas por endereço)</div></div>
            <div><div className="k-v">{num(prev.repetidos)}</div><div className="k-s">repetidos removidos</div></div>
            <div><div className="k-v">{num(prev.atribuidas)}</div><div className="k-s">já com motorista</div></div>
          </div>
          {prev.semCad.length > 0 && <p className="small" style={{ marginTop: 12 }}>Entregador(es) não cadastrado(s) em Ajustes, essas paradas ficam sem motorista: {prev.semCad.slice(0, 6).join(', ')}{prev.semCad.length > 6 ? '…' : ''}</p>}
          <div className="row" style={{ marginTop: 16 }}><button className="btn dark" onClick={confirmar}><Icon n="check" size={18} /> Importar romaneio</button><button className="btn" onClick={() => setPrev(null)}>Cancelar</button></div>
        </div>
      )}

      <div className="grid g2">
        <div className="card">
          <h2>Como o agrupamento funciona</h2>
          <div className="list small">
            <div className="item"><span><b>Remove pacotes repetidos.</b> O mesmo código lido duas vezes conta uma vez só.</span></div>
            <div className="item"><span><b>Junta pelo mesmo endereço.</b> “Rua” e “R.”, maiúsculas, acentos e “nº” não atrapalham.</span></div>
            <div className="item"><span><b>Uma parada, vários pacotes.</b> O motorista dá baixa de uma vez em todos os pacotes do cliente.</span></div>
          </div>
        </div>
        <div className="card">
          <h2>Distribuir rotas</h2>
          <p className="sub">Paradas pendentes sem motorista, por cidade.</p>
          {!semMot.length ? <p className="muted">Nenhuma parada sem motorista.</p> : semMot.map(([c, n]) => (
            <div className="item" key={c}>
              <span><b>{c}</b> <span className="muted">· {n} parada(s)</span></span>
              <select className="sel" style={{ width: 190 }} defaultValue="" onChange={(e) => e.target.value && act.distribuir(c, e.target.value)} aria-label={`Motorista para ${c}`}>
                <option value="">Escolher motorista…</option>{S.motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Romaneios importados</h2>
        {!romaneios.length ? <Vazio titulo="Nenhum romaneio" texto="Importe a primeira lista para começar." /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Data</th><th>Empresa</th><th className="r">Paradas</th><th className="r">Pacotes</th><th>Situação</th><th /></tr></thead><tbody>
            {romaneios.slice(0, 60).map((r) => {
              const ps = S.paradas.filter((p) => p.romaneioId === r.id);
              return (<tr key={r.id}><td>{dataBR(r.data)}</td><td>{S.empresas.find((e) => e.id === r.empresaId)?.nome || '—'}</td><td className="r">{ps.length}</td><td className="r">{ps.reduce((t, p) => t + p.pacotes.length, 0)}</td>
                <td><button className="chip" onClick={() => act.upd('romaneios', r.id, { finalizado: !r.finalizado })}>{r.finalizado ? 'Finalizado' : 'Em andamento'}</button></td>
                <td className="r"><button className="btn sm danger" onClick={() => window.confirm('Excluir este romaneio e todas as paradas dele?') && act.excluirRomaneio(r.id)}>Excluir</button></td></tr>);
            })}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}
