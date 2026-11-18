import { Component, lazy, Suspense, useCallback, useImperativeHandle, useRef, useState } from 'react';

/* O 3D (three + R3F + GSAP + modelo) fica em outro chunk e só carrega na tela de login. */
const Cena = lazy(() => import('./PantherScene.jsx'));

class Barreira extends Component {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch() { this.props.onErro?.(); }
  render() { return this.state.erro ? null : this.props.children; }
}

function podeUsar3D() {
  try {
    const nav = navigator;
    if (nav.connection?.saveData) return false;
    if ((nav.deviceMemory && nav.deviceMemory <= 2) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2)) return false;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}
const reduzMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* Pantera da tela de login. Decorativa (aria-hidden). Sempre mostra a imagem estática por baixo:
   ela é o fallback (sem WebGL, aparelho fraco, erro) e o que aparece enquanto o modelo carrega. */
export default function PantherStage({ tema, ref }) {
  const [reduzido] = useState(reduzMovimento);
  // movimento reduzido: pantera estática (imagem), sem baixar o chunk 3D
  const [usa3D, setUsa3D] = useState(() => !reduzMovimento() && podeUsar3D());
  const [pronto, setPronto] = useState(false);
  const palco = useRef(null);
  const apiRef = useRef(null);
  const prontoRef = useRef(false);

  const aoPronto = useCallback(() => { prontoRef.current = true; setPronto(true); }, []);
  const aoFalhar = useCallback(() => { prontoRef.current = false; setPronto(false); setUsa3D(false); }, []);

  // Resolve true se a corrida rolou; false se o Login deve entrar direto (sem 3D, reduzido ou erro).
  useImperativeHandle(ref, () => ({
    sair: () => (usa3D && !reduzido && prontoRef.current && apiRef.current ? apiRef.current.correr().catch(() => false) : Promise.resolve(false)),
    reagir: () => { if (prontoRef.current) apiRef.current?.reagir(); },
  }), [usa3D, reduzido]);

  return (
    <div className="pantera" ref={palco} aria-hidden="true">
      <img className={`pantera-img${pronto ? ' off' : ''}`} src={`/pantera-sentada-${tema === 'claro' ? 'claro' : 'escuro'}.webp`} alt="" width="800" height="640" draggable="false" />
      {usa3D && (
        <Barreira onErro={aoFalhar}>
          <Suspense fallback={null}>
            <div className={`pantera-cv${pronto ? ' on' : ''}`}>
              <Cena tema={tema} reduzido={reduzido} apiRef={apiRef} palco={palco} onPronto={aoPronto} onFalha={aoFalhar} />
            </div>
          </Suspense>
        </Barreira>
      )}
    </div>
  );
}
