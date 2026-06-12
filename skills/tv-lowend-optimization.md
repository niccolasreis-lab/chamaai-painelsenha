# Skill: tv-lowend-optimization

### Contexto
Componentes do Telão (src/telao/) rodam em Smart TVs e TV Boxes de baixo desempenho (Xiaomi Mi Box S, boxes Android genéricas). Estas regras devem ser seguidas em qualquer novo componente ou alteração nos existentes.

### Regras de CSS / Animação
- **NUNCA usar:** `filter`, `drop-shadow`, `box-shadow` dinâmico, `backdrop-blur` em elementos animados ou que sofrem re-render frequente.
- **SEMPRE usar para animações:** `transform`, `translate3d`, `opacity`, `will-change: transform`.
- **Animações de entrada de senha:** usar CSS keyframes com `transform: translateY` + `opacity`, nunca animate com `height` ou `width`.
- **Carrosséis e transições de mídia:** usar `transform: translateX` com `transition` duration máxima de 600ms.

### Regras de Áudio (TTS e campainha)
- **NUNCA** reproduzir áudio no mesmo tick de uma atualização de estado.
- **SEMPRE** adicionar delay mínimo de 300ms entre atualização visual e início do áudio (`setTimeout` ou `requestAnimationFrame`).
- **Web Audio API:** criar `AudioContext` sob interação do usuário ou lazy no primeiro evento, nunca no mount do componente.
- **Fallback Android TV:** usar `SpeechSynthesis` com verificação de `voices` disponíveis antes de falar.

### Regras de SSE / Re-render
- Eventos SSE que atualizam a senha chamada devem atualizar estado mínimo — nunca re-montar o componente inteiro.
- Usar `useRef` para valores que não precisam causar re-render (ex: último ID de senha chamada para deduplicação).
- Limpar `EventSource` no cleanup do `useEffect` sem exceção.

### Regras de Memória
- Componentes com `setInterval` ou `setTimeout` devem sempre limpar no return do `useEffect`.
- **Vídeos em carrossel:** pausar e resetar `currentTime` ao sair do viewport antes de destruir o elemento.

### Checklist antes de mergear qualquer componente de Telão
- [ ] Não usa filter/shadow em elementos animados
- [ ] Áudio tem delay >= 300ms após update de estado  
- [ ] SSE tem cleanup no useEffect
- [ ] Animações usam transform/opacity
- [ ] Sem setInterval/setTimeout sem clearInterval/clearTimeout
