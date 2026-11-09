/* Motor de vídeo da Fábrica, todo no navegador (WebCodecs + Mediabunny). Substitui o ffmpeg da versão local:
   - info(arquivo): tamanho, duração e se o navegador consegue ler o vídeo;
   - copiaAnalise(arquivo): cópia pequena (640 px, ~300 kbps) só para a IA assistir no raio-x;
   - exportar(...): monta o formato em MP4 1080x1920, 30 fps, H.264 + o áudio original.
   Expõe window.Video e dispara o evento "video-pronto". */
import {
  Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, Conversion,
  VideoSample, QUALITY_HIGH, canEncodeVideo, canEncodeAudio,
} from './vendor/mediabunny-1.61.6.min.mjs';

const W = 1080, H = 1920, FPS = 30;
const novoInput = (arquivo) => new Input({ source: new BlobSource(arquivo), formats: ALL_FORMATS });

function motivoDescarte(conv) {
  return (conv.discardedTracks || []).map((d) => `${d.track.type === 'video' ? 'vídeo' : 'áudio'} (${d.reason})`).join(', ');
}

async function info(arquivo) {
  if (!('VideoEncoder' in window) || !('VideoDecoder' in window)) {
    throw new Error('Este navegador não consegue montar vídeos. Use o Google Chrome ou o Microsoft Edge atualizados no computador.');
  }
  const input = novoInput(arquivo);
  try {
    const v = await input.getPrimaryVideoTrack();
    if (!v) throw new Error('O arquivo não tem vídeo.');
    if (!(await v.canDecode())) {
      throw new Error(`O navegador não consegue ler este vídeo (codec ${v.codec || 'desconhecido'}). Exporte em MP4 H.264 ou abra no Chrome/Edge atualizados.`);
    }
    const a = await input.getPrimaryAudioTrack();
    const duracao = await input.computeDuration();
    return { largura: v.displayWidth, altura: v.displayHeight, duracao, audio: Boolean(a), codec: v.codec };
  } finally { input.dispose?.(); }
}

// Cópia leve para a IA: lado maior 640 px, 12 quadros/s, áudio mono. MP4 (H.264+AAC) e, se o navegador
// não tiver codificador AAC, WebM (VP8+Opus), que o Gemini também aceita.
async function copiaAnalise(arquivo, aoProgredir) {
  const meta = await info(arquivo);
  const deitado = meta.largura >= meta.altura;
  const tamanho = deitado ? { width: 640 } : { height: 640 };
  const aac = await canEncodeAudio('aac').catch(() => false);
  const opcoes = aac
    ? { fmt: new Mp4OutputFormat({ fastStart: 'in-memory' }), mime: 'video/mp4', vc: 'avc', ac: 'aac' }
    : { fmt: new WebMOutputFormat(), mime: 'video/webm', vc: 'vp8', ac: 'opus' };
  const input = novoInput(arquivo);
  const output = new Output({ format: opcoes.fmt, target: new BufferTarget() });
  const conv = await Conversion.init({
    input, output,
    video: { ...tamanho, frameRate: 12, codec: opcoes.vc, bitrate: 300e3, forceTranscode: true, keyFrameInterval: 5 },
    audio: { codec: opcoes.ac, numberOfChannels: 1, sampleRate: 48000, bitrate: 48e3, forceTranscode: true },
  });
  if (!conv.isValid) throw new Error('Não consegui preparar o vídeo para a IA: ' + motivoDescarte(conv));
  if (aoProgredir) conv.onProgress = aoProgredir;
  try { await conv.execute(); } finally { input.dispose?.(); }
  return { blob: new Blob([output.target.buffer], { type: opcoes.mime }), mime: opcoes.mime };
}

// Monta um formato: base (fundo) + vídeo nos espaços (slots) + topo, quadro a quadro.
// desenhar(ctx, amostra) recebe o contexto 1080x1920 e o quadro do vídeo de origem.
let execucao = null;
async function exportar(arquivo, desenhar, aoProgredir) {
  if (!(await canEncodeVideo('avc', { width: W, height: H }).catch(() => false))) {
    throw new Error('Este navegador não consegue gerar MP4 (H.264). Use o Google Chrome ou o Microsoft Edge atualizados.');
  }
  const tela = document.createElement('canvas'); tela.width = W; tela.height = H;
  const ctx = tela.getContext('2d', { alpha: false });
  const input = novoInput(arquivo);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conv = await Conversion.init({
    input, output,
    video: {
      codec: 'avc', frameRate: FPS, bitrate: QUALITY_HIGH, forceTranscode: true, keyFrameInterval: 2,
      processedWidth: W, processedHeight: H,
      process: (amostra) => {
        desenhar(ctx, amostra);
        // copia o quadro já pronto (a mesma tela é reaproveitada no quadro seguinte)
        return new VideoSample(tela, { timestamp: amostra.timestamp, duration: amostra.duration });
      },
    },
    // áudio: copiado como está quando já é AAC; senão, convertido para AAC
    audio: { codec: 'aac' },
  });
  if (!conv.isValid) throw new Error('Não consegui montar este formato: ' + motivoDescarte(conv));
  if (aoProgredir) conv.onProgress = aoProgredir;
  execucao = conv;
  try { await conv.execute(); } finally { execucao = null; input.dispose?.(); }
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
const cancelar = () => execucao?.cancel();

window.Video = { info, copiaAnalise, exportar, cancelar, W, H };
window.dispatchEvent(new Event('video-pronto'));
