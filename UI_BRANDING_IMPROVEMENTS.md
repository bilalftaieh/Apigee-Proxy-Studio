# UI Branding Improvements — GCP Apigee Alignment

This document outlines specific improvements to make your UI feel more native to the GCP Apigee ecosystem.

---

## Executive Summary

Your current implementation already follows GCP Apigee branding well. The recommendations below focus on **refinement** rather than overhaul:

1. **Text & Labels** — Improve clarity and consistency in form labels, placeholders, and button copy
2. **Input Fields** — Enhance focus states, validation feedback, and helper text
3. **Modal Dialogs** — Standardize titles, action buttons, and content hierarchy
4. **Microcopy** — Make error messages, hints, and tooltips more helpful and Apigee-native

---

## 1. Text & Label Improvements

### 1.1 Form Labels

**Current Issue:** Some labels are too brief or inconsistent in tone.

**Recommendations:**

| Component | Current | Recommended | Rationale |
|-----------|---------|-------------|-----------|
| NewProxyModal: Proxy Name | "Proxy Name" | "Proxy name" | Sentence case for all labels (GCP standard) |
| NewProxyModal: Base Path | "Base Path" | "Base path" | Consistency |
| NewProxyModal: Description | "Description" | "Description (optional)" | Clarifies optionality |
| ImportProxyModal: curl Command | "curl Command" | "curl command" | Lowercase 'c' per GCP style |
| AddPolicyModal: Policy name | "Policy name" | "Policy name" | ✓ Already correct |
| AddPolicyModal: Resource filename | "Resource filename" | "Resource file name" | Two words per GCP terminology |

**Implementation:**
```tsx
// NewProxyModal.tsx
<label>Proxy name</label>
<input placeholder="my-proxy" />

<label>Base path</label>
<input placeholder="/my-proxy" />

<label>Description (optional)</label>
<textarea placeholder="Describe what this proxy does" />
```

### 1.2 Placeholder Text

**Current Issue:** Some placeholders are too generic or don't guide the user.

**Recommendations:**

| Component | Current | Recommended |
|-----------|---------|-------------|
| NewProxyModal name | "my-new-proxy" | "e.g., payment-service-api" |
| NewProxyModal basePath | "/my-new-proxy" | "e.g., /payments/v1" |
| NewProxyModal description | "What does this proxy do?" | "Briefly describe the proxy's purpose and target backend" |
| ImportProxyModal curl | (multi-line example) | ✓ Keep as-is — good example |
| ImportProxyModal OpenAPI | "Paste an OpenAPI 3.x..." | ✓ Already clear |

**Why:** Placeholders should show *realistic examples*, not just field names. "payment-service-api" tells users the naming convention better than "my-new-proxy".

### 1.3 Button Labels

**Current Issue:** Some button labels could be more specific about their action.

**Recommendations:**

| Component | Current | Recommended | Rationale |
|-----------|---------|-------------|-----------|
| NewProxyModal submit | "Create Proxy" | "Create proxy" | Sentence case |
| ImportProxyModal submit | "Import" | "Import proxy" | Be specific about what's being imported |
| AddPolicyModal submit | "Add policy" | "Add policy" | ✓ Already correct |
| Modal cancel | "Cancel" | "Cancel" | ✓ Standard |
| Modal back | "← Back" | "Back" | Remove arrow — icon already present if needed |

---

## 2. Input Field Improvements

### 2.1 Focus States

**Current:** Blue border + shadow ring (good)

**Enhancement:** Add subtle background change on focus for better visibility:

```css
/* In theme.css or app.css */
.field input:focus,
.field textarea:focus,
.field select:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.16);
  background: #ffffff; /* Ensure white bg on focus even in tinted surfaces */
}
```

### 2.2 Validation Feedback

**Current:** Error messages appear below fields in red.

**Enhancement:** Add inline validation indicators:

```css
/* Add to app.css */
.field.error input {
  border-color: var(--error-ink);
}

.field.error input:focus {
  box-shadow: 0 0 0 3px rgba(197, 34, 31, 0.16);
}

.field.success input {
  border-color: var(--success-ink);
}
```

```tsx
// Example usage in NewProxyModal
<div className={`field ${error ? 'error' : ''}`}>
  <label>Proxy name</label>
  <input ... />
  {error && <div className="field-error">{error}</div>}
</div>
```

### 2.3 Helper Text

**Current:** `.field-hint` exists but is underutilized.

**Recommendations:**

| Field | Add This Hint |
|-------|---------------|
| Proxy name | "Lowercase letters, numbers, and hyphens only. Max 49 characters." |
| Base path | "Must start with /. Used to route requests to this proxy." |
| Policy name | "Unique within this proxy. Auto-generated based on policy type." |
| Resource filename | "Must include extension. Path must start with resources/" |

**Implementation:**
```tsx
<div className="field">
  <label>Proxy name</label>
  <input ... />
  <div className="field-hint">
    Lowercase letters, numbers, and hyphens only. Max 49 characters.
  </div>
</div>
```

---

## 3. Modal Dialog Improvements

### 3.1 Modal Titles

**Current:** Generally good, but some could be more specific.

**Recommendations:**

| Current | Recommended | Why |
|---------|-------------|-----|
| "New Proxy" | "Create new proxy" | Action-oriented |
| "Import a Proxy" | "Import proxy" | More concise |
| "Add Policy" | "Add policy to {flowName}" | Context-aware (if space allows) |
| "New Shared Flow" | "Create new shared flow" | Parallel with proxy naming |

### 3.2 Modal Footer Actions

**Current:** Cancel + Primary button pattern (correct)

**Enhancement:** Consider destructive action placement:

```tsx
// For delete modals
<div className="modal-footer">
  <button className="btn btn-ghost" onClick={onClose}>
    Cancel
  </button>
  <button className="btn btn-danger" onClick={onDelete}>
    Delete
  </button>
</div>
```

**Rule:** Destructive actions should always be rightmost (primary position) but styled as danger, never as ghost.

### 3.3 Modal Content Hierarchy

**Current:** Single column layout

**Enhancement:** Use section headers for complex forms:

```tsx
<Modal title="Import proxy" wide>
  <div className="modal-content">
    <h4>Choose import method</h4>
    <p className="section-hint">
      Select the format of your existing API definition.
    </p>
    
    {/* Import options... */}
    
    <div className="modal-footer">
      {/* Actions */}
    </div>
  </div>
</Modal>
```

---

## 4. Microcopy & Error Messages

### 4.1 Error Message Tone

**Current:** Direct but sometimes terse.

**Recommendations:**

| Current | Recommended | Why |
|---------|-------------|-----|
| "Give your proxy a name." | "Enter a name for your proxy." | More natural phrasing |
| "Paste a curl command first." | "Paste a curl command to continue." | Less imperative |
| "Policy X does not exist" | "The policy "{name}" referenced in {flow} does not exist in this proxy." | More context |

### 4.2 Success Messages

**Add toast notifications for:**

```tsx
// After successful proxy creation
toast.success(`Proxy "${name}" created successfully`);

// After successful import
toast.success(`Proxy imported from ${sourceType}`);

// After policy added
toast.success(`Policy "${policyName}" added to ${flowName}`);
```

### 4.3 Empty States

**Current:** Some empty states exist but could be more helpful.

**Recommendation:** Use the pattern:
```
[Icon]
[Headline: What's missing]
[Body: Why it matters + How to add it]
[CTA Button]
```

Example for empty policies tab:
```tsx
<div className="empty-state">
  <Icon name="file-plus" size={48} />
  <h3>No policies yet</h3>
  <p>
    Policies define how your proxy processes requests. 
    Start by adding authentication, rate limiting, or routing logic.
  </p>
  <button className="btn btn-primary" onClick={() => setShowAddPolicy(true)}>
    Add your first policy
  </button>
</div>
```

---

## 5. Apigee-Specific Terminology

Ensure consistent use of Apigee product terms:

| Instead of | Use |
|------------|-----|
| "API endpoint" | "Proxy endpoint" or "Target endpoint" |
| "Request flow" | "PreFlow" or "Conditional flow" |
| "Error handler" | "FaultRule" |
| "Backend service" | "Target server" |
| "Plugin" | "Policy" |
| "Script file" | "Javascript policy" or "Python policy" |
| "API spec" | "OpenAPI spec" or "WSDL" |

---

## 6. Accessibility Quick Wins

### 6.1 ARIA Labels

Add to icon-only buttons:
```tsx
<button className="icon-btn" aria-label="Delete proxy">
  <Icon name="trash" />
</button>
```

### 6.2 Focus Management

Ensure modals trap focus and return it on close:
```tsx
useEffect(() => {
  const previouslyFocused = document.activeElement;
  const firstInput = modalRef.current?.querySelector('input, button');
  firstInput?.focus();
  
  return () => previouslyFocused?.focus();
}, []);
```

### 6.3 Keyboard Navigation

All interactive elements should be reachable via Tab key. Test:
- Modal dialogs
- Dropdown menus
- Policy galleries
- File trees

---

## 7. Visual Polish

### 7.1 Icon Consistency

Use Lucide icons consistently (you're already doing this ✓):

| Action | Icon |
|--------|------|
| Create/Add | `plus` |
| Delete | `trash-2` |
| Edit | `pencil` |
| View | `eye` |
| Download/Export | `download` |
| Upload/Import | `upload` |
| Settings | `settings` |
| Search | `search` |
| Close | `x` |
| External link | `external-link` |

### 7.2 Loading States

Replace spinners with more descriptive loading:

```tsx
<button disabled={busy} onClick={submit}>
  {busy ? (
    <>
      <span className="spinner" />
      Creating proxy...
    </>
  ) : (
    'Create proxy'
  )}
</button>
```

### 7.3 Confirmation Dialogs

For destructive actions, be specific:

```tsx
// Instead of:
<ConfirmModal 
  title="Delete proxy?" 
  message="Are you sure?"
/>

// Use:
<ConfirmModal 
  title="Delete proxy?" 
  message={`Deleting "${proxyName}" cannot be undone. This will remove all flows, policies, and resources.`}
  confirmLabel="Delete proxy"
/>
```

---

## 8. Priority Implementation Order

### Phase 1: Quick Wins (1-2 hours)
- [ ] Update all form labels to sentence case
- [ ] Improve placeholder examples
- [ ] Add helper text to key fields
- [ ] Standardize button labels

### Phase 2: Enhanced Feedback (2-3 hours)
- [ ] Add inline validation states
- [ ] Improve error messages with context
- [ ] Add success toasts
- [ ] Enhance empty states

### Phase 3: Polish (3-4 hours)
- [ ] Review all modals for title consistency
- [ ] Add ARIA labels to icon buttons
- [ ] Improve loading states
- [ ] Audit terminology for Apigee alignment

---

## 9. Testing Checklist

Before deploying changes:

- [ ] All form labels use sentence case
- [ ] Placeholders show realistic examples
- [ ] Error messages explain what went wrong AND how to fix
- [ ] Button labels clearly state the action
- [ ] Modals have descriptive titles
- [ ] Empty states provide clear next steps
- [ ] Keyboard navigation works throughout
- [ ] Screen reader announces all interactive elements
- [ ] Color contrast meets WCAG AA (4.5:1 for text)

---

## Resources

- [Google Cloud Design System](https://designlanguage.withgoogle.com/)
- [Material Design 3](https://m3.material.io/)
- [Apigee Documentation Style Guide](https://cloud.google.com/apigee/docs/style-guide)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

*Last updated: Based on review of client/src/styles/theme.css, app.css, and component files*
