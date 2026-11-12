'use client'

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

type OptionProps = {
  value?: string | number
  disabled?: boolean
  children?: ReactNode
}

type SelectOption = {
  value: string
  label: ReactNode
  disabled: boolean
}

type DropdownSelectProps = {
  value?: string | number
  onChange?: (event: { target: { value: string } }) => void
  disabled?: boolean
  className?: string
  title?: string
  id?: string
  'aria-label'?: string
  children: ReactNode
}

type MenuPosition = {
  left: number
  top: number
  width: number
  maxHeight: number
}

function nextEnabledIndex(options: SelectOption[], from: number, direction: 1 | -1) {
  if (!options.length) return -1
  let index = from
  for (let count = 0; count < options.length; count += 1) {
    index = (index + direction + options.length) % options.length
    if (!options[index]?.disabled) return index
  }
  return -1
}

function triggerClasses(className: string) {
  return className
    .split(/\s+/)
    .filter((token) => {
      if (/^(rounded|border|bg-|px-|py-)/.test(token)) return false
      if (token.startsWith('text-')) {
        return /^(text-(xs|sm|base|lg|[0-9]+xl|\[[^\]]+\]))$/.test(token)
      }
      return Boolean(token)
    })
    .join(' ')
}

export function DropdownSelect({
  value,
  onChange,
  disabled = false,
  className = '',
  title,
  id,
  'aria-label': ariaLabel,
  children,
}: DropdownSelectProps) {
  const generatedId = useId()
  const listboxId = `${generatedId}-options`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const options = useMemo(
    () =>
      Children.toArray(children).flatMap((child) => {
        if (!isValidElement(child) || child.type !== 'option') return []
        const props = child.props as OptionProps
        const label = props.children
        const optionValue = props.value === undefined ? String(label ?? '') : String(props.value)
        return [
          {
            value: optionValue,
            label,
            disabled: Boolean(props.disabled),
          },
        ]
      }),
    [children],
  )
  const selectedValue = String(value ?? '')
  const selectedOption = options.find((option) => option.value === selectedValue)
  const presentationClasses = triggerClasses(className)
  const defaultSizeClass = /(?:^|\s)text-(xs|sm|base|lg|[0-9]+xl|\[[^\]]+\])(?:\s|$)/.test(
    presentationClasses,
  )
    ? ''
    : 'text-sm'

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const margin = 8
    const gap = 4
    const availableBelow = window.innerHeight - rect.bottom - gap - margin
    const availableAbove = rect.top - gap - margin
    const desiredHeight = Math.min(280, options.length * 36 + 8)
    const opensAbove =
      availableBelow < Math.min(desiredHeight, 180) && availableAbove > availableBelow
    const maxHeight = Math.max(72, Math.min(280, opensAbove ? availableAbove : availableBelow))
    const height = Math.min(desiredHeight, maxHeight)
    const width = Math.min(window.innerWidth - margin * 2, Math.max(rect.width, 144))
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
    const top = opensAbove
      ? Math.max(margin, rect.top - gap - height)
      : Math.min(window.innerHeight - height - margin, rect.bottom + gap)

    setPosition({ left, top, width, maxHeight })
  }, [options.length])

  useEffect(() => {
    if (!open) return
    updatePosition()

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (activeIndex < 0) return
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const chooseOption = (option: SelectOption) => {
    if (option.disabled) return
    onChange?.({ target: { value: option.value } })
    setOpen(false)
    triggerRef.current?.focus()
  }

  const openAtSelected = () => {
    const selectedIndex = options.findIndex(
      (option) => option.value === selectedValue && !option.disabled,
    )
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : nextEnabledIndex(options, -1, 1))
    updatePosition()
    setOpen(true)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        openAtSelected()
      } else {
        setActiveIndex((current) => nextEnabledIndex(options, current, 1))
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        const selectedIndex = options.findIndex((option) => option.value === selectedValue)
        const previous = nextEnabledIndex(options, selectedIndex >= 0 ? selectedIndex : 0, -1)
        setActiveIndex(previous)
        updatePosition()
        setOpen(true)
      } else {
        setActiveIndex((current) => nextEnabledIndex(options, current, -1))
      }
      return
    }
    if (event.key === 'Home' && open) {
      event.preventDefault()
      setActiveIndex(options.findIndex((option) => !option.disabled))
      return
    }
    if (event.key === 'End' && open) {
      event.preventDefault()
      setActiveIndex(
        options.reduce((lastEnabled, option, index) => (option.disabled ? lastEnabled : index), -1),
      )
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) chooseOption(option)
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  const defaultLabel = (selectedOption?.label ?? selectedValue) || 'Select…'

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        title={title}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAtSelected())}
        onKeyDown={handleKeyDown}
        className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 ${defaultSizeClass} text-zinc-700 outline-none transition hover:border-zinc-300 focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-50 ${presentationClasses}`}
      >
        <span className="min-w-0 flex-1 truncate text-left">{defaultLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />
      </button>
      {open && position && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              className="fixed z-[10000] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl shadow-zinc-950/15"
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              {options.map((option, index) => {
                const selected = option.value === selectedValue
                const active = index === activeIndex
                return (
                  <div
                    key={`${option.value}-${index}`}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled || undefined}
                    data-option-index={index}
                    onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                    onClick={() => chooseOption(option)}
                    className={`min-h-8 cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-sm leading-5 text-zinc-800 ${
                      option.disabled
                        ? 'cursor-not-allowed opacity-40'
                        : active || selected
                          ? 'bg-zinc-200'
                          : 'hover:bg-zinc-100'
                    }`}
                  >
                    {option.label}
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
