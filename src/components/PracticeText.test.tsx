import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { PracticeText } from './PracticeText'

afterEach(cleanup)
it('links command mentions and exposes the tool name and primary URL on focus', () => {
  const token='#someone/package::review'
  const tool={id:'catalog-id',name:'Review toolkit',urls:['https://example.org/tool','https://example.org/other']}
  render(<MemoryRouter><PracticeText text={`Use ${token} and write \`${token}\`.`} mentions={[{token,tool}]} /></MemoryRouter>)
  const link=screen.getByRole('link',{name:token})
  expect(link.getAttribute('href')).toBe('/tools/catalog-id')
  fireEvent.focus(link)
  expect(screen.getByRole('tooltip').textContent).toBe('Review toolkithttps://example.org/tool')
  fireEvent.keyDown(link,{key:'Escape'})
  expect(screen.queryByRole('tooltip')).toBeNull()
})
