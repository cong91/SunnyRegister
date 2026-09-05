import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { localizeText } from './text-localizer'

export type Language = 'vi-VN' | 'en-US'

const DEFAULT_LANGUAGE: Language = 'vi-VN'
const LANGUAGE_STORAGE_KEY = 'sunnyregister-language'
const LOCALIZABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const
type LocalizableAttribute = (typeof LOCALIZABLE_ATTRIBUTES)[number]
const textOriginals = new WeakMap<Text, string>()
const attributeOriginals = new WeakMap<Element, Map<LocalizableAttribute, string>>()
const textRenderedValues = new WeakMap<Text, string>()
const attributeRenderedValues = new WeakMap<Element, Map<LocalizableAttribute, string>>()
const translatableTextNodes = new WeakSet<Text>()
const translatableElements = new WeakSet<Element>()

function normalizeLanguage(value: string | null | undefined): Language {
  return value === 'en-US' ? 'en-US' : DEFAULT_LANGUAGE
}

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE
  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY))
}

function interpolate(key: string, params?: Record<string, string | number>) {
  if (!params) return key
  return key.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
}

function shouldSkipText(node: Text) {
  const parent = node.parentElement
  if (!parent) return true
  if (parent.closest('script, style, noscript, textarea, input')) return true
  return parent.closest('[data-i18n-ignore="true"]') !== null
}

function applyTextNode(node: Text, language: Language, originals: WeakMap<Text, string>) {
  if (shouldSkipText(node)) return
  const current = node.nodeValue ?? ''
  const source = originals.get(node)
  const previousRendered = textRenderedValues.get(node)
  if (source === undefined) {
    originals.set(node, current)
    if (/[\u3400-\u9fff]/u.test(current)) translatableTextNodes.add(node)
  } else if (previousRendered !== undefined && current !== previousRendered && current !== source) {
    originals.set(node, current)
    if (/[\u3400-\u9fff]/u.test(current)) translatableTextNodes.add(node)
  }
  if (!translatableTextNodes.has(node)) {
    textRenderedValues.set(node, current)
    return
  }
  const nextSource = originals.get(node) ?? current
  const next = localizeText(nextSource, language)
  textRenderedValues.set(node, next)
  if (current !== next) node.nodeValue = next
}

function applyElementAttributes(element: Element, language: Language, originals: WeakMap<Element, Map<LocalizableAttribute, string>>) {
  if (element.closest('[data-i18n-ignore="true"]')) return
  let elementOriginals = originals.get(element)
  if (!elementOriginals) {
    elementOriginals = new Map()
    originals.set(element, elementOriginals)
  }
  for (const attribute of LOCALIZABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute)
    if (current === null) continue
    const rendered = attributeRenderedValues.get(element)?.get(attribute)
    const previous = elementOriginals.get(attribute)
    if (previous === undefined) {
      elementOriginals.set(attribute, current)
      if (/[\u3400-\u9fff]/u.test(current)) translatableElements.add(element)
    } else if (rendered !== undefined && current !== rendered && current !== previous) {
      elementOriginals.set(attribute, current)
      if (/[\u3400-\u9fff]/u.test(current)) translatableElements.add(element)
    }
    if (!translatableElements.has(element)) continue
    const source = elementOriginals.get(attribute) ?? current
    const next = localizeText(source, language)
    let renderedValues = attributeRenderedValues.get(element)
    if (!renderedValues) {
      renderedValues = new Map()
      attributeRenderedValues.set(element, renderedValues)
    }
    renderedValues.set(attribute, next)
    if (current !== next) element.setAttribute(attribute, next)
  }
}

function applySubtree(node: Node, language: Language, textOriginals: WeakMap<Text, string>, attributeOriginals: WeakMap<Element, Map<LocalizableAttribute, string>>) {
  if (node.nodeType === Node.TEXT_NODE) {
    applyTextNode(node as Text, language, textOriginals)
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  applyElementAttributes(element, language, attributeOriginals)
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let textNode = walker.nextNode()
  while (textNode) {
    applyTextNode(textNode as Text, language, textOriginals)
    textNode = walker.nextNode()
  }
  element.querySelectorAll('*').forEach((child) => applyElementAttributes(child, language, attributeOriginals))
}

function localizeDocument(language: Language) {
  if (typeof document === 'undefined' || !document.body) return () => undefined
  applySubtree(document.body, language, textOriginals, attributeOriginals)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') applyTextNode(record.target as Text, language, textOriginals)
      if (record.type === 'attributes') applyElementAttributes(record.target as Element, language, attributeOriginals)
      if (record.type === 'childList') record.addedNodes.forEach((node) => applySubtree(node, language, textOriginals, attributeOriginals))
    }
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...LOCALIZABLE_ATTRIBUTES],
  })
  return () => observer.disconnect()
}

type I18nContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage())

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(normalizeLanguage(nextLanguage))
  }, [])

  const toggleLanguage = useCallback(() => {
    setLanguageState((current) => (current === 'vi-VN' ? 'en-US' : 'vi-VN'))
  }, [])

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language
    return localizeDocument(language)
  }, [language])

  const translate = useCallback((key: string, params?: Record<string, string | number>) => {
    const source = localizeText(key, language)
    return interpolate(source, params)
  }, [language])

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    toggleLanguage,
    t: translate,
  }), [language, setLanguage, toggleLanguage, translate])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) {
    return {
      language: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: string, params?: Record<string, string | number>) => interpolate(localizeText(key), params),
    } satisfies I18nContextValue
  }
  return value
}
