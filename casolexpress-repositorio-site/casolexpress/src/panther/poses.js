/*
  Poses procedurais da pantera. O GLB original só traz uma espreita lenta (sem ciclo de corrida
  nem pose sentada), então as poses são montadas por rotações sobre o esqueleto em pé.
  Cada item: [osso, eixoX, eixoY, eixoZ, ângulo]. Os eixos são do bicho: X lateral (ângulo positivo
  leva o membro para trás), Y vertical, Z para a frente. A lista segue a ordem da hierarquia.
*/
const X = [1, 0, 0];
const Y = [0, 1, 0];
const sin = Math.sin;
const pos = (v) => Math.max(0, v);

export const ELO = (osso, eixo, ang) => [osso, eixo[0], eixo[1], eixo[2], ang];

/* Pose sentada + vida: respiração, cauda, cabeça seguindo o cursor (olhar), balanço de cabeça (erro). */
export function sentada(t = 0, olhar = [0, 0], balanco = 0) {
  const resp = sin(t * 1.7);
  const cauda = (i) => 0.1 + 0.05 * sin(t * 1.1 - i * 0.7);
  const lado = (i, k) => 0.22 * k * sin(t * 0.9 - i * 0.8); // balanço lateral da cauda
  const yaw = 0.55 * olhar[0] + balanco;
  const pitch = 0.16 * olhar[1];
  const L = [
    ELO('Bip001_Pelvis', X, -0.8), ELO('Bip001_Spine', X, 0.15), ELO('Bip001_Spine1', X, 0.1),
    ELO('Bip001_Spine2', X, 0.1 + 0.014 * resp), ELO('Bip001_Spine3', X, 0.05 + 0.018 * resp),
    ELO('Bip001_L_Clavicle', X, 0.45), ELO('Bip001_R_Clavicle', X, 0.45),
    ELO('Bip001_Neck', X, 0.2 - 0.012 * resp), ELO('Bip001_Neck1', X, 0.1), ELO('Bip001_Neck2', X, 0.1),
    ELO('Bip001_Head', X, 0.1),
    // olhar: giro em Y (relativo ao corpo) e inclinação em X
    ELO('Bip001_Neck1', Y, yaw * 0.35), ELO('Bip001_Neck2', Y, yaw * 0.3), ELO('Bip001_Head', Y, yaw * 0.35),
    ELO('Bip001_Neck2', X, pitch * 0.4), ELO('Bip001_Head', X, pitch * 0.6),
  ];
  for (const s of ['L', 'R']) {
    L.push(ELO(`Bip001_${s}_Thigh`, X, 0.2), ELO(`Bip001_${s}_Calf`, X, 2.1), ELO(`Bip001_${s}_HorseLink`, X, -0.9), ELO(`Bip001_${s}_Foot`, X, -0.2));
  }
  const base = [0.9, 0.3, 0.15, 0.1, 0.1, 0.1];
  base.forEach((a, i) => { L.push(ELO(`Bone00${i + 1}`, X, a + (i ? cauda(i) - 0.1 : 0)), ELO(`Bone00${i + 1}`, Y, lado(i, i ? 1 : 0.3))); });
  return L;
}

/* Corrida em galope (fase em radianos): patas dianteiras e traseiras defasadas, coluna que flexiona. */
export function corrida(ph) {
  const L = [];
  const fl = 0.14 * sin(ph + 0.6);
  L.push(ELO('Bip001_Spine', X, fl), ELO('Bip001_Spine1', X, fl), ELO('Bip001_Spine2', X, fl), ELO('Bip001_Neck', X, -fl * 1.4), ELO('Bip001_Head', X, -0.1 - fl * 0.6));
  for (const s of ['L', 'R']) {
    const o = s === 'L' ? 0 : 0.35;
    const a = ph + o, h = ph + 2.2 + o;
    L.push(
      ELO(`Bip001_${s}_Clavicle`, X, 0.25 * sin(a)), ELO(`Bip001_${s}_UpperArm`, X, 0.55 * sin(a)),
      ELO(`Bip001_${s}_Forearm`, X, 0.25 + 0.9 * pos(sin(a + 1.6))), ELO(`Bip001_${s}_Hand`, X, 0.2 * sin(a + 1)),
      ELO(`Bip001_${s}_Thigh`, X, 0.75 * sin(h) - 0.15), ELO(`Bip001_${s}_Calf`, X, 0.3 + 0.9 * pos(sin(h + 1.4))),
      ELO(`Bip001_${s}_HorseLink`, X, -0.3 - 0.6 * pos(sin(h + 1.4))), ELO(`Bip001_${s}_Foot`, X, 0.2 * sin(h + 2)),
    );
  }
  L.push(ELO('Bone001', X, 0.1 + 0.15 * sin(ph + 1)), ELO('Bone003', X, 0.1 * sin(ph + 2)));
  return L;
}
