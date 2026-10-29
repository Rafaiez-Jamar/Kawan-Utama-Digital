import { useEffect, useState } from 'react'

type FormattedNumberInputProps = {
  value: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  className?: string
  placeholder?: string
  'aria-label'?: string
}

const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const formatValue = (value: number) => numberFormat.format(Number.isFinite(value) ? value : 0)

export function FormattedNumberInput({ value, onChange, ...inputProps }: FormattedNumberInputProps) {
  const [text, setText] = useState(() => formatValue(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(formatValue(value))
  }, [focused, value])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const cursor = input.selectionStart ?? input.value.length
    const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, '').length
    const digits = input.value.replace(/\D/g, '')
    if (!digits) {
      setText('')
      onChange?.(0)
      return
    }

    const numericValue = Number(digits)
    const formatted = formatValue(numericValue)
    setText(formatted)
    onChange?.(numericValue)

    let nextCursor = 0
    if (digitsBeforeCursor > 0) {
      let digitCount = 0
      for (let index = 0; index < formatted.length; index += 1) {
        if (/\d/.test(formatted[index])) digitCount += 1
        if (digitCount >= digitsBeforeCursor) {
          nextCursor = index + 1
          break
        }
        nextCursor = index + 1
      }
    }
    window.requestAnimationFrame(() => input.setSelectionRange(nextCursor, nextCursor))
  }

  return <input
    {...inputProps}
    type="text"
    inputMode="numeric"
    value={text}
    onFocus={() => {
      setFocused(true)
      if (value === 0) setText('')
    }}
    onChange={handleChange}
    onBlur={() => {
      setFocused(false)
      setText(formatValue(value))
    }}
  />
}