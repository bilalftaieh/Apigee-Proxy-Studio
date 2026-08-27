import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { useStore } from '../store/useStore';

type Mode = 'choose' | 'curl' | 'openapi' | 'postman' | 'wsdl';

const CURL_PLACEHOLDER = `curl 'https://api.example.com/v1/pets/42' \\
  -H 'Accept: application/json' \\
  -H 'Authorization: Bearer <token>'`;

const OPENAPI_PLACEHOLDER = `Paste an OpenAPI 3.x or Swagger 2.0 document here (JSON or YAML) — or choose a file below.`;
const POSTMAN_PLACEHOLDER = `Paste an exported Postman Collection v2.1 JSON here — or choose a file below.`;
const WSDL_PLACEHOLDER = `Paste a WSDL document here — or choose a file below.`;

// Shared by the OpenAPI and Postman forms: a textarea plus a file picker,
// either of which populates the same text value.
function TextImportForm({
  label,
  placeholder,
  accept,
  value,
  onChange,
  fileName,
  onFile,
  hint,
  loadedHint,
  busy,
  error,
  onBack,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  accept: string;
  value: string;
  onChange: (v: string) => void;
  fileName: string | null;
  onFile: (file: File) => void;
  hint: string;
  loadedHint: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file);
  };
  return (
    <>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>{label}</label>
        <textarea
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ minHeight: 200, fontFamily: 'var(--font-mono)', fontSize: 12 }}
        />
        <div className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input ref={fileRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleFile} />
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => fileRef.current?.click()}>
            Choose File
          </button>
          {fileName ? loadedHint : hint}
        </div>
      </div>
      {error && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>{error}</p>}
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onBack}>
          &larr; Back
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={onSubmit}>
          {busy ? <span className="spinner" /> : 'Import'}
        </button>
      </div>
    </>
  );
}

export function ImportProxyModal({ onClose, onPickZip }: { onClose: () => void; onPickZip: () => void }) {
  const importCurl = useStore((s) => s.importCurl);
  const importOpenApi = useStore((s) => s.importOpenApi);
  const importPostman = useStore((s) => s.importPostman);
  const importWsdl = useStore((s) => s.importWsdl);

  const [mode, setMode] = useState<Mode>('choose');
  const [curlText, setCurlText] = useState('');
  const [specText, setSpecText] = useState('');
  const [specFileName, setSpecFileName] = useState<string | null>(null);
  const [postmanText, setPostmanText] = useState('');
  const [postmanFileName, setPostmanFileName] = useState<string | null>(null);
  const [wsdlText, setWsdlText] = useState('');
  const [wsdlFileName, setWsdlFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setBusy(false);
  };

  const goTo = (next: Mode) => {
    reset();
    setMode(next);
  };

  const submitCurl = async () => {
    if (!curlText.trim()) return setError('Paste a curl command first.');
    setBusy(true);
    setError(null);
    try {
      await importCurl(curlText);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitOpenApi = async () => {
    if (!specText.trim()) return setError('Paste or choose a spec file first.');
    setBusy(true);
    setError(null);
    try {
      await importOpenApi(specText);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitPostman = async () => {
    if (!postmanText.trim()) return setError('Paste or choose a collection file first.');
    setBusy(true);
    setError(null);
    try {
      await importPostman(postmanText);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitWsdl = async () => {
    if (!wsdlText.trim()) return setError('Paste or choose a WSDL file first.');
    setBusy(true);
    setError(null);
    try {
      await importWsdl(wsdlText);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = {
    choose: 'Import a Proxy',
    curl: 'Import from a curl Command',
    openapi: 'Import from an OpenAPI / Swagger Spec',
    postman: 'Import from a Postman Collection',
    wsdl: 'Import from a WSDL File',
  };

  return (
    <Modal title={titles[mode]} onClose={onClose} wide={mode !== 'choose'}>
      {mode === 'choose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="quickstart-card"
            onClick={() => {
              onPickZip();
              onClose();
            }}
          >
            <div className="quickstart-card-icon">
              <Icon name="upload" size={18} />
            </div>
            <h3>Apigee Bundle (.zip)</h3>
            <p>A real exported apiproxy bundle — brought in exactly as Apigee X would read it.</p>
          </button>

          <button className="quickstart-card" onClick={() => goTo('openapi')}>
            <div className="quickstart-card-icon">
              <Icon name="file-json" size={18} />
            </div>
            <h3>OpenAPI / Swagger Spec</h3>
            <p>One conditional flow per path+verb, plus a request-validation policy generated from the spec.</p>
          </button>

          <button className="quickstart-card" onClick={() => goTo('curl')}>
            <div className="quickstart-card-icon">
              <Icon name="terminal" size={18} />
            </div>
            <h3>curl Command</h3>
            <p>Paste a captured request — infers the target, method and headers, and scaffolds a pass-through proxy.</p>
          </button>

          <button className="quickstart-card" onClick={() => goTo('postman')}>
            <div className="quickstart-card-icon">
              <Icon name="send" size={18} />
            </div>
            <h3>Postman Collection</h3>
            <p>One conditional flow per request, resolved from the collection's own {'{{variables}}'} and folder structure.</p>
          </button>

          <button className="quickstart-card" onClick={() => goTo('wsdl')}>
            <div className="quickstart-card-icon">
              <Icon name="file-check" size={18} />
            </div>
            <h3>WSDL File</h3>
            <p>SOAP Pass-Through: one conditional flow per operation routed by SOAPAction, validated against the bundled WSDL.</p>
          </button>
        </div>
      )}

      {mode === 'curl' && (
        <>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>curl Command</label>
            <textarea
              autoFocus
              placeholder={CURL_PLACEHOLDER}
              value={curlText}
              onChange={(e) => setCurlText(e.target.value)}
              style={{ minHeight: 140, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <div className="field-hint">
              Bash-style commands only (e.g. copied from a browser's DevTools → Copy as cURL).
            </div>
          </div>
          {error && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>{error}</p>}
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => goTo('choose')}>
              &larr; Back
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={submitCurl}>
              {busy ? <span className="spinner" /> : 'Import'}
            </button>
          </div>
        </>
      )}

      {mode === 'openapi' && (
        <TextImportForm
          label="Spec"
          placeholder={OPENAPI_PLACEHOLDER}
          accept=".json,.yaml,.yml"
          value={specText}
          onChange={(v) => {
            setSpecFileName(null);
            setSpecText(v);
          }}
          fileName={specFileName}
          onFile={async (file) => {
            setSpecFileName(file.name);
            setSpecText(await file.text());
          }}
          hint="Nothing is fetched over the network — the whole spec is bundled as-is and validated by Apigee's own OASValidation policy at runtime."
          loadedHint={`Loaded ${specFileName}`}
          busy={busy}
          error={error}
          onBack={() => goTo('choose')}
          onSubmit={submitOpenApi}
        />
      )}

      {mode === 'postman' && (
        <TextImportForm
          label="Collection"
          placeholder={POSTMAN_PLACEHOLDER}
          accept=".json"
          value={postmanText}
          onChange={(v) => {
            setPostmanFileName(null);
            setPostmanText(v);
          }}
          fileName={postmanFileName}
          onFile={async (file) => {
            setPostmanFileName(file.name);
            setPostmanText(await file.text());
          }}
          hint="Only the collection's own variables are resolved — no separate Postman environment file, no network calls."
          loadedHint={`Loaded ${postmanFileName}`}
          busy={busy}
          error={error}
          onBack={() => goTo('choose')}
          onSubmit={submitPostman}
        />
      )}

      {mode === 'wsdl' && (
        <TextImportForm
          label="WSDL"
          placeholder={WSDL_PLACEHOLDER}
          accept=".wsdl,.xml"
          value={wsdlText}
          onChange={(v) => {
            setWsdlFileName(null);
            setWsdlText(v);
          }}
          fileName={wsdlFileName}
          onFile={async (file) => {
            setWsdlFileName(file.name);
            setWsdlText(await file.text());
          }}
          hint="Nothing is fetched over the network. Only a single self-contained WSDL is supported for now — WSDLs that reference external .xsd files via <xsd:import> aren't resolved yet."
          loadedHint={`Loaded ${wsdlFileName}`}
          busy={busy}
          error={error}
          onBack={() => goTo('choose')}
          onSubmit={submitWsdl}
        />
      )}
    </Modal>
  );
}
