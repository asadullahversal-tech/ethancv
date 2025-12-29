/**
 * PaymentTabsModal.tsx
 * Tabbed payment modal for Card or Mobile Money with masking and validation.
 * - Localized labels via i18nPaymentPatch (EN/FR/SW/PT/AR).
 * - If paid: primary button downloads the PDF (unless export is blocked).
 * - If not paid: validates inputs, then calls onPay (may redirect or simulate).
 */

import * as Tabs from '@radix-ui/react-tabs'
import React, { useMemo, useState } from 'react'
import Modal from '../Modal'
import type { ResumePlan } from '../../types/resume'
import { useTranslation } from 'react-i18next'
import type { MobileMoneyProvider, PaymentIntentPayload } from '../../types/payments'

/** Props for PaymentTabsModal */
export interface PaymentTabsModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  paid: boolean
  plan: ResumePlan
  price: number
  onPay: (intent: PaymentIntentPayload) => Promise<void>
  onDownload: () => void
  exportBlocked?: boolean
  exportBlockedTitle?: string
  country?: string
  phonePrefill?: string
  paymentStatus?: 'idle' | 'pending' | 'processing' | 'completed' | 'failed'
  paymentError?: string | null
}

/** Luhn checksum validation for card numbers. */
function luhn(num: string): boolean {
  let sum = 0
  let shouldDouble = false
  for (let i = num.length - 1; i >= 0; i--) {
    let digit = Number(num[i])
    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

/** Format helpers (masking). */
function onlyDigits(s: string): string {
  return s.replace(/\D+/g, '')
}
function formatCardNumber(s: string): string {
  const digits = onlyDigits(s).slice(0, 19)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}
function formatExpiry(s: string): string {
  const d = onlyDigits(s).slice(0, 4)
  if (d.length <= 2) return d
  return d.slice(0, 2) + ' / ' + d.slice(2)
}
function parseExpiryToDate(exp: string): { mm: number; yy: number } | null {
  const m = onlyDigits(exp)
  if (m.length < 3) return null
  const mm = Number(m.slice(0, 2))
  const yy = Number(m.slice(2, 4))
  if (mm < 1 || mm > 12) return null
  return { mm, yy }
}
function isExpiryValidFuture(exp: string): boolean {
  const parsed = parseExpiryToDate(exp)
  if (!parsed) return false
  const { mm, yy } = parsed
  const fullYear = 2000 + yy
  const now = new Date()
  const endOfMonth = new Date(fullYear, mm, 0) // last day of month
  // Consider valid through the end of the expiry month
  return endOfMonth >= new Date(now.getFullYear(), now.getMonth(), 1)
}
function formatPhoneIntl(s: string): string {
  // Keep + and digits, then group lightly: +XXX XXX XXX XXX
  let cleaned = s.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('++')) cleaned = '+' + cleaned.slice(2)
  const hasPlus = cleaned.startsWith('+')
  const digits = cleaned.replace(/\D+/g, '')
  let out = hasPlus ? '+' : ''
  // group by blocks of 3 after country code guess (first up to 3 digits)
  const blocks: string[] = []
  let idx = 0
  while (idx < digits.length) {
    const size = idx < 3 ? Math.min(3, digits.length - idx) : Math.min(3, digits.length - idx)
    blocks.push(digits.slice(idx, idx + size))
    idx += size
  }
  out += blocks.join(' ')
  return out.slice(0, 20)
}
function phoneDigitsCount(s: string): number {
  return s.replace(/\D+/g, '').length
}

/** PaymentTabsModal component */
export default function PaymentTabsModal(props: PaymentTabsModalProps) {
  const {
    open,
    onOpenChange,
    paid,
    plan,
    price,
    onPay,
    onDownload,
    exportBlocked,
    exportBlockedTitle,
    country,
    phonePrefill,
    paymentStatus = 'idle',
    paymentError = null
  } = props
  const { t } = useTranslation()

  // Tabs
  const [tab, setTab] = useState<'card' | 'mobile'>('mobile')

  // Card form state
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')

  const [touched, setTouched] = useState({
    name: false,
    number: false,
    expiry: false,
    cvc: false,
    phone: false,
  })

  // Mobile form state
  const [provider, setProvider] = useState<MobileMoneyProvider>('mtn')
  const [phone, setPhone] = useState(phonePrefill || '')

  const [busy, setBusy] = useState(false)

  /** Validation rules */
  const validName = useMemo(() => /^[A-Za-zÀ-ÖØ-öø-ÿ' -]{3,}$/.test(name.trim()), [name])
  const digitsOnly = useMemo(() => number.replace(/\s+/g, ''), [number])
  const validNumber = useMemo(() => {
    const len = digitsOnly.length
    if (len < 13 || len > 19) return false
    if (!/^\d+$/.test(digitsOnly)) return false
    return luhn(digitsOnly)
  }, [digitsOnly])
  const validExpiry = useMemo(() => isExpiryValidFuture(expiry), [expiry])
  const validCvc = useMemo(() => /^\d{3,4}$/.test(cvc), [cvc])
  const cardValid = validName && validNumber && validExpiry && validCvc

  const validPhone = useMemo(() => {
    const count = phoneDigitsCount(phone)
    return count >= 8 && count <= 15
  }, [phone])
  const mobileValid = !!provider && validPhone

  /** Reset on close + prefill phone when opening */
  const handleOpenChange = (next: boolean) => {
    // Prevent closing if payment is pending or processing
    if (!next && (paymentStatus === 'pending' || paymentStatus === 'processing')) {
      return
    }
    onOpenChange(next)
    if (!next) {
      setBusy(false)
      setTab('mobile')
      setName('')
      setNumber('')
      setExpiry('')
      setCvc('')
      setPhone(phonePrefill || '')
      setTouched({ name: false, number: false, expiry: false, cvc: false, phone: false })
    }
  }

  /** Main CTA logic */
  const handlePrimary = async () => {
    if (busy) return
    if (paid) {
      if (!exportBlocked) onDownload()
      return
    }
    // Validate current tab
    if ((tab === 'card' && !cardValid) || (tab === 'mobile' && !mobileValid)) {
      setTouched({
        name: true,
        number: true,
        expiry: true,
        cvc: true,
        phone: true
      })
      return
    }
    setBusy(true)
    try {
      const intent: PaymentIntentPayload =
        tab === 'mobile'
          ? { method: 'mobile', provider, phone }
          : { method: 'card' }
      await onPay(intent)
      // Don't close modal here - it will stay open while payment is pending/processing
      // Modal will close automatically when payment status changes to completed or failed
    } finally {
      setBusy(false)
    }
  }

  const primaryDisabled = busy || (paid && !!exportBlocked) || (!paid && (tab === 'card' ? !cardValid : !mobileValid))
  const primaryLabel = paid ? t('payment.primary.download') : t('payment.primary.pay')

  return (
    <Modal open={open} onOpenChange={handleOpenChange} title={t('payment.modal.title', 'Payment')}>
      {/* Header info */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-neutral-700">
          {t('payment.info.plan', 'Plan')}: <span className="font-medium">{plan}</span> · {t('payment.info.total', 'Total')}: <span className="font-semibold">${price}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-3">
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as 'card' | 'mobile')}>
          <Tabs.List className="inline-flex gap-2 rounded border border-neutral-200 bg-neutral-50 p-1">
            <Tabs.Trigger
              value="card"
              className="rounded px-3 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow data-[state=active]:border data-[state=active]:border-neutral-200"
            >
          {t('payment.tabs.card', 'Card')}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="mobile"
              className="rounded px-3 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow data-[state=active]:border data-[state=active]:border-neutral-200"
            >
              {t('payment.tabs.mobile', 'Mobile money')}
            </Tabs.Trigger>
          </Tabs.List>

          {/* Card form */}
          <Tabs.Content value="card" className="mt-3">
            <form className="grid grid-cols-1 gap-3" onSubmit={(e) => e.preventDefault()}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('payment.card.name')}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched((s) => ({ ...s, name: true }))}
                  placeholder="Jane Doe"
                  className={`w-full rounded border bg-white px-3 py-2 text-sm outline-none ${touched.name && !validName ? 'border-red-500 focus:border-red-600' : 'border-neutral-300 focus:border-neutral-900'}`}
                />
                {touched.name && !validName ? (
                  <span className="mt-1 block text-xs text-red-600">{t('payment.validation.name')}</span>
                ) : null}
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('payment.card.number')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={number}
                  onChange={(e) => setNumber(formatCardNumber(e.target.value))}
                  onBlur={() => setTouched((s) => ({ ...s, number: true }))}
                  placeholder="4242 4242 4242 4242"
                  className={`w-full rounded border bg-white px-3 py-2 text-sm outline-none ${touched.number && !validNumber ? 'border-red-500 focus:border-red-600' : 'border-neutral-300 focus:border-neutral-900'}`}
                />
                {touched.number && !validNumber ? (
                  <span className="mt-1 block text-xs text-red-600">{t('payment.validation.cardNumber')}</span>
                ) : null}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">{t('payment.card.expiry')}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    onBlur={() => setTouched((s) => ({ ...s, expiry: true }))}
                    placeholder="MM / YY"
                    className={`w-full rounded border bg-white px-3 py-2 text-sm outline-none ${touched.expiry && !validExpiry ? 'border-red-500 focus:border-red-600' : 'border-neutral-300 focus:border-neutral-900'}`}
                  />
                  {touched.expiry && !validExpiry ? (
                    <span className="mt-1 block text-xs text-red-600">{t('payment.validation.expiry')}</span>
                  ) : null}
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">{t('payment.card.cvc')}</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={cvc}
                    onChange={(e) => setCvc(onlyDigits(e.target.value).slice(0, 4))}
                    onBlur={() => setTouched((s) => ({ ...s, cvc: true }))}
                    placeholder="CVC"
                    className={`w-full rounded border bg-white px-3 py-2 text-sm outline-none ${touched.cvc && !validCvc ? 'border-red-500 focus:border-red-600' : 'border-neutral-300 focus:border-neutral-900'}`}
                  />
                  {touched.cvc && !validCvc ? (
                    <span className="mt-1 block text-xs text-red-600">{t('payment.validation.cvc')}</span>
                  ) : null}
                </label>
              </div>
            </form>
          </Tabs.Content>

          {/* Mobile money form */}
          <Tabs.Content value="mobile" className="mt-3">
            <form className="grid grid-cols-1 gap-3" onSubmit={(e) => e.preventDefault()}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('payment.mobile.provider')}</span>
                <select
                  className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as any)}
                >
                  <option value="mtn">MTN</option>
                  <option value="airtel">Airtel</option>
                  <option value="orange">Orange</option>
                  <option value="vodacom">Vodacom</option>
                  <option value="telma">Telma (MG)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('payment.mobile.phone')}</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneIntl(e.target.value))}
                  onBlur={() => setTouched((s) => ({ ...s, phone: true }))}
                  placeholder="+243 999 000 000"
                  className={`w-full rounded border bg-white px-3 py-2 text-sm outline-none ${touched.phone && !validPhone ? 'border-red-500 focus:border-red-600' : 'border-neutral-300 focus:border-neutral-900'}`}
                />
                {touched.phone && !validPhone ? (
                  <span className="mt-1 block text-xs text-red-600">{t('payment.validation.phone')}</span>
                ) : null}
              </label>
            </form>
          </Tabs.Content>
        </Tabs.Root>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between">
        {paid ? (
          <div className="text-sm font-medium text-emerald-700">Payment confirmed</div>
        ) : (
          <div className="text-sm text-neutral-700">
            {country
              ? t(
                  'payment.note.mobileMoneyCountry',
                  'Mobile Money for {country} (RDC / Madagascar).',
                  { country }
                )
              : t('payment.note.redirect')}
          </div>
        )}

        <button
          type="button"
          onClick={handlePrimary}
          disabled={primaryDisabled}
          title={paid && exportBlocked ? exportBlockedTitle : undefined}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '…' : primaryLabel}
        </button>
      </div>
    </Modal>
  )
}
