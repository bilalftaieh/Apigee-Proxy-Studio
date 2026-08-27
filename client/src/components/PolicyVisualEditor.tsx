import { useState } from 'react';
import { Icon } from './Icon';
import { VarValueInput } from './VarValueInput';
import type { PolicyField, PolicySchema } from '../lib/policySchema';
import { buildPolicyXml, defaultFormState, parsePolicyXml, type FieldValue, type PolicyFormState } from '../lib/policyForm';

function KvListEditor({
  items,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  items: { name: string; value: string }[];
  onChange: (items: { name: string; value: string }[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  return (
    <div className="pf-list">
      {items.map((it, i) => (
        <div className="pf-list-row" key={i}>
          <input
            className="mono"
            placeholder={keyPlaceholder || 'name'}
            value={it.name}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
          />
          <input
            className="mono"
            placeholder={valuePlaceholder || 'value'}
            value={it.value}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
          />
          <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove row">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="pf-list-add" onClick={() => onChange([...items, { name: '', value: '' }])}>
        <Icon name="plus" size={12} /> Add row
      </button>
    </div>
  );
}

function StringListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder?: string }) {
  return (
    <div className="pf-list">
      {items.map((v, i) => (
        <div className="pf-list-row" key={i}>
          <input
            className="mono"
            style={{ flex: 1 }}
            placeholder={placeholder || 'value'}
            value={v}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove row">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="pf-list-add" onClick={() => onChange([...items, ''])}>
        <Icon name="plus" size={12} /> Add
      </button>
    </div>
  );
}

function IpRulesEditor({
  rules,
  onChange,
}: {
  rules: { action: 'ALLOW' | 'DENY'; mask: string; address: string }[];
  onChange: (rules: { action: 'ALLOW' | 'DENY'; mask: string; address: string }[]) => void;
}) {
  return (
    <div className="pf-list">
      {rules.map((r, i) => (
        <div className="pf-list-row" key={i}>
          <select value={r.action} onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, action: e.target.value as 'ALLOW' | 'DENY' } : x)))}>
            <option value="ALLOW">ALLOW</option>
            <option value="DENY">DENY</option>
          </select>
          <input
            className="mono"
            style={{ flex: 1 }}
            placeholder="10.0.0.1"
            value={r.address}
            onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))}
          />
          <input
            className="mono"
            style={{ width: 70 }}
            placeholder="mask"
            value={r.mask}
            onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, mask: e.target.value } : x)))}
          />
          <button type="button" className="icon-btn" onClick={() => onChange(rules.filter((_, j) => j !== i))} aria-label="Remove rule">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="pf-list-add" onClick={() => onChange([...rules, { action: 'DENY', mask: '32', address: '' }])}>
        <Icon name="plus" size={12} /> Add rule
      </button>
    </div>
  );
}

function FieldRow({ field, value, onChange }: { field: PolicyField; value: FieldValue; onChange: (v: FieldValue) => void }) {
  switch (field.type) {
    case 'text':
    case 'number':
      if (value.kind !== 'text') return null;
      return (
        <div className="field pf-field">
          <label>
            {field.label}
            {field.required && <span className="pf-required"> *</span>}
          </label>
          <input
            type={field.type === 'number' ? 'number' : 'text'}
            className="mono"
            value={value.value}
            placeholder={field.placeholder}
            onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
          />
          {field.help && <span className="field-hint">{field.help}</span>}
        </div>
      );
    case 'ref':
      if (value.kind !== 'ref') return null;
      return (
        <div className="field pf-field">
          <label>
            {field.label}
            {field.required && <span className="pf-required"> *</span>}
          </label>
          <VarValueInput value={{ mode: value.mode, value: value.value }} onChange={(v) => onChange({ kind: 'ref', mode: v.mode, value: v.value })} placeholder={field.placeholder} />
          {field.help && <span className="field-hint">{field.help}</span>}
        </div>
      );
    case 'boolean':
      if (value.kind !== 'boolean') return null;
      return (
        <label className="pf-checkbox">
          <input type="checkbox" checked={value.value} onChange={(e) => onChange({ kind: 'boolean', value: e.target.checked })} />
          <span>{field.label}</span>
          {field.help && <span className="field-hint">{field.help}</span>}
        </label>
      );
    case 'select':
      if (value.kind !== 'text') return null;
      return (
        <div className="field pf-field">
          <label>{field.label}</label>
          <select value={value.value} onChange={(e) => onChange({ kind: 'text', value: e.target.value })}>
            <option value="" disabled hidden>
              (none)
            </option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case 'attr':
      if (value.kind !== 'attr') return null;
      return (
        <div className="field pf-field">
          <label>{field.label}</label>
          <input className="mono" value={value.value} onChange={(e) => onChange({ kind: 'attr', value: e.target.value })} />
          {field.help && <span className="field-hint">{field.help}</span>}
        </div>
      );
    case 'attr-boolean':
      if (value.kind !== 'boolean') return null;
      return (
        <label className="pf-checkbox">
          <input type="checkbox" checked={value.value} onChange={(e) => onChange({ kind: 'boolean', value: e.target.checked })} />
          <span>{field.label}</span>
        </label>
      );
    case 'attr-select':
      if (value.kind !== 'attr') return null;
      return (
        <div className="field pf-field">
          <label>{field.label}</label>
          <select value={value.value} onChange={(e) => onChange({ kind: 'attr', value: e.target.value })}>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case 'kv-list':
      if (value.kind !== 'kv-list') return null;
      return (
        <div className="pf-field">
          <label>{field.label}</label>
          <KvListEditor items={value.items} onChange={(items) => onChange({ kind: 'kv-list', items })} keyPlaceholder={field.keyPlaceholder} valuePlaceholder={field.valuePlaceholder} />
        </div>
      );
    case 'string-list':
      if (value.kind !== 'string-list') return null;
      return (
        <div className="pf-field">
          <label>{field.label}</label>
          <StringListEditor items={value.items} onChange={(items) => onChange({ kind: 'string-list', items })} placeholder={field.placeholder} />
        </div>
      );
    case 'ip-rules':
      if (value.kind !== 'ip-rules') return null;
      return (
        <div className="pf-field">
          <label>{field.label}</label>
          <IpRulesEditor rules={value.rules} onChange={(rules) => onChange({ kind: 'ip-rules', rules })} />
        </div>
      );
    case 'element': {
      if (value.kind !== 'element') return null;
      return (
        <div className="pf-field pf-element">
          <label>
            {field.label}
            {field.required && <span className="pf-required"> *</span>}
          </label>
          <div className="pf-element-row">
            {(field.attrs || []).map((a) =>
              a.kind === 'boolean' ? (
                <label className="pf-checkbox pf-element-attr" key={a.name}>
                  <input
                    type="checkbox"
                    checked={value.attrs[a.name] === 'true'}
                    onChange={(e) => onChange({ ...value, attrs: { ...value.attrs, [a.name]: String(e.target.checked) } })}
                  />
                  <span>{a.label}</span>
                </label>
              ) : a.kind === 'select' ? (
                <div className="pf-element-attr" key={a.name}>
                  <span className="pf-element-attr-label">{a.label}</span>
                  <select value={value.attrs[a.name] || ''} onChange={(e) => onChange({ ...value, attrs: { ...value.attrs, [a.name]: e.target.value } })}>
                    {(a.options || []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="pf-element-attr" key={a.name}>
                  <span className="pf-element-attr-label">{a.label}</span>
                  <input className="mono" value={value.attrs[a.name] || ''} onChange={(e) => onChange({ ...value, attrs: { ...value.attrs, [a.name]: e.target.value } })} />
                </div>
              )
            )}
          </div>
          {field.hasText && (
            <input
              className="mono"
              style={{ marginTop: 6 }}
              placeholder={field.textPlaceholder || field.textLabel}
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
            />
          )}
          {field.help && <span className="field-hint">{field.help}</span>}
        </div>
      );
    }
    default:
      return null;
  }
}

export function PolicyVisualEditor({
  xml,
  schema,
  policyName,
  onChange,
}: {
  xml: string;
  schema: PolicySchema;
  policyName: string;
  onChange: (xml: string) => void;
}) {
  const [state] = useState<{ form: PolicyFormState; parseFailed: boolean }>(() => {
    const parsed = parsePolicyXml(xml, schema);
    return parsed ? { form: parsed, parseFailed: false } : { form: defaultFormState(schema), parseFailed: true };
  });
  const [form, setForm] = useState<PolicyFormState>(state.form);

  const update = (next: PolicyFormState) => {
    setForm(next);
    onChange(buildPolicyXml(policyName, next, schema));
  };

  return (
    <div className="pf-editor">
      {state.parseFailed && (
        <div className="fd-warning" style={{ margin: '0 16px 12px' }}>
          <Icon name="triangle-alert" size={13} /> Couldn't map this policy's current XML to the visual editor — showing default fields instead. Editing here will replace the XML.
        </div>
      )}

      <div className="pf-section">
        <h5 className="pf-section-title">General</h5>
        <div className="field-grid">
          <div className="field pf-field">
            <label>Display Name</label>
            <input value={form.common.displayName} placeholder={policyName} onChange={(e) => update({ ...form, common: { ...form.common, displayName: e.target.value } })} />
          </div>
          {schema.rootAttrs?.map((a) => (
            <div className="field pf-field" key={a.name}>
              <label>{a.label}</label>
              {a.kind === 'select' ? (
                <select
                  value={form.common.rootAttrValues[a.name] || ''}
                  onChange={(e) => update({ ...form, common: { ...form.common, rootAttrValues: { ...form.common.rootAttrValues, [a.name]: e.target.value } } })}
                >
                  {(a.options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="mono"
                  value={form.common.rootAttrValues[a.name] || ''}
                  onChange={(e) => update({ ...form, common: { ...form.common, rootAttrValues: { ...form.common.rootAttrValues, [a.name]: e.target.value } } })}
                />
              )}
            </div>
          ))}
        </div>
        <div className="pf-checkbox-row">
          <label className="pf-checkbox">
            <input type="checkbox" checked={form.common.enabled} onChange={(e) => update({ ...form, common: { ...form.common, enabled: e.target.checked } })} />
            <span>Enabled</span>
          </label>
          <label className="pf-checkbox">
            <input type="checkbox" checked={form.common.continueOnError} onChange={(e) => update({ ...form, common: { ...form.common, continueOnError: e.target.checked } })} />
            <span>Continue On Error</span>
          </label>
        </div>
      </div>

      {schema.sections.map((section) => (
        <div className="pf-section" key={section.title}>
          <h5 className="pf-section-title">{section.title}</h5>
          <div className="pf-section-fields">
            {section.fields.map((f) => (
              <FieldRow key={f.id} field={f} value={form.fields[f.id]} onChange={(v) => update({ ...form, fields: { ...form.fields, [f.id]: v } })} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
