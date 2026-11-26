import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { createPractice, imageUrl, updatePractice, uploadPracticeImage } from '../lib/practiceService'
import { makeGuidedElementDraft, withInstallCommand, apmPackageIdFromCommand, composeGuidedPracticeBody, suggestApmInstallCommand, suggestedToolName } from './guidedPracticeContent'
import { saveElements, type OptionDraft } from '../lib/elementService'
import { provisionTool } from '../lib/toolService'
import { supabase } from '../lib/supabase'
import type { Tool as CatalogTool } from '../lib/types'
import { describeSaveError } from '../lib/saveError'
import './guided-practice-editor.css'

type ImageAttachment = { name: string; url: string; file?: File; path?: string }
type Tool = { name: string; command: string; details: string; image: ImageAttachment | null; toolId: string | null }
type Action = { label: string; value: string }
type Draft = { title: string; opening: string; openingImage: ImageAttachment | null; tools: Tool[]; endingKind: string; ending: string; endingImage: ImageAttachment | null }
type AnswerField = 'practice' | 'opening' | 'tool' | 'command' | 'details' | 'alternative-choice' | 'ending-kind' | 'ending'
type Turn = { id: number; role: 'assistant' | 'user'; text: string; image?: ImageAttachment | null; field?: AnswerField; fieldIndex?: number; actions?: Action[]; summary?: Draft }
type Step = 'practice' | 'key-point' | 'tool' | 'install' | 'tool-details' | 'alternatives' | 'ending-kind' | 'ending' | 'complete'
const makeId = () => Date.now() + Math.random()
const firstTurn: Turn = { id: 1, role: 'assistant', text: 'What practice do you want to tell me about?' }

export function GuidedPracticeEditor() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const authorId = session?.user.id
  const [turns, setTurns] = useState<Turn[]>([firstTurn])
  const [step, setStep] = useState<Step>('practice')
  const [input, setInput] = useState('')
  const [showTools, setShowTools] = useState(false)
  const [title, setTitle] = useState('')
  const [opening, setOpening] = useState('')
  const [openingImage, setOpeningImage] = useState<ImageAttachment | null>(null)
  const [tools, setTools] = useState<Tool[]>([])
  const [activeTool, setActiveTool] = useState(-1)
  const [endingKind, setEndingKind] = useState('')
  const [ending, setEnding] = useState('')
  const [endingImage, setEndingImage] = useState<ImageAttachment | null>(null)
  const [pendingImage, setPendingImage] = useState<ImageAttachment | null>(null)
  const [showPreview, setShowPreview] = useState(true)
  const [focusPane, setFocusPane] = useState<'chat' | 'preview'>('chat')
  const [mobilePane, setMobilePane] = useState<'chat' | 'preview'>('chat')
  const [editingTurnId, setEditingTurnId] = useState<number | null>(null)
  const [catalogTools, setCatalogTools] = useState<CatalogTool[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [publishedPracticeId, setPublishedPracticeId] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { threadRef.current?.scrollTo?.({ top: threadRef.current.scrollHeight, behavior: 'smooth' }) }, [turns])
  useEffect(() => {
    const db = supabase
    if (step !== 'tool' || !showTools || !db) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const query = input.trim().replace(/[%,()_]/g, ' ')
        const load = db.from('tools').select('*').not('apm_id', 'is', null)
        if (!query) {
          const { data, error } = await load.order('created_at', { ascending: false }).limit(8)
          if (!error && !cancelled) setCatalogTools((data ?? []) as CatalogTool[])
          return
        }
        const [byName, byId] = await Promise.all([
          load.ilike('name', `%${query}%`).limit(8),
          db.from('tools').select('*').not('apm_id', 'is', null).ilike('apm_id', `%${query}%`).limit(8),
        ])
        const matches = [...(byName.data ?? []), ...(byId.data ?? [])] as CatalogTool[]
        if (!cancelled && !byName.error && !byId.error) {
          setCatalogTools([...new Map(matches.map((tool) => [tool.id, tool])).values()].slice(0, 8))
        }
      } catch {
        if (!cancelled) setCatalogTools([])
      }
    }, 120)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [input, showTools, step])
  const assistant = (text: string, actions?: Action[], summary?: Draft): Turn => ({ id: makeId(), role: 'assistant', text, actions, summary })
  const user = (text: string, field?: AnswerField, fieldIndex?: number, image?: ImageAttachment | null): Turn => ({ id: makeId(), role: 'user', text, field, fieldIndex, image })
  const append = (...next: Turn[]) => setTurns((current) => [...current, ...next])
  const promptTool = (alternative: boolean) => {
    setStep('tool')
    append(assistant(alternative ? 'Which alternative tool would you recommend?' : 'Which tools are suitable here? Name the first one.'))
    setInput(''); setShowTools(false)
  }
  const chooseTool = (name: string, command: string, toolId: string | null = null, details = '') => {
    const index = tools.length
    setTools((current) => [...current, { name, command, details, image: null, toolId }])
    setActiveTool(index)
    setInput(''); setPendingImage(null); setShowTools(false); setStep('install')
    append(user(name, 'tool', index), assistant(`How do you install ${name}?`, [{ label: `Use ${command}`, value: command }]))
  }
  const submitCommand = (command: string) => {
    const tool = tools[activeTool]
    if (!tool) return
    setTools((current) => current.map((item, index) => index === activeTool ? { ...item, command } : item))
    setStep('tool-details')
    append(user(command, 'command', activeTool), assistant(`Why is ${tool.name} useful, and how do you start using it?`))
    setInput('')
  }
  const finish = (finalText: string, attachment: ImageAttachment | null) => {
    const result = { title, opening, openingImage, tools, endingKind, ending: finalText, endingImage: attachment }
    setEndingImage(attachment ?? null)
    setEnding(finalText)
    setStep('complete')
    append(user(finalText, 'ending', undefined, attachment), assistant('Here’s the practice we shaped together.', undefined, result))
    setInput(''); setPendingImage(null)
  }
  const saveEditedResponse = (turnId: number, value: string, image: ImageAttachment | null) => {
    const index = turns.findIndex((turn) => turn.id === turnId)
    const target = turns[index]
    if (!target?.field) return
    const field = target.field
    if (field === 'alternative-choice') {
      const addAlternative = /add|yes|alternative/i.test(value)
      const nextAction = { ...target, text: addAlternative ? 'Add an alternative' : 'No, continue' }
      setTurns([...turns.slice(0, index), nextAction, assistant(addAlternative ? 'Which alternative tool would you recommend?' : 'Any next steps or closing remarks?', addAlternative ? undefined : [{ label: 'Next steps', value: 'Next steps' }, { label: 'Closing remarks', value: 'Closing remarks' }])])
      setTools((current) => current.slice(0, target.fieldIndex ?? current.length))
      setEndingKind(''); setEnding(''); setEndingImage(null)
      setStep(addAlternative ? 'tool' : 'ending-kind')
      setInput(''); setEditingTurnId(null); setShowTools(false)
      return
    }
    if (field === 'ending-kind') {
      const nextKind = value.trim() || 'Closing remarks'
      setEndingKind(nextKind); setEnding(''); setEndingImage(null)
      setTurns([...turns.slice(0, index), { ...target, text: nextKind }, assistant(nextKind.toLowerCase().includes('next') ? 'What should readers try next?' : 'What closing thought would you like to leave readers with?')])
      setStep('ending'); setInput(''); setEditingTurnId(null)
      return
    }
    if (field === 'practice') setTitle(value)
    if (field === 'opening') { setOpening(value); setOpeningImage(image) }
    if (field === 'tool') setTools((current) => current.map((tool, i) => i === target.fieldIndex ? { ...tool, name: value } : tool))
    if (field === 'command') setTools((current) => current.map((tool, i) => i === target.fieldIndex ? { ...tool, command: value } : tool))
    if (field === 'details') setTools((current) => current.map((tool, i) => i === target.fieldIndex ? { ...tool, details: value, image } : tool))
    if (field === 'ending') { setEnding(value); setEndingImage(image) }
    setTurns((current) => current.map((turn) => {
      if (turn.id === turnId) return { ...turn, text: value, image }
      if (field === 'tool' && turn.role === 'assistant' && turn.text.startsWith('How do you install ')) return { ...turn, text: `How do you install ${value}?` }
      if (!turn.summary) return turn
      const summary = { ...turn.summary }
      if (field === 'practice') summary.title = value
      if (field === 'opening') { summary.opening = value; summary.openingImage = image }
      if (field === 'tool') summary.tools = summary.tools.map((tool, i) => i === target.fieldIndex ? { ...tool, name: value } : tool)
      if (field === 'command') summary.tools = summary.tools.map((tool, i) => i === target.fieldIndex ? { ...tool, command: value } : tool)
      if (field === 'details') summary.tools = summary.tools.map((tool, i) => i === target.fieldIndex ? { ...tool, details: value, image } : tool)
      if (field === 'ending') { summary.ending = value; summary.endingImage = image }
      return { ...turn, summary }
    }))
    setInput(''); setPendingImage(null); setEditingTurnId(null); setShowTools(false)
  }
  const deleteResponse = (turnId: number) => {
    const index = turns.findIndex((turn) => turn.id === turnId)
    const target = turns[index]
    if (!target?.field) return
    setTurns(turns.slice(0, index))
    setInput(''); setPendingImage(null); setEditingTurnId(null); setShowTools(false)
    if (target.field === 'practice') {
      setTitle(''); setOpening(''); setOpeningImage(null); setTools([]); setEndingKind(''); setEnding(''); setEndingImage(null); setStep('practice')
    } else if (target.field === 'opening') {
      setOpening(''); setOpeningImage(null); setTools([]); setEndingKind(''); setEnding(''); setEndingImage(null); setStep('key-point')
    } else if (target.field === 'tool') {
      setTools((current) => current.slice(0, target.fieldIndex ?? 0)); setEndingKind(''); setEnding(''); setEndingImage(null); setStep('tool')
    } else if (target.field === 'command') {
      setTools((current) => current.map((tool, i) => i === target.fieldIndex ? { ...tool, details: '', image: null } : tool)); setEndingKind(''); setEnding(''); setEndingImage(null); setStep('install')
    }
    else if (target.field === 'details') {
      setTools((current) => current.map((tool, i) => i === target.fieldIndex ? { ...tool, details: '', image: null } : tool)); setEndingKind(''); setEnding(''); setEndingImage(null); setStep('tool-details')
    } else if (target.field === 'alternative-choice') {
      setTools((current) => current.slice(0, target.fieldIndex ?? current.length)); setEndingKind(''); setEnding(''); setEndingImage(null); setStep('alternatives')
    } else if (target.field === 'ending-kind') {
      setEndingKind(''); setEnding(''); setEndingImage(null); setStep('ending-kind')
    } else if (target.field === 'ending') {
      setEnding(''); setEndingImage(null); setStep('ending')
    }
  }
  const handleAction = (action: Action) => {
    if (step === 'install') { submitCommand(action.value); return }
    if (step === 'alternatives' && action.value === 'yes') { append(user(action.label, 'alternative-choice', tools.length)); promptTool(true); return }
    if (step === 'alternatives' && action.value === 'no') {
      append(user(action.label, 'alternative-choice', tools.length), assistant('Any next steps or closing remarks?', [
        { label: 'Next steps', value: 'Next steps' }, { label: 'Closing remarks', value: 'Closing remarks' },
      ])); setStep('ending-kind'); return
    }
    if (step === 'ending-kind') {
      setEndingKind(action.value); setStep('ending')
      append(user(action.value, 'ending-kind'), assistant(action.value === 'Next steps' ? 'What should readers try next?' : 'What closing thought would you like to leave readers with?'))
    }
  }
  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    setSaveError(null)
    const value = input.trim()
    if ((!value && !pendingImage) || (step === 'complete' && editingTurnId === null)) return
    if (editingTurnId !== null) { saveEditedResponse(editingTurnId, value, pendingImage); return }
    if (step === 'tool') {
      const known = catalogTools.find((tool) =>
        tool.name.toLowerCase() === value.toLowerCase() || tool.apm_id?.toLowerCase() === value.toLowerCase(),
      )
      if (known?.apm_id) {
        chooseTool(known.name, `apm install ${known.apm_id}`, known.id, known.description ?? '')
      } else {
        chooseTool(suggestedToolName(value), suggestApmInstallCommand(value))
      }
      return
    }
    if (step === 'practice') {
      setTitle(value); setStep('key-point'); setInput(''); append(user(value, 'practice'), assistant('What is the key point or advantage?'))
    } else if (step === 'key-point') {
      setOpening(value); setOpeningImage(pendingImage); setStep('tool'); setInput(''); setShowTools(false)
      append(user(value, 'opening', undefined, pendingImage), assistant('Which tools are suitable here? Name the first one.'))
    } else if (step === 'install') submitCommand(value)
    else if (step === 'tool-details') {
      setTools((current) => current.map((tool, index) => index === activeTool ? { ...tool, details: value, image: pendingImage } : tool))
      setStep('alternatives'); setInput('')
      append(user(value, 'details', activeTool, pendingImage), assistant('Any alternative tools?', [
        { label: 'Add an alternative', value: 'yes' }, { label: 'No, continue', value: 'no' },
      ]))
    } else if (step === 'ending') finish(value, pendingImage)
    if (step !== 'complete') setPendingImage(null)
    if (composerRef.current) composerRef.current.style.height = 'auto'
  }
  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
  }
  const filteredTools = catalogTools.filter((tool) => tool.apm_id)
  const showCreateTool = Boolean(input.trim()) && !filteredTools.some((tool) =>
    tool.name.toLowerCase() === input.trim().toLowerCase() || tool.apm_id?.toLowerCase() === input.trim().toLowerCase(),
  )
  const actionOnly = (step === 'alternatives' || step === 'ending-kind' || step === 'complete') && editingTurnId === null
  const editingField = turns.find((turn) => turn.id === editingTurnId)?.field
  const canAttachImage = editingTurnId !== null
    ? editingField === 'opening' || editingField === 'details' || editingField === 'ending'
    : step === 'key-point' || step === 'tool-details' || step === 'ending'
  const hints: Record<Step, string> = {
    practice: 'e.g. A reliable way to review pull requests',
    'key-point': 'e.g. It catches issues before they reach production',
    tool: 'e.g. Playwright or another skill/tool',
    install: 'e.g. apm install microsoft/playwright or npm install package-name',
    'tool-details': 'e.g. Why it helps and how to get started',
    alternatives: 'Choose an option above',
    'ending-kind': 'Choose next steps or closing remarks',
    ending: 'e.g. Try this on your next small change',
    complete: 'Your draft is ready',
  }
  const placeholder = editingTurnId ? 'Edit your response…' : hints[step]
  const beginEdit = (turnId: number) => {
    const turn = turns.find((item) => item.id === turnId)
    if (!turn) return
    setEditingTurnId(turnId); setInput(turn.text); setPendingImage(turn.image ?? null); setShowTools(false)
    setMobilePane('chat')
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const persistImage = async (image: ImageAttachment | null): Promise<ImageAttachment | null> => {
    if (!image || image.path || !image.file) return image
    const path = await uploadPracticeImage(image.file)
    return { name: image.name, path, url: imageUrl(path) ?? image.url }
  }

  const publish = async () => {
    if (!authorId || saving) return
    if (!title.trim() || tools.length === 0) {
      setSaveError('Add a title and at least one tool before publishing.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const [savedOpeningImage, savedEndingImage, ...savedToolImages] = await Promise.all([
        persistImage(openingImage),
        persistImage(endingImage),
        ...tools.map((tool) => persistImage(tool.image)),
      ])
      setOpeningImage(savedOpeningImage)
      setEndingImage(savedEndingImage)
      setTools((current) => current.map((tool, index) => ({ ...tool, image: savedToolImages[index] ?? null })))
      const options: OptionDraft[] = await Promise.all(tools.map(async (tool, index) => {
        const savedImage = savedToolImages[index]
        const packageId = apmPackageIdFromCommand(tool.command)
        const linkedTool = packageId ? await provisionTool(packageId) : null
        const imageMarkdown = savedImage
          ? `![${savedImage.name.replaceAll('[', '').replaceAll(']', '')}](${savedImage.url})`
          : ''
        const description = withInstallCommand(
          [tool.details.trim(), imageMarkdown].filter(Boolean).join('\n\n'),
          tool.command,
        )
        return {
          id: crypto.randomUUID(),
          name: tool.name.trim(),
          description,
          tool_id: linkedTool?.id ?? null,
        }
      }))
      const practiceInput = {
        title: title.trim(),
        body: composeGuidedPracticeBody(
          opening,
          endingKind,
          ending,
          savedEndingImage ? `![${savedEndingImage.name.replaceAll('[', '').replaceAll(']', '')}](${savedEndingImage.url})` : '',
        ),
        image_path: savedOpeningImage?.path ?? null,
      }
      const savedPractice = publishedPracticeId
        ? await updatePractice(publishedPracticeId, practiceInput, false)
        : await createPractice(authorId, practiceInput)
      if (!publishedPracticeId) setPublishedPracticeId(savedPractice.id)
      await saveElements(savedPractice.id, [makeGuidedElementDraft(options)])
      navigate(`/practice/${savedPractice.id}`)
    } catch (error) {
      console.error('Publishing guided practice failed:', error)
      setSaveError(describeSaveError(error))
    } finally {
      setSaving(false)
    }
  }

  const editField = (field: AnswerField, fieldIndex?: number) => {
    const turn = [...turns].reverse().find((item) => item.role === 'user' && item.field === field && item.fieldIndex === fieldIndex)
    if (turn) beginEdit(turn.id)
  }

  if (loading) return <main className="page"><p className="muted">Loading editor…</p></main>
  if (!authorId) return <main className="page"><div className="card"><h1>Sign in to publish</h1><p className="muted">You need an account to write a practice.</p></div></main>

  return <main className="page chat-page">
    <div className="chat-page-heading"><div><span className="chat-eyebrow">CREATE A PRACTICE</span><h1>Tell the story of what works</h1><p>Answer a few prompts. Your responses become a practice you can share.</p></div><Link to="/" className="chat-exit">Back to practices</Link></div>
    <div className="chat-preview-controls">
      <button className={showPreview ? 'is-active' : ''} onClick={() => { setShowPreview((visible) => !visible); if (!showPreview) setFocusPane('chat') }}>{showPreview ? 'Hide live preview' : 'Show live preview'}</button>
      {showPreview && <div className="chat-desktop-focus" role="group" aria-label="Choose writing focus"><button className={focusPane === 'chat' ? 'is-active' : ''} onClick={() => setFocusPane('chat')}>Focus chat</button><button className={focusPane === 'preview' ? 'is-active' : ''} onClick={() => setFocusPane('preview')}>Focus preview</button></div>}
      {showPreview && <div className="chat-mobile-panes" role="tablist" aria-label="Choose pane"><button role="tab" aria-selected={mobilePane === 'chat'} className={mobilePane === 'chat' ? 'is-active' : ''} onClick={() => setMobilePane('chat')}>Chat</button><button role="tab" aria-selected={mobilePane === 'preview'} className={mobilePane === 'preview' ? 'is-active' : ''} onClick={() => setMobilePane('preview')}>Preview</button></div>}
    </div>
    <div className={`chat-workspace ${showPreview ? 'preview-on' : 'preview-off'} focus-${focusPane} mobile-${mobilePane}`}>
      <section className="chat-app" aria-label="Create a practice by chat">
        <header className="chat-panel-heading"><div><strong>Practice writing</strong><span>A guided conversation</span></div><span className="chat-panel-status">{step === 'complete' ? 'Ready to publish' : 'Draft'}</span></header>
        {saveError && <p className="chat-save-error" role="alert">{saveError}</p>}
        <div className="chat-thread" ref={threadRef}>
          {turns.map((turn) => <Message key={turn.id} turn={turn} onAction={handleAction} onEdit={beginEdit} onDelete={deleteResponse} />)}
        </div>
        {step === 'tool' && showTools && editingTurnId === null && <div className="chat-autocomplete"><div className="chat-autocomplete-title">Suggested skills and tools</div>{filteredTools.map((tool) => <button key={tool.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseTool(tool.name, `apm install ${tool.apm_id}`, tool.id, tool.description ?? '')}><span className="chat-tool-icon">✳</span><span><strong>{tool.name}</strong><small>apm install {tool.apm_id}</small></span></button>)}{showCreateTool && <button onMouseDown={(event) => event.preventDefault()} onClick={() => chooseTool(suggestedToolName(input), suggestApmInstallCommand(input))}><span className="chat-tool-icon">＋</span><span><strong>Add “{input.trim()}”</strong><small>Suggested: {suggestApmInstallCommand(input)}</small></span></button>}</div>}
        <form className="chat-composer" onSubmit={submit}>
          {pendingImage && <div className="chat-pending-image"><img src={pendingImage.url} alt="" /><span>{pendingImage.name}</span><button type="button" aria-label="Remove attached image" onClick={() => setPendingImage(null)}>×</button></div>}
          <div className="chat-composer-row">
            {canAttachImage && <><button type="button" className="chat-attach" aria-label="Attach an image" onClick={() => imageInputRef.current?.click()}>＋</button><input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) setPendingImage({ name: file.name, file, url: URL.createObjectURL(file) }); event.currentTarget.value = '' }} /></>}
            <textarea ref={composerRef} rows={1} value={input} disabled={actionOnly} placeholder={placeholder} onFocus={() => { if (step === 'tool' && editingTurnId === null) setShowTools(true) }} onChange={(event) => { setInput(event.target.value); if (step === 'tool' && editingTurnId === null) setShowTools(true); const target = event.currentTarget; target.style.height = 'auto'; target.style.height = `${Math.min(target.scrollHeight, 120)}px` }} onKeyDown={onComposerKey} />
            {editingTurnId !== null && <button type="button" className="chat-cancel-edit" onClick={() => { setEditingTurnId(null); setInput(''); setPendingImage(null) }}>Cancel</button>}
            {step === 'complete' && editingTurnId === null && <button type="button" className="chat-publish" onClick={() => void publish()} disabled={saving}>{saving ? 'Publishing…' : 'Publish practice'}</button>}
          <button type="submit" className="chat-send" aria-label={editingTurnId !== null ? 'Save response' : 'Send response'} disabled={(!input.trim() && !pendingImage) || actionOnly}>{editingTurnId !== null ? 'Save' : 'Send'} <span>↗</span></button>
          </div>
        </form>
      </section>
      {showPreview && <DraftPreview title={title} opening={opening} openingImage={openingImage} tools={tools} endingKind={endingKind} ending={ending} endingImage={endingImage} onEdit={editField} />}
    </div>
  </main>
}

function Message({ turn, onAction, onEdit, onDelete }: { turn: Turn; onAction: (action: Action) => void; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
  const mine = turn.role === 'user'
  return <div className={`chat-row ${mine ? 'from-user' : 'from-assistant'}`}>
    {!mine && <div className="chat-small-avatar">OP</div>}
    <div className={`chat-bubble ${mine ? 'chat-mine' : 'chat-theirs'}`}>
      {turn.summary ? <DraftSummary draft={turn.summary} /> : <LinkifiedText text={turn.text} />}
      {turn.actions && <div className="chat-actions">{turn.actions.map((action) => <button key={action.value} onClick={() => onAction(action)}>{action.label}</button>)}</div>}
      {mine && turn.image && <img className="chat-message-image" src={turn.image.url} alt={turn.image.name} />}
    </div>
    {mine && turn.field && <div className="chat-message-controls"><button onClick={() => onEdit(turn.id)}>Edit</button><button onClick={() => onDelete(turn.id)}>Delete</button></div>}
  </div>
}

function DraftPreview({ title, opening, openingImage, tools, endingKind, ending, endingImage, onEdit }: { title: string; opening: string; openingImage: ImageAttachment | null; tools: Tool[]; endingKind: string; ending: string; endingImage: ImageAttachment | null; onEdit: (field: AnswerField, index?: number) => void }) {
  return <aside className="chat-preview"><div className="chat-preview-head"><span className="chat-eyebrow">LIVE PREVIEW</span><span>Updates as you write</span></div><article>
    <div className="chat-preview-field"><div className="chat-preview-field-title"><span className="chat-preview-label">PRACTICE</span><button type="button" onClick={() => onEdit('practice')}>Edit</button></div><h2>{title || 'Your practice title'}</h2></div>
    <div className="chat-preview-field"><div className="chat-preview-field-title"><span className="chat-preview-label">KEY POINT</span><button type="button" onClick={() => onEdit('opening')}>Edit</button></div><LinkifiedText text={opening || 'Your key point will appear here.'} /><Attachment image={openingImage} /></div>
    <section className="chat-preview-options"><div className="chat-preview-field-title"><h3>Options</h3>{tools.length === 0 && <button type="button" onClick={() => onEdit('tool')}>Add</button>}</div><OptionsTabs tools={tools} empty="Your suggested tools will appear here as tabs." onEdit={(index) => onEdit('details', index)} /></section>
    {ending && <footer className="chat-preview-field"><div className="chat-preview-field-title"><span className="chat-preview-label">{endingKind || 'CLOSING'}</span><button type="button" onClick={() => onEdit('ending')}>Edit</button></div><LinkifiedText text={ending} /><Attachment image={endingImage} /></footer>}
  </article></aside>
}

function DraftSummary({ draft }: { draft: Draft }) {
  return <div className="chat-draft-summary"><span className="chat-summary-kicker">PRACTICE DRAFT</span><h2>{draft.title}</h2><LinkifiedText text={draft.opening} /><Attachment image={draft.openingImage} /><div className="chat-summary-options"><strong>Options</strong><OptionsTabs tools={draft.tools} empty="No options added." /></div><div className="chat-summary-ending"><strong>{draft.endingKind}:</strong><LinkifiedText text={draft.ending} /></div><Attachment image={draft.endingImage} /></div>
}

function OptionsTabs({ tools, empty, onEdit }: { tools: Tool[]; empty: string; onEdit?: (index: number) => void }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = tools[activeIndex] ?? tools[0]
  if (!tools.length) return <p className="chat-empty-preview">{empty}</p>
  return <div className="chat-option-tabs">
    <div className="chat-option-tab-list" role="tablist" aria-label="Practice options">{tools.map((tool, index) => <button key={`${tool.name}-${index}`} role="tab" aria-selected={active === tool} className={active === tool ? 'is-active' : ''} onClick={() => setActiveIndex(index)}>{tool.name}</button>)}</div>
    {active && <div className="chat-option-tab-panel" role="tabpanel"><div className="chat-option-install"><code>{active.command || 'Add an install command'}</code>{onEdit && <button type="button" onClick={() => onEdit(activeIndex)}>Edit</button>}</div><LinkifiedText text={active.details || 'Guidance for this option will appear here.'} /><Attachment image={active.image} /></div>}
  </div>
}

function Attachment({ image }: { image: ImageAttachment | null }) {
  return image ? <img className="chat-content-image" src={image.url} alt={image.name} /> : null
}

function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return <p className="chat-rich-text">{parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return <span key={index}>{part}</span>
    const trailing = part.match(/[),.!?;:]+$/)?.[0] ?? ''
    const href = trailing ? part.slice(0, -trailing.length) : part
    try {
      const url = new URL(href)
      if (!['http:', 'https:'].includes(url.protocol)) return <span key={index}>{part}</span>
    } catch { return <span key={index}>{part}</span> }
    return <span key={index}><a href={href} target="_blank" rel="noreferrer">{href}</a>{trailing}</span>
  })}</p>
}
