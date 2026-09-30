import { useEffect, useRef } from 'react';
import { SCHEMA_VERSION } from '@beze/project-schema';
import { useEditor } from '../store/editorStore.js';
import { assets } from '../services.js';
import type { EditorToRuntime, RuntimeToEditor } from './protocol.js';
import { withBase } from '../base.js';

/**
 * Hosts the runtime in a sandboxed iframe. No `allow-same-origin`, so the game cannot reach
 * the editor's storage or DOM; the project and asset data URLs cross via postMessage.
 */
export function PlayPanel() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const status = useEditor((s) => s.play.status);
  const error = useEditor((s) => s.play.error);
  const setPlay = useEditor((s) => s.setPlay);

  useEffect(() => {
    const iframe = iframeRef.current!;
    const send = (msg: EditorToRuntime) => iframe.contentWindow?.postMessage(msg, '*');
    const onMessage = async (ev: MessageEvent<RuntimeToEditor>) => {
      if (ev.source !== iframe.contentWindow) return;
      const msg = ev.data;
      if (!msg || typeof msg.type !== 'string') return;
      switch (msg.type) {
        case 'beze:ready': {
          if (SCHEMA_VERSION > msg.supportedSchema.max) { setPlay({ status: 'error', error: `runtime ${msg.runtimeVersion} does not support schema ${SCHEMA_VERSION}` }); return; }
          const project = useEditor.getState().project;
          if (!project) return;
          const assetUrls = await assets.dataUrls(Object.keys(project.assets));
          // The editor's preview skips the title screen for quick iteration; exports show it.
          send({ type: 'beze:load', project, assetUrls, options: { debug: true, title: false } });
          break;
        }
        case 'beze:loaded':
          setPlay({ status: 'running', error: null });
          iframe.focus();
          break;
        case 'beze:exit':
          setPlay({ status: 'stopped', error: null });
          break;
        case 'beze:error':
          setPlay({ status: 'error', error: msg.message });
          break;
        case 'beze:log':
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('message', onMessage); send({ type: 'beze:stop' }); };
  }, [setPlay]);

  return (
    <div className="play" data-testid="play-panel" data-status={status}>
      <div className="play-bar">
        <span>{status === 'starting' ? 'Starting…' : status === 'running' ? 'Playing · arrows/WASD move · Shift runs · E interacts · Space attacks · M map · I inventory · Esc stops' : status === 'error' ? 'Error' : ''}</span>
        <span className="spacer" />
        <button className="danger small" onClick={() => setPlay({ status: 'stopped', error: null })}>Stop</button>
      </div>
      {error && <pre className="play-error">{error}</pre>}
      <iframe ref={iframeRef} title="Game preview" className="play-frame" src={withBase("/runtime/index.html")} sandbox="allow-scripts" onLoad={() => iframeRef.current?.focus()} />
    </div>
  );
}
