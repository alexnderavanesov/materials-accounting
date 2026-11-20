import { fireEvent, screen, within } from '@testing-library/react'

/** Exercise the application's searchable selector through its visible options. */
export function changeField(
  element: HTMLElement,
  event: { target: Record<string, unknown> },
) {
  if (
    element.getAttribute('role') !== 'combobox' ||
    element.tagName !== 'BUTTON'
  ) {
    fireEvent.change(element, event)
    return
  }
  fireEvent.click(element)
  const value = String(event.target.value)
  let option = screen
    .queryAllByRole('option')
    .find((item) => item.getAttribute('value') === value)
  if (!option) {
    fireEvent.change(
      screen.getByRole('combobox', {
        name: `Поиск: ${element.getAttribute('aria-label')}`,
      }),
      { target: { value } },
    )
    option = screen
      .queryAllByRole('option')
      .find((item) => item.getAttribute('value') === value)
  }
  if (!option)
    throw new Error(
      `Нет варианта «${value}» в поле «${element.getAttribute('aria-label')}»`,
    )
  fireEvent.click(option)
}

export function reviewWorkflow(container: HTMLElement = document.body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = within(container).queryByRole('button', { name: 'Далее' })
    if (!next) break
    fireEvent.click(next)
  }
}
