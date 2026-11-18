/*
  DADOS FICTÍCIOS de demonstração. Nomes, endereços e valores são inventados só para
  mostrar o sistema funcionando. Nada aqui vem de cliente ou operação real.
*/
import { addDias, hoje, uid } from './lib.js';
import { vazio } from './store.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CIDADES_DEMO = ['Cidade Alfa', 'Cidade Beta', 'Vila Gama', 'Porto Delta'];
const BAIRROS = ['Centro', 'Jardim das Flores', 'Vila Nova', 'Distrito Industrial', 'Alto da Serra'];
const RUAS = ['Rua das Acácias', 'Avenida Principal', 'Rua do Comércio', 'Travessa Sete', 'Rua Quinze de Março', 'Alameda dos Ipês'];

export function linhasExemplo(qtd = 36, semente = 11) {
  const r = rng(semente);
  const out = [];
  for (let i = 0; i < qtd; i++) {
    const rua = RUAS[Math.floor(r() * RUAS.length)];
    const n = 10 + Math.floor(r() * 90);
    const cidade = CIDADES_DEMO[Math.floor(r() * CIDADES_DEMO.length)];
    out.push({
      Codigo: `DEMO${semente}${String(1000 + i)}`,
      Endereco: i % 5 === 0 ? rua.replace('Rua', 'R.') + `, nº ${n}` : `${rua}, ${n}`,
      Bairro: BAIRROS[Math.floor(r() * BAIRROS.length)],
      Cidade: cidade,
      Cliente: `Cliente fictício ${100 + Math.floor(r() * 80)}`,
    });
    if (i % 7 === 0) out.push({ ...out[i], Codigo: `DEMO${semente}${String(1000 + i)}` }); /* repetido de propósito */
  }
  return out;
}

export function gerarDemo() {
  const r = rng(7);
  const h = hoje();
  const s = vazio();
  s.demo = true;
  s.empresas = [
    { id: 'e1', nome: 'Plataforma A', tarifa: 600, prazoDias: 1 },
    { id: 'e2', nome: 'Plataforma B', tarifa: 640, prazoDias: 2 },
  ];
  s.motoristas = Array.from({ length: 6 }, (_, i) => ({ id: `m${i + 1}`, nome: `Motorista ${String(i + 1).padStart(2, '0')}`, tipo: 'pacote', valor: [250, 250, 260, 270, 250, 260][i], ativo: true }));
  s.motoristas.push({ id: 'm7', nome: 'Motorista 07 (fixo)', tipo: 'fixo', valor: 120000, ativo: true });
  s.ajustes = { saldoInicial: 300000, valorPadrao: 250, meta: 900, categorias: [] };

  for (let d = -13; d <= 0; d++) {
    const data = addDias(h, d);
    const empresas = d % 3 === 0 ? ['e1', 'e2'] : ['e1'];
    for (const eid of empresas) {
      const rid = uid();
      s.romaneios.push({ id: rid, empresaId: eid, data, arquivo: `exemplo-${data}.xlsx`, finalizado: d < 0 });
      const qtd = 18 + Math.floor(r() * 22);
      for (let i = 0; i < qtd; i++) {
        const ci = Math.floor(r() * CIDADES_DEMO.length);
        const pacotes = Array.from({ length: 1 + Math.floor(r() * 2.6) }, (_, k) => `D${data.replace(/-/g, '')}${eid}${i}${k}`);
        const x = r();
        let status = 'entregue';
        if (d === 0) status = x < 0.55 ? 'entregue' : 'pendente';
        else if (x > 0.97) status = 'reagendar'; else if (x > 0.95) status = 'recusado'; else if (x > 0.92) status = 'ausente'; else if (x > 0.9) status = 'endereco_errado';
        const mot = d === 0 && i % 9 === 0 ? null : `m${((ci + Math.floor(r() * 2)) % 7) + 1}`;
        s.paradas.push({
          id: uid(), romaneioId: rid, motoristaId: mot, status,
          endereco: `${RUAS[Math.floor(r() * RUAS.length)]}, ${10 + Math.floor(r() * 90)}`,
          bairro: BAIRROS[Math.floor(r() * BAIRROS.length)], cidade: CIDADES_DEMO[ci],
          cliente: `Cliente fictício ${100 + Math.floor(r() * 400)}`, pacotes,
          baixaEm: status === 'pendente' ? null : `${data}T1${Math.floor(r() * 9)}:${String(10 + Math.floor(r() * 49))}:00`, gps: null,
        });
      }
    }
  }
  const L = (data, tipo, categoria, descricao, valor, pago, venc) => s.lancamentos.push({ id: uid(), data, tipo, categoria, descricao, valor, pago, venc: venc || data });
  for (let d = -12; d <= 0; d += 3) L(addDias(h, d), 'saida', 'Combustível', 'Combustível da frota', 25000 + Math.floor(r() * 15000), true);
  L(addDias(h, -9), 'entrada', 'Repasse de parceira', 'Repasse Plataforma A', 450000, true);
  L(addDias(h, -2), 'entrada', 'Repasse de parceira', 'Repasse Plataforma B', 280000, true);
  L(addDias(h, 5), 'saida', 'Parcela de veículo', 'Parcela do veículo 1 de 12', 90000, false, addDias(h, 5));
  L(addDias(h, 6), 'entrada', 'Repasse de parceira', 'Repasse Plataforma A (previsto)', 380000, false, addDias(h, 6));
  s.veiculos = [{ id: uid(), placa: 'ABC1D23', motoristaId: 'm1', rastreadorId: '', instalado: false }];
  return s;
}
