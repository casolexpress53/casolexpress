import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Color, Quaternion, Vector3 } from 'three';
import { clone as clonarSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import gsap from 'gsap';
import { corrida, sentada } from '../panther/poses.js';

const MODELO = '/models/panther.glb';
const YAW_SENTADA = 1.0;   // 3/4 virada para o formulário (à direita)
const YAW_CORRIDA = -1.45; // perfil virado para a saída (à esquerda)
// Deslocamento do modelo para o pivô ficar no corpo e os pés no chão (medido nos renders).
const OFF_SENTADA = [0, -0.23, 0.3];
const OFF_CORRIDA = [0, 0, 0.3];
const AZUL_ZERO = new Vector3();

const usarMeshopt = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);

const cssCor = (nome, padrao) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || padrao;
};

/* Estado mutável compartilhado entre a animação (GSAP) e o laço de render. Nunca vira estado React. */
function novoCtl() {
  return { t: 0, fase: 0, vel: 0, blend: 0, yaw: YAW_SENTADA, balanco: 0, balancoFase: 0, ativo: false, alvo: [0, 0], olhar: [0, 0] };
}

function Pantera({ ctl, reduzido, onPronto }) {
  const { scene } = useLoader(GLTFLoader, MODELO, usarMeshopt);
  const grupo = useRef(null);
  const interno = useRef(null);
  const invalidate = useThree((s) => s.invalidate);

  // Cópia própria do esqueleto (o cache do useGLTF fica intacto se a tela remontar).
  const modelo = useRef(null);
  if (!modelo.current) {
    modelo.current = clonarSkinned(scene);
    modelo.current.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) o.frustumCulled = false; });
  }
  const ossos = useRef(null);
  if (!ossos.current) {
    const mapa = {};
    modelo.current.traverse((o) => { if (o.isBone) mapa[o.name] = { o, base: o.quaternion.clone(), a: new Quaternion(), b: new Quaternion() }; });
    ossos.current = mapa;
  }

  const tmp = useRef({ q: new Quaternion(), p: new Quaternion(), ax: new Vector3(), oq: new Quaternion() }).current;

  // Zera o esqueleto na pose base e aplica a lista de rotações no referencial do bicho.
  function aplicar(lista, dest) {
    const M = ossos.current;
    for (const k in M) M[k].o.quaternion.copy(M[k].base);
    grupo.current.updateWorldMatrix(true, true);
    grupo.current.getWorldQuaternion(tmp.oq);
    for (const [nome, ax, ay, az, ang] of lista) {
      const e = M[nome]; if (!e) continue;
      const b = e.o;
      b.getWorldQuaternion(tmp.q);
      tmp.ax.set(ax, ay, az).applyQuaternion(tmp.oq); // eixo do bicho → mundo
      tmp.q.premultiply(tmp.p.setFromAxisAngle(tmp.ax, ang));
      b.parent.getWorldQuaternion(tmp.p).invert();
      b.quaternion.copy(tmp.p.multiply(tmp.q));
      b.updateMatrixWorld(true);
    }
    for (const k in M) M[k][dest].copy(M[k].o.quaternion);
  }

  useFrame((_, dtReal) => {
    const dt = Math.min(dtReal, 0.05);
    if (!reduzido) {
      ctl.t += dt;
      // olhar suave (pouca amplitude)
      ctl.olhar[0] += (ctl.alvo[0] - ctl.olhar[0]) * Math.min(1, dt * 4);
      ctl.olhar[1] += (ctl.alvo[1] - ctl.olhar[1]) * Math.min(1, dt * 4);
      ctl.fase += dt * 19 * ctl.vel;
    }
    const balanco = 0.5 * Math.sin(ctl.balancoFase) * ctl.balanco;
    const M = ossos.current;
    grupo.current.rotation.y = ctl.yaw;
    if (ctl.blend < 1) aplicar(sentada(reduzido ? 0 : ctl.t, reduzido ? [0, 0] : ctl.olhar, balanco), 'a');
    if (ctl.blend > 0) aplicar(corrida(ctl.fase), 'b');
    for (const k in M) {
      const e = M[k];
      if (ctl.blend <= 0) e.o.quaternion.copy(e.a);
      else if (ctl.blend >= 1) e.o.quaternion.copy(e.b);
      else e.o.quaternion.copy(e.a).slerp(e.b, ctl.blend);
    }
    const w = ctl.blend;
    const g = grupo.current, i = interno.current;
    g.position.y = w * 0.05 * Math.abs(Math.sin(ctl.fase * 0.5)); // quique do galope
    i.position.set(
      OFF_SENTADA[0] + (OFF_CORRIDA[0] - OFF_SENTADA[0]) * w,
      OFF_SENTADA[1] + (OFF_CORRIDA[1] - OFF_SENTADA[1]) * w,
      OFF_SENTADA[2] + (OFF_CORRIDA[2] - OFF_SENTADA[2]) * w,
    );
  });

  // primeiro quadro desenhado → avisa que está pronto
  useEffect(() => {
    invalidate();
    const id = requestAnimationFrame(() => requestAnimationFrame(() => onPronto()));
    return () => cancelAnimationFrame(id);
  }, [invalidate, onPronto]);

  return (
    <group ref={grupo} rotation-y={YAW_SENTADA}>
      <group ref={interno}>
        <primitive object={modelo.current} />
      </group>
    </group>
  );
}

/* Luz principal suave + rim light na cor de destaque do tema (para a pantera preta não sumir no fundo). */
function Luzes({ tema }) {
  const rim1 = useRef(); const rim2 = useRef(); const aro = useRef();
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const cor = () => {
      const c = new Color(cssCor('--ac', tema === 'claro' ? '#d9a514' : '#e1202c'));
      rim1.current?.color.copy(c); rim2.current?.color.copy(c); aro.current?.color.copy(c);
      invalidate();
    };
    cor();
    const mo = new MutationObserver(cor);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, [tema, invalidate]);
  const claro = tema === 'claro';
  return (
    <>
      <hemisphereLight args={['#ffffff', '#222222', claro ? 1.1 : 0.45]} />
      <directionalLight position={[2.5, 3.2, 4]} intensity={claro ? 2.4 : 2.0} color="#fff4ea" />
      <directionalLight ref={rim1} position={[4, 2.2, -3.5]} intensity={claro ? 6 : 9} />
      <directionalLight ref={rim2} position={[-4, 1.6, -3]} intensity={claro ? 4 : 6} />
      <pointLight ref={aro} position={[0, 0.2, 2.2]} intensity={claro ? 1.2 : 2.5} distance={6} />
    </>
  );
}

/* Telas estreitas: câmera mais próxima para a pantera não ficar miúda acima do formulário. */
function Enquadre() {
  const camera = useThree((s) => s.camera);
  const largura = useThree((s) => s.size.width);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { camera.zoom = largura < 520 ? 1.3 : 1; camera.updateProjectionMatrix(); invalidate(); }, [camera, largura, invalidate]);
  return null;
}

/* Quadros só quando preciso: ~30 fps parado (respiração), 60 fps na corrida/reação; zero com a aba oculta ou fora da tela. */
function Ritmo({ ctl, reduzido, alvoEl }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (reduzido) return undefined;
    let raf = 0, ultimo = 0, visivel = true;
    const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }, { threshold: 0 });
    if (alvoEl.current) io.observe(alvoEl.current);
    const tick = (t) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || !visivel) return;
      if (ctl.ativo || t - ultimo >= 33) { ultimo = t; invalidate(); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [ctl, reduzido, alvoEl, invalidate]);
  return null;
}

/* API de controle (corrida de saída e reação de erro), exposta ao Login via apiRef. */
function Controle({ ctl, apiRef, palco }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let tl = null, rx = null;
    apiRef.current = {
      correr() {
        return new Promise((resolve) => {
          rx?.kill();
          ctl.ativo = true; ctl.balanco = 0; invalidate();
          const el = palco.current;
          const r = el.getBoundingClientRect();
          const dist = r.right + Math.max(r.width * 0.25, 90);
          tl = gsap.timeline({ onComplete: () => { ctl.ativo = false; resolve(true); } });
          tl.to(ctl, { yaw: YAW_CORRIDA, duration: 0.35, ease: 'power2.inOut' }, 0)
            .to(ctl, { blend: 1, duration: 0.3, ease: 'power2.out' }, 0.05)
            .to(ctl, { vel: 1, duration: 0.45, ease: 'power1.in' }, 0.1)
            .to(el, { x: -dist, duration: 1.05, ease: 'power2.in' }, 0.4);
        });
      },
      reagir() {
        if (tl) return;
        rx?.kill();
        ctl.ativo = true; ctl.balancoFase = 0; invalidate();
        rx = gsap.timeline({ onComplete: () => { ctl.ativo = false; ctl.balanco = 0; } });
        rx.to(ctl, { balanco: 1, duration: 0.08 }, 0)
          .to(ctl, { balancoFase: Math.PI * 6, duration: 0.7, ease: 'none' }, 0)
          .to(ctl, { balanco: 0, duration: 0.2 }, 0.5);
      },
    };
    return () => { tl?.kill(); rx?.kill(); apiRef.current = null; };
  }, [ctl, apiRef, palco, invalidate]);
  return null;
}

export default function PantherScene({ tema, reduzido, apiRef, palco, onPronto, onFalha }) {
  const ctl = useRef(null);
  if (!ctl.current) ctl.current = novoCtl();

  // cabeça acompanha o cursor, com amplitude pequena
  useEffect(() => {
    if (reduzido) return undefined;
    const mover = (e) => {
      ctl.current.alvo[0] = (e.clientX / window.innerWidth - 0.5) * 2;
      ctl.current.alvo[1] = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => window.removeEventListener('pointermove', mover);
  }, [reduzido]);

  return (
    <Canvas
      aria-hidden="true"
      frameloop="demand"
      dpr={[1, 1.5]}
      shadows={false}
      camera={{ position: [0, 0.8, 4.3], fov: 26, near: 0.1, far: 30 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      style={{ pointerEvents: 'none' }}
      onCreated={({ gl, camera }) => {
        camera.lookAt(AZUL_ZERO.set(0.1, 0.48, 0));
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onFalha?.(); });
      }}
    >
      <Enquadre />
      <Luzes tema={tema} />
      <Pantera ctl={ctl.current} reduzido={reduzido} onPronto={onPronto} />
      <Ritmo ctl={ctl.current} reduzido={reduzido} alvoEl={palco} />
      <Controle ctl={ctl.current} apiRef={apiRef} palco={palco} />
    </Canvas>
  );
}

useLoader.preload(GLTFLoader, MODELO, usarMeshopt);
