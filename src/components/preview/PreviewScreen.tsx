/** 
 * PreviewScreen.tsx
 * Full-screen overlay preview of the resume with A4 thumbnail + plan selection + primary CTA.
 * - Auto-opens payment modal when entering preview if not paid.
 * - Localized labels and pricing summary.
 * - Fixes missing handler and properly wires PaymentTabsModal.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ThumbnailSheet from './ThumbnailSheet'
import { PricingTier } from '../../components/PricingTier'
import { ResumePreview } from '../../components/resume/ResumePreview'
import type { PaymentState, ResumeData, ResumePlan } from '../../types/resume'
import { downloadPdf } from '../../lib/pdf'
import { enhanceResumeForPreview } from '../../lib/enhance'
import PaymentTabsModal from '../../components/payments/PaymentTabsModal'
import type { PaymentIntentPayload } from '../../types/payments'

/** Filter some sections according to plan (light preview trimming). */
function adjustDataForPlan(data: ResumeData, plan: ResumePlan): ResumeData {
  const next: ResumeData = { ...data }
  if (plan === 'student') {
    next.certifications = (data.certifications || []).slice(0, 0)
    next.experiences = (data.experiences || []).slice(0, 1)
    next.education = (data.education || []).slice(0, 1)
    next.achievements = []
  } else if (plan === 'pro') {
    next.certifications = (data.certifications || [])
    next.experiences = (data.experiences || [])
    next.education = (data.education || [])
    next.achievements = []
  } else {
    next.certifications = (data.certifications || [])
    next.experiences = (data.experiences || [])
    next.education = (data.education || [])
    next.achievements = data.achievements || []
  }
  return next
}

/** Map plan to preview variant. */
function variantForPlan(plan: ResumePlan): 'default' | 'advancedAccent' {
  return plan === 'advanced' ? 'advancedAccent' : 'default'
}

export interface PreviewScreenProps {
  open: boolean
  onClose: () => void
  data: ResumeData
  withPhoto: boolean
  payment: PaymentState
  onChoosePlan: (plan: ResumePlan) => void
  onSimulatePay: (intent: PaymentIntentPayload) => Promise<void>
  exportBlocked: boolean
  exportBlockedTitle?: string
}

/** PreviewScreen component */
export default function PreviewScreen({
  open,
  onClose,
  data,
  withPhoto,
  payment,
  onChoosePlan,
  onSimulatePay,
  exportBlocked,
  exportBlockedTitle
}: PreviewScreenProps) {
  const { t } = useTranslation()
  const [downloading, setDownloading] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [processingPay, setProcessingPay] = useState(false)

  const adjusted = useMemo(() => adjustDataForPlan(data, payment.plan), [data, payment.plan])
  const prepared = useMemo(() => enhanceResumeForPreview(adjusted), [adjusted])
  const variant = useMemo(() => variantForPlan(payment.plan), [payment.plan])

  // Auto-open payment modal when preview opens and not paid
  useEffect(() => {
    if (open && !payment.paid) {
      setPaymentOpen(true)
    }
  }, [open, payment.paid])

  if (!open) return null

  /** Download the on-page resume as a PDF with a consistent document title, then close. */
  const printNow = async () => {
    if (exportBlocked) return
    setDownloading(true)
    try {
      await downloadPdf({
        containerId: 'resume-sheet',
        title: `${data.fullName || 'CV'} - ${data.headline || 'Mako'}`
      })
      onClose()
    } finally {
      setDownloading(false)
    }
  }

  /** Opens the payment modal to collect details or trigger redirect. */
  const handleConfirm = () => {
    setPaymentOpen(true)
  }

  /** Trigger payment using parent flow (redirect or local simulation). */
  const handlePay = async (intent: PaymentIntentPayload) => {
    setProcessingPay(true)
    try {
      await onSimulatePay(intent)
      // Close modal - don't auto-download until payment is verified
      // Payment status will be checked and CV download will be enabled only after verification
      setPaymentOpen(false)
    } catch (err) {
      // Payment failed - don't download CV
      console.error('Payment failed:', err)
    } finally {
      setProcessingPay(false)
    }
  }

  /** Pricing label localized with amount. */
  const totalLabel = t('pricing.total', { amount: `$${payment.price}` })

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            aria-label={t('common.back', 'Back')}
            title={t('common.back', 'Back')}
          >
            ← {t('common.back', 'Back')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-auto px-4 py-4 md:grid-cols-[1fr_360px] md:px-6 md:py-6">
        {/* Left: A4 thumbnail */}
        <div className="max-w-[920px]">
          <ThumbnailSheet>
            <ResumePreview data={prepared} withPhoto={withPhoto} variant={variant} plan={payment.plan} />
          </ThumbnailSheet>
        </div>

        {/* Right: plan + CTA */}
        <aside className="sticky top-4 h-fit rounded-lg border border-neutral-200 bg-neutral-50 p-3 md:p-4">
          <h3 className="text-sm font-semibold text-neutral-900">
            {t('pricing.title')}
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <PricingTier
              value="student"
              label={t('pricing.simple.name', 'Simple')}
              description={t('pricing.student.desc')}
              price={t('pricing.student.price')}
              selected={payment.plan === 'student'}
              onSelect={onChoosePlan}
            />
            <PricingTier
              value="pro"
              label={t('pricing.pro.name')}
              description={t('pricing.pro.desc')}
              price={t('pricing.pro.price')}
              selected={payment.plan === 'pro'}
              onSelect={onChoosePlan}
            />
            <PricingTier
              value="advanced"
              label={t('pricing.advanced.name')}
              description={t('pricing.advanced.desc')}
              price={t('pricing.advanced.price')}
              selected={payment.plan === 'advanced'}
              onSelect={onChoosePlan}
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-neutral-700">
              {payment.paid ? t('payment.ready', 'Your resume is ready.') : totalLabel}
            </div>
            <button
              type="button"
              onClick={payment.paid ? printNow : handleConfirm}
              disabled={exportBlocked || downloading}
              title={exportBlocked ? exportBlockedTitle : undefined}
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading ? '…' : payment.paid ? t('payment.downloadPdf') : t('payment.confirmAndPay')}
            </button>
          </div>
        </aside>
      </div>

      {/* Payment modal */}
      <PaymentTabsModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        paid={payment.paid}
        plan={payment.plan}
        price={payment.price}
        onPay={handlePay}
        onDownload={printNow}
        exportBlocked={exportBlocked}
        exportBlockedTitle={exportBlockedTitle}
        country={data.country}
        phonePrefill={data.phone}
      />
    </div>
  )
}
