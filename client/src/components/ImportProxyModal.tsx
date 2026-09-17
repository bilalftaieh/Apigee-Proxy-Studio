import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { useStore } from '../store/useStore';

type Mode = 'choose' | 'curl' | 'openapi' | 'postman' | 'wsdl';

const CURL_PLACEHOLDER = `curl 'https://api.example.com/v1/pets/42' \\
  -H 'Accept: application/json' \\
  -H 'Authorization: Bearer <token>'`;

const OPENAPI_PLACEHOLDER = `Paste your OpenAPI 3.x or Swagger 2.0 specification here (JSON or YAML). You can also select a file using the chooser below.`;
const POSTMAN_PLACEHOLDER = `Paste your Postman Collection v2.1 export (JSON) here. Alternatively, use the file chooser below.`;
const WSDL_PLACEHOLDER = `Paste your WSDL document content here. Or select a .wsdl or .xml file using the chooser below.`;

const HINTS = {
  openapi: {
    hint: 'OpenAPI specifications are bundled as-is and validated by Apigee\'s OASValidation policy at runtime. No external references are fetched.',
    loaded: (name: string) => `Loaded: ${name}`,
  },
  postman: {
    hint: 'Only the collection\'s built-in variables are resolved. Postman environment files and network calls are not supported.',
    loaded: (name: string) => `Loaded: ${name}`,
  },
  wsdl: {
    hint: 'Only self-contained WSDL documents are supported. External XSD imports via <xsd:import> are not yet resolved.',
    loaded: (name: string) => `Loaded: ${name}`,
  },
};

// Reusable form component for text-based imports (OpenAPI, Postman, WSDL)
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
  submitLabel = 'Import proxy',
  importingLabel = 'Importing proxy...',
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
  submitLabel?: string;
  importingLabel?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file);
  };

  return (
    <>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>{label}</label>
        <textarea
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ 
            minHeight: 220, 
            fontFamily: 'var(--font-mono)', 
            fontSize: 12,
            resize: 'vertical'
          }}
        />
        <div className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input 
            ref={fileRef} 
            type="file" 
            accept={accept} 
            style={{ display: 'none' }} 
            onChange={handleFile} 
          />
          <button 
            className="btn btn-ghost" 
            style={{ padding: '4px 10px', fontSize: 11.5 }} 
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Icon name="upload" size={14} />
            Choose file
          </button>
          <span style={{ color: fileName ? 'var(--text-1)' : 'var(--text-3)' }}>
            {fileName ? loadedHint : hint}
          </span>
        </div>
      </div>
      
      {error && (
        <p style={{ 
          color: 'var(--error-ink)', 
          fontSize: 12, 
          marginTop: 0,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <Icon name="error" size={14} />
          {error}
        </p>
      )}
      
      <div className="modal-footer">
        <button 
          className="btn btn-ghost" 
          onClick={onBack}
          disabled={busy}
        >
          Back
        </button>
        <button 
          className="btn btn-primary" 
          disabled={busy || !value.trim()} 
          onClick={onSubmit}
          style={{ minWidth: 120 }}
        >
          {busy ? (
            <>
              <span className="spinner spinner-sm" style={{ width: 14, height: 14, marginRight: 6 }} />
              {importingLabel}
            </>
          ) : (
            submitLabel
          )}
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
    choose: 'Import proxy',
    curl: 'Import from curl command',
    openapi: 'Import from OpenAPI spec',
    postman: 'Import from Postman collection',
    wsdl: 'Import from WSDL file',
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
          <div className="field" style={{ marginBottom: 12 }}>
            <label>curl command</label>
            <textarea
              autoFocus
              placeholder={CURL_PLACEHOLDER}
              value={curlText}
              onChange={(e) => setCurlText(e.target.value)}
              style={{ 
                minHeight: 160, 
                fontFamily: 'var(--font-mono)', 
                fontSize: 12,
                resize: 'vertical'
              }}
            />
            <div className="field-hint">
              Bash-style commands only (for example, copied from a browser's DevTools → Copy as cURL).
            </div>
          </div>
          {error && (
            <p style={{ 
              color: 'var(--error-ink)', 
              fontSize: 12, 
              marginTop: 0,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <Icon name="error" size={14} />
              {error}
            </p>
          )}
          <div className="modal-footer">
            <button 
              className="btn btn-ghost" 
              onClick={() => goTo('choose')}
              disabled={busy}
            >
              Back
            </button>
            <button 
              className="btn btn-primary" 
              disabled={busy || !curlText.trim()} 
              onClick={submitCurl}
              style={{ minWidth: 120 }}
            >
              {busy ? (
                <>
                  <span className="spinner spinner-sm" style={{ width: 14, height: 14, marginRight: 6 }} />
                  Importing proxy...
                </>
              ) : (
                'Import proxy'
              )}
            </button>
          </div>
        </>
      )}

      {mode === 'openapi' && (
        <TextImportForm
          label="OpenAPI specification"
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
          hint={HINTS.openapi.hint}
          loadedHint={HINTS.openapi.loaded(specFileName || '')}
          busy={busy}
          error={error}
          onBack={() => goTo('choose')}
          onSubmit={submitOpenApi}
        />
      )}

      {mode === 'postman' && (
        <TextImportForm
          label="Postman collection"
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
          hint={HINTS.postman.hint}
          loadedHint={HINTS.postman.loaded(postmanFileName || '')}
          busy={busy}
          error={error}
          onBack={() => goTo('choose')}
          onSubmit={submitPostman}
        />
      )}

      {mode === 'wsdl' && (
        <TextImportForm
          label="WSDL document"
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
          hint={HINTS.wsdl.hint}
          loadedHint={HINTS.wsdl.loaded(wsdlFileName || '')}
          busy={busy}
          error={error}
          onBack={() => goTo('choose')}
          onSubmit={submitWsdl}
        />
      )}
    </Modal>
  );
}
