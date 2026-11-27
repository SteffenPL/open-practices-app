import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ToolEditor } from '../components/ToolEditor'
import { ImportForm } from '../components/ImportForm'
import { LegacyPracticeNotes } from '../components/LegacyPracticeNotes'
import { InstallList } from '../components/MentionSetup'
import { PracticeText } from '../components/PracticeText'
import { listTools, type CatalogTool } from '../lib/catalogService'
import { listPracticeMentions, saveMentionPractice, type PracticeMention } from '../lib/mentionService'
import { getElements } from '../lib/elementService'
import { getPractice, imageUrl, uploadPracticeImage } from '../lib/practiceService'
import { distinctPracticeTools } from '../lib/distinctPracticeTools'
import { activePracticeMention, tokenizePracticeText } from '../lib/practiceText'
import { describeSaveError } from '../lib/saveError'
import type { Element, Practice } from '../lib/types'
import { GUIDED_CLOSING_MARKER } from './guidedPracticeContent'

import './writing-canvas.css'

type Setup = { command: string; notes: string }
type Anchor = { start: number; end: number; query: string }

function catalogTokens(tools: CatalogTool[]) {
  const result = new Map<string, CatalogTool>()
  for (const tool of tools) {
    result.set('#' + tool.slug.toLowerCase(), tool)
    for (const alias of tool.aliases ?? []) result.set('#' + alias.slug.toLowerCase(), tool)
  }
  return result
}

export function MentionPracticeEditor() {
  const { id } = useParams()
  const { session, loading, signInWithGoogle } = useAuth()
  if (loading) return <main className="page" role="status">Loading account…</main>
  if (!session) return <main className="page"><div className="card"><h1>Sign in to write a practice</h1><button onClick={() => void signInWithGoogle()}>Continue with Google</button></div></main>
  return <Composer key={`${session.user.id}:${id ?? 'new'}`} id={id} userId={session.user.id} />
}

function Composer({ id, userId }: { id?: string; userId: string }) {
  const navigate = useNavigate()
  const input = useRef<HTMLTextAreaElement>(null)
  const locked = useRef(false)
  const createRequestId = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [original, setOriginal] = useState<Practice | null>(null)
  const [legacy, setLegacy] = useState<Element[]>([])
  const [tools, setTools] = useState<CatalogTool[]>([])
  const [oldMentions, setOldMentions] = useState<PracticeMention[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [setups, setSetups] = useState<Record<string, Setup>>({})
  const [image, setImage] = useState<string | null>(null)
  const [significant, setSignificant] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [createAnchor, setCreateAnchor] = useState<Anchor | null>(null)
  const [highlight, setHighlight] = useState(-1)
  const [suggestionTop, setSuggestionTop] = useState<number>()

  useEffect(() => {
    let active = true
    async function load() {
      const [catalog, record, existing, elements] = await Promise.all([
        listTools(), id ? getPractice(id) : null,
        id ? listPracticeMentions(id) : [], id ? getElements(id) : [],
      ])
      if (!active) return
      if (id && (!record || record.author_id !== userId)) throw new Error('You can only edit your own practices.')
      setTools(catalog)
      if (record) {
        let content = record.body
        if (!record.mention_format) {
          content = content.replace(GUIDED_CLOSING_MARKER, '').trim()
          const present = new Set(tokenizePracticeText(content).filter(token => token.kind === 'mention').map(token => token.text.toLowerCase()))
          const linked = new Set(elements.flatMap(element => element.options.map(option => option.tool_id)))
          const additions = catalog.filter(tool => linked.has(tool.id) || tool.aliases?.some(alias => linked.has(alias.id)))
            .map(tool => '#' + tool.slug).filter(token => !present.has(token.toLowerCase()))
          if (additions.length) content += '\n\n' + additions.join(' ')
        }
        setOriginal(record)
        setTitle(record.title)
        setBody(content)
        setLegacy(elements)
        setOldMentions(existing)
        setImage(record.image_path)
        setSetups(Object.fromEntries(existing.map(mention => [mention.tool_id, {
          command: mention.install_command ?? '', notes: mention.notes ?? '',
        }])))
      }
      setReady(true)
    }
    void load().catch(cause => { if (active) setError(describeSaveError(cause)) })
    return () => { active = false }
  }, [id, userId])

  const lookup = catalogTokens(tools)
  for (const mention of oldMentions) lookup.set(mention.token.toLowerCase(), mention.tool)
  const mentions: PracticeMention[] = []
  for (const token of tokenizePracticeText(body)) {
    if (token.kind !== 'mention') continue
    const tool = lookup.get(token.text.toLowerCase())
    if (tool) mentions.push({ tool_id: tool.id, token: token.text, tool, position: mentions.length,
      install_command: setups[tool.id]?.command || null, notes: setups[tool.id]?.notes || null })
  }
  const query = anchor?.query.toLowerCase() ?? ''
  const matches = anchor ? tools.filter(tool => [tool.name, tool.slug, tool.apm_id, ...(tool.aliases ?? []).map(alias => alias.slug)]
    .some(value => value?.toLowerCase().includes(query))).slice(0, 8) : []
  const optionsCount = matches.length + (anchor?.query.trim() ? 1 : 0)
  const canSave = ready && !saving && !uploading && !createAnchor

  function showCompletions(value: string, caret: number) {
    const active = activePracticeMention(value, caret)
    setAnchor(active)
    const field = input.current
    if (active && field) {
      const mirror = document.createElement('div')
      const style = getComputedStyle(field)
      Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none',
        boxSizing: 'border-box', width: field.clientWidth + 'px', whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word', font: style.font, lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing, padding: style.padding })
      mirror.textContent = value.slice(0, caret)
      const marker = document.createElement('span')
      marker.textContent = '\u200b'
      mirror.append(marker)
      document.body.append(mirror)
      setSuggestionTop(Math.min(field.clientHeight, Math.max(0, marker.offsetTop + parseFloat(style.lineHeight) - field.scrollTop)))
      mirror.remove()
    }
    setHighlight(-1)
  }
  function insertTool(tool: CatalogTool, at: Anchor) {
    const token = '#' + tool.slug
    const suffix = body.slice(at.end)
    const space = !suffix || /^[\p{L}\p{N}#]/u.test(suffix) ? ' ' : ''
    const value = body.slice(0, at.start) + token + space + suffix
    const caret = at.start + token.length + space.length
    setBody(value); setAnchor(null); setCreateAnchor(null); setHighlight(-1)
    setTools(previous => previous.some(item => item.id === tool.id) ? previous : [...previous, tool])
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(caret, caret); setAnchor(null) })
  }
  function choose(index: number) {
    if (!anchor) return
    if (matches[index]) insertTool(matches[index], anchor)
    else if (anchor.query.trim()) { setCreateAnchor(anchor); setAnchor(null) }
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || !anchor || !optionsCount) return
    if (event.key === 'Escape') { event.preventDefault(); setAnchor(null); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight(current => event.key === 'ArrowDown' ? (current + 1) % optionsCount : (current <= 0 ? optionsCount - 1 : current - 1))
    } else if (event.key === 'Enter' && highlight >= 0) {
      event.preventDefault(); choose(highlight)
    }
  }
  function changeSetup(toolId: string, field: keyof Setup, value: string) {
    setSetups(current => ({ ...current, [toolId]: { ...(current[toolId] ?? { command: '', notes: '' }), [field]: value } }))
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!canSave || locked.current || !title.trim() || !body.trim()) return
    locked.current = true
    setSaving(true); setError('')
    try {
      if (!id) createRequestId.current ??= crypto.randomUUID()
      const practice = await saveMentionPractice({ id, request_id: id ? undefined : createRequestId.current ?? undefined, title, body, image_path: image, source_url: original?.source_url,
        significant, mentions: mentions.map(({ tool_id, token, install_command, notes }) => ({ tool_id, token, install_command, notes })) })
      navigate('/practice/' + practice.id)
    } catch (cause) { setError(describeSaveError(cause)) }
    finally { locked.current = false; setSaving(false) }
  }

  return <main className="page writing-page"><div className="mention-composer writing-canvas">
    <header className="writing-heading"><Link to={id ? '/practice/'+id : '/'} aria-label="Back">←</Link><h1>{id ? 'Edit practice' : 'New practice'}</h1></header>
    {error && <p role="alert" className="error">{error}</p>}
    {!ready && !error && <p role="status">Loading…</p>}
    {ready && <form onSubmit={save}>
      <fieldset disabled={saving || Boolean(createAnchor)}>
        <section className="writing-sheet"><label className="writing-label" htmlFor="practice-title">Title</label>
        <textarea id="practice-title" rows={1} placeholder="Give your practice a title" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); input.current?.focus() } }} required maxLength={500} value={title} onChange={event => setTitle(event.target.value.replace(/[\r\n]+/g, ' '))} />
        <label className="writing-label" htmlFor="practice-body">Key message</label>
        <div className="mention-input-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAnchor(null) }}>
          <textarea id="practice-body" ref={input} rows={3} placeholder="What do you do, and how does it help?" required maxLength={150000} value={body}
            aria-describedby="mention-help" aria-autocomplete="list" aria-controls={anchor ? 'mention-choices' : undefined}
            aria-activedescendant={anchor && highlight >= 0 ? 'mention-choice-'+highlight : undefined}
            onChange={event => {setBody(event.target.value); showCompletions(event.target.value, event.target.selectionStart)}}
            onClick={event => showCompletions(body, event.currentTarget.selectionStart)}
            onKeyUp={event => {if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) showCompletions(body, event.currentTarget.selectionStart)}}
            onKeyDown={keyDown} />
          {anchor && optionsCount > 0 && <div className="mention-menu" id="mention-choices" role="listbox" style={{ top: suggestionTop }} aria-label="Tool suggestions">
            {matches.map((tool, index) => <button key={tool.id} type="button" role="option" id={'mention-choice-'+index}
              aria-selected={index === highlight} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
              <strong>{tool.name}</strong> <span>#{tool.slug}</span>
            </button>)}
            {anchor.query.trim() && <button type="button" role="option" id={'mention-choice-'+matches.length}
              aria-selected={highlight === matches.length} onMouseDown={event => event.preventDefault()} onClick={() => choose(matches.length)}>
              Create tool “{anchor.query}”
            </button>}
          </div>}
        </div>
        <p id="mention-help" className="muted">Mention a tool with <kbd>#</kbd> · Use <code>`code`</code> or “quoted prompts”</p></section>
        {distinctPracticeTools(mentions).map(mention => <details key={mention.tool_id} className="composer-setup">
          <summary><span className="writing-tool-name"><b aria-hidden="true">#</b> {mention.tool.name}</span><small>Optional setup</small></summary>
          <label htmlFor={'command-'+mention.tool_id}>Install command</label>
          <textarea id={'command-'+mention.tool_id} rows={2} maxLength={8000} value={mention.install_command ?? ''} onChange={event => changeSetup(mention.tool_id,'command',event.target.value)} />
          {mention.tool.install_command && mention.install_command !== mention.tool.install_command && <div className="catalog-command-choice">
            <code>{mention.tool.install_command}</code>
            <button type="button" onClick={() => changeSetup(mention.tool_id,'command',mention.tool.install_command!)}>Use catalog command</button>
          </div>}
          <label htmlFor={'notes-'+mention.tool_id}>Setup notes</label>
          <textarea id={'notes-'+mention.tool_id} rows={2} maxLength={12000} value={mention.notes ?? ''} onChange={event => changeSetup(mention.tool_id,'notes',event.target.value)} />
        </details>)}
        {body && <details className="composer-preview"><summary>Preview</summary>
          <h2>{title}</h2><p><PracticeText text={body} mentions={mentions} /></p>
          <InstallList mentions={mentions} title={title} />
        </details>}
        <details className="writing-attachment"><summary>{image ? 'Attached image' : 'Add an image'}</summary>
          {image && <><img className="practice-image" src={imageUrl(image) ?? ''} alt="Practice attachment" /><button type="button" onClick={() => setImage(null)}>Remove image</button></>}
          <input aria-label="Upload an image" type="file" accept="image/*" disabled={uploading} onChange={async event => {
            const file = event.target.files?.[0]
            if (!file) return
            setUploading(true); setError('')
            try { setImage(await uploadPracticeImage(file)) } catch (cause) { setError(describeSaveError(cause)) }
            finally { setUploading(false) }
          }} />
        </details>
        {original?.source_url && <a href={original.source_url} target="_blank" rel="noreferrer">Original source</a>}
        <LegacyPracticeNotes elements={legacy} />
        {id && <label><input type="checkbox" checked={significant} onChange={event => setSignificant(event.target.checked)} /> Show this update in the timeline</label>}
        <div className="composer-actions"><button className="primary" type="submit" disabled={!canSave}>{saving ? 'Saving…' : id ? 'Save changes' : 'Publish practice'}</button><Link to={id ? '/practice/'+id : '/'}>Cancel</Link></div>
      </fieldset>
    </form>}
    {createAnchor && <section aria-label="Create a mentioned tool"><ToolEditor initialName={createAnchor.query} onSaved={tool => insertTool(tool,createAnchor)} onCancel={() => setCreateAnchor(null)} /></section>}
    {ready && !id && !createAnchor && <details className="writing-import"><summary>Import a practice</summary><ImportForm /></details>}
  </div></main>
}
