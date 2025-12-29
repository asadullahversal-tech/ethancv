/**
 * Page d'accueil "Mako" avec flux en 3 étapes et gating de paiement pour le téléchargement PDF.
 * - Un seul CTA principal "Télécharger le PDF" centré, qui redirige vers la plateforme de paiement (ou simule si non configurée).
 * - Après succès (callback via hash), le bouton permet le téléchargement immédiat.
 * - UI responsive et accessible, alignée avec la charte (olive).
 */

import '../lib/i18n'
import '../lib/i18nAddressPatch'
import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { StepIndicator } from '../components/steps/StepIndicator'
import { ResumeForm } from '../components/resume/ResumeForm'
import MarlonTemplatePreview from '../components/templates/MarlonTemplatePreview'
import PreviewAndDownload from '../components/preview/PreviewAndDownload'
import { PricingTier } from '../components/PricingTier'

import PlanComparison from '../components/pricing/PlanComparison'
import type { PaymentState, ResumeData, ResumePlan } from '../types/resume'
import { downloadPdf } from '../lib/pdf'
import { enhanceResumeForPreview, generatePersonalizedSummary } from '../lib/enhance'
import Modal from '../components/Modal'
import PrimaryButton from '../components/controls/PrimaryButton'
import PlanDropdown from '../components/pricing/PlanDropdown'
import DownloadCta from '../components/payments/DownloadCta'
import type { MobileMoneyProvider, PaymentIntentPayload } from '../types/payments'

import WhatsAppShareModal from '../components/sharing/WhatsAppShareModal'
import PreviewScreen from '../components/preview/PreviewScreen'
import PrintSheet from '../components/PrintSheet'
import SaveInfoCard from '../components/account/SaveInfoCard'
import { loadProfile, loadDraftResume, saveDraftResume } from '../lib/storage'
import { useAuthStore } from '../stores/auth'
import { useNavigate } from 'react-router'
import { listUserCvs, saveUserCv, type UserCvRecord } from '../lib/cvApi'
import { API_BASE } from '../config/api'

/** Valeurs initiales du formulaire */
const initialResume: ResumeData = {
  fullName: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  country: '',
  summary: '',
  skills: '',
  photoUrl: '',
  domain: 'general',
  language: 'en',
  experiences: [],
  education: [],
  certifications: [],
  achievements: [],
  cvType: 'simple'
}

/** Retourne le prix d'un plan */
function priceOf(plan: ResumePlan) {
  switch (plan) {
    case 'student':
      return 1
    case 'pro':
      return 2
    case 'advanced':
      return 3
  }
}

function defaultMobileProvider(country?: string): MobileMoneyProvider {
  const c = (country || '').toLowerCase()
  if (c.includes('madagascar') || c.includes('mg')) return 'telma'
  if (c.includes('congo') || c.includes('rdc')) return 'vodacom'
  return 'airtel'
}

/**
 * Utils de validation pour périodes YYYY-MM.
 */
function isYearMonth(v?: string): boolean {
  const s = (v || '').trim()
  if (!/^\d{4}-\d{2}$/.test(s)) return false
  const [, mm] = s.split('-')
  const m = Number(mm)
  return m >= 1 && m <= 12
}
function parseYearMonthToKey(v?: string): number | null {
  if (!isYearMonth(v)) return null
  const [yy, mm] = (v as string).split('-')
  return Number(yy) * 100 + Number(mm)
}
function isPresentValue(v?: string) {
  return (v || '').trim().toLowerCase() === 'present'
}
function isDateOrderInvalid(start?: string, end?: string): boolean {
  if (isPresentValue(end)) return false
  const startKey = parseYearMonthToKey(start)
  const endKey = parseYearMonthToKey(end)
  if (startKey == null || endKey == null) return false
  return endKey < startKey
}

/** Page Home avec flux en 3 étapes et paiement avant téléchargement */
export default function Home() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, initialized: authReady, hydrate } = useAuthStore()
  const token = useAuthStore((s) => s.token)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [withPhoto, setWithPhoto] = useState(false)
  const [data, setData] = useState<ResumeData>(initialResume)
  const [payment, setPayment] = useState<PaymentState>({
    plan: 'student',
    price: 1,
    paid: false,
    sendingEmail: false
  })
  const [customerEmail, setCustomerEmail] = useState('')
  const [aiPreview, setAiPreview] = useState(true)

  // Country selection (removed button and modal)
  const [showLoadedBanner, setShowLoadedBanner] = useState(false)

  // Share modal after save
  const [shareOpen, setShareOpen] = useState(false)
  // Full-screen preview open state (Download flow)
  const [previewOpen, setPreviewOpen] = useState(false)

  /** Nouveaux états liés au paiement externe */
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [paymentRef, setPaymentRef] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)
  const [cvs, setCvs] = useState<UserCvRecord[]>([])
  const [cvsLoading, setCvsLoading] = useState(false)
  const [cvError, setCvError] = useState<string | null>(null)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  /** Redirect to auth if not logged in once auth is ready */
  useEffect(() => {
    if (authReady && !user) {
      navigate('/auth')
    }
  }, [authReady, user, navigate])

  /** Check payment status from URL (after PawaPay redirect) */
  useEffect(() => {
    const checkPaymentFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const depositId = urlParams.get('depositId')
      const paymentSuccess = urlParams.get('payment') === 'success'
      
      if (depositId && paymentSuccess && token) {
        try {
          const response = await fetch(`${API_BASE}/api/payments/status/${depositId}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          
          if (response.ok) {
            const statusData = await response.json()
            if (statusData.status === 'completed') {
              setPayment((p) => ({
                ...p,
                paid: true,
                reference: depositId,
                paidAt: Date.now()
              }))
              setPaymentRef(depositId)
              setPayError(null)
              // Clean URL
              window.history.replaceState({}, '', window.location.pathname)
            }
          }
        } catch (err) {
          console.error('Failed to check payment status:', err)
        }
      }
    }
    
    if (token) {
      checkPaymentFromUrl()
    }
  }, [token])

  const choosePlan = (plan: ResumePlan) =>
    setPayment((p) => ({ ...p, plan, price: priceOf(plan) }))

  const requireAuth = () => {
    if (!user) {
      setPayError(t('auth.required', 'Connectez-vous pour continuer.'))
      navigate('/auth')
      return true
    }
    return false
  }

  /** Démarre un paiement Mobile Money via PawaPay. */
  const startPayment = async (intent: PaymentIntentPayload) => {
    if (requireAuth()) return

    if (intent.method === 'card') {
      setPayError(t('payment.cardDisabled', 'Le paiement par carte est désactivé. Utilisez Mobile Money.'))
      return
    }

    const phoneValue = intent.phone || data.phone
    if (!phoneValue) {
      setPayError(t('payment.validation.phone', 'Numéro requis pour Mobile Money.'))
      return
    }

    setPayError(null)
    setPaying(true)
    try {
      // Call backend to create PawaPay payment
      const response = await fetch(`${API_BASE}/api/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: payment.plan,
          amount: payment.price,
          phone: phoneValue,
          provider: intent.provider || 'mtn',
          country: data.country || 'COD',
          currency: 'CDF' // Use CDF for Congo, adjust if needed
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.message || errorData.error || errorData.details?.errorMessage || 'Payment creation failed'
        throw new Error(errorMessage)
      }

      const paymentData = await response.json()
      
      // Store deposit ID for polling
      const depositId = paymentData.depositId
      if (!depositId) {
        throw new Error('No deposit ID received from payment gateway')
      }

      // Set initial status
      if (paymentData.status === 'processing' || paymentData.status === 'pending') {
        setPayError(null) // Clear any previous errors
        // Show processing message
        setPayError('Payment is processing. Please approve the payment in your mobile money app...')
      }

      // Poll for payment status
      const checkPaymentStatus = async () => {
        try {
          const statusResponse = await fetch(`${API_BASE}/api/payments/status/${depositId}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          
          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            const status = statusData.status
            const pawapayStatus = statusData.pawapayStatus
            
            // Handle different statuses
            if (status === 'completed' || pawapayStatus === 'COMPLETED') {
              setPayment((p) => ({
                ...p,
                paid: true,
                method: 'mobile',
                provider: intent.provider,
                phone: phoneValue,
                reference: depositId,
                paidAt: Date.now()
              }))
              setPaymentRef(depositId)
              setPayError(null)
              setStep(3)
              // Download CV automatically after successful payment
              await downloadPdf({
                containerId: 'resume-sheet',
                title: `${data.fullName || 'CV'} - ${data.headline || 'Mako'}`
              })
              return { completed: true, failed: false }
            } else if (status === 'failed' || pawapayStatus === 'FAILED') {
              const failureMessage = statusData.failureReason?.failureMessage || 
                                    'Payment was not approved. Please try again.'
              setPayError(failureMessage)
              return { completed: false, failed: true }
            } else if (status === 'processing' || pawapayStatus === 'PROCESSING' || pawapayStatus === 'ACCEPTED') {
              // Still processing, show message
              setPayError('Payment is processing. Please approve the payment in your mobile money app...')
              return { completed: false, failed: false }
            }
          }
          return { completed: false, failed: false }
        } catch (err) {
          console.error('Error checking payment status:', err)
          return { completed: false, failed: false }
        }
      }

      // Poll every 3 seconds for payment status (max 40 attempts = 2 minutes)
      let attempts = 0
      const maxAttempts = 40
      const pollInterval = setInterval(async () => {
        attempts++
        const result = await checkPaymentStatus()
        
        if (result.completed || result.failed || attempts >= maxAttempts) {
          clearInterval(pollInterval)
          setPaying(false)
          if (attempts >= maxAttempts && !result.completed) {
            setPayError('Payment confirmation timed out. Please check your mobile money app and try again.')
          }
        }
      }, 3000)

      // Initial check
      await checkPaymentStatus()

    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error ? err.message : t('payment.backendMissing', 'Payment unavailable.')
      setPayError(message)
      setPaying(false)
    }
  }

  /** Précharger un brouillon ou un profil sauvegardé localement (si présent). */
  useEffect(() => {
    const draft = loadDraftResume()
    if (draft?.data) {
      setData((prev) => ({ ...prev, ...draft.data }))
      if (draft.withPhoto != null) setWithPhoto(!!draft.withPhoto)
      if (draft.plan) {
        setPayment((p) => ({ ...p, plan: draft.plan as ResumePlan, price: priceOf(draft.plan as ResumePlan) }))
      }
      setShowLoadedBanner(true)
    }

    const saved = loadProfile()
    if (saved?.data) {
      setData(saved.data)
      setWithPhoto(!!saved.withPhoto)
      if (saved.plan) {
        const plan = saved.plan as ResumePlan
        setPayment((p) => ({ ...p, plan, price: priceOf(plan) }))
      }
      if (saved.country) {
        setData((d) => ({ ...d, country: saved.country ?? d.country }))
      }
      setShowLoadedBanner(true)
    }
  }, [])

  /** Charger les CVs de l'utilisateur */
  useEffect(() => {
    const fetchCvs = async () => {
      if (!token || !user) return
      setCvsLoading(true)
      setCvError(null)
      try {
        const res = await listUserCvs(token)
        setCvs(res.cvs || [])
      } catch (e) {
        setCvError(e instanceof Error ? e.message : 'Impossible de charger vos CV.')
      } finally {
        setCvsLoading(false)
      }
    }
    fetchCvs()
  }, [token, user])

  /** Sauvegarde automatique locale du brouillon pour ne rien perdre entre les rafraîchissements. */
  useEffect(() => {
    const id = setTimeout(() => {
      saveDraftResume({
        data,
        withPhoto,
        plan: payment.plan
      })
    }, 250)
    return () => clearTimeout(id)
  }, [data, withPhoto, payment.plan])

  const sendEmail = async () => {
    setPayment((p) => ({ ...p, sendingEmail: true }))
    await new Promise((r) => setTimeout(r, 800))
    setPayment((p) => ({ ...p, sendingEmail: false }))
    alert(t('payment.emailSent'))
  }

  /** Données utilisées par l'aperçu (IA ON => version améliorée) */
  const previewData = useMemo(
    () => (aiPreview ? enhanceResumeForPreview(data) : data),
    [aiPreview, data]
  )

  /** Libellé localisé du toggle IA */
  const aiLabel = useMemo(() => {
    const lang = i18n.language as 'fr' | 'en' | 'sw' | 'pt' | 'ar'
    const on = aiPreview
    if (lang === 'fr') return on ? 'IA activée' : 'IA désactivée'
    if (lang === 'pt') return on ? 'IA ativa' : 'IA inativa'
    if (lang === 'sw') return on ? 'AI imewashwa' : 'AI imezimwa'
    if (lang === 'ar') return on ? 'تشغيل الذكاء الاصطناعي' : 'إيقاف الذكاء الاصطناعي'
    return on ? 'AI on' : 'AI off'
  }, [aiPreview, i18n.language])

  /** Erreurs de dates bloquant l'export PDF */
  const hasDateErrors = useMemo(() => {
    const exps = data.experiences || []
    const edus = data.education || []
    const invalidExp = exps.some((e) => isDateOrderInvalid(e.start, e.end))
    const invalidEdu = edus.some((e) => isDateOrderInvalid(e.start, e.end))
    return invalidExp || invalidEdu
  }, [data.experiences, data.education])

  const exportBlockedTitle = t(
    'dates.exportBlocked',
    'Corrigez les dates invalides (fin ≥ début, format YYYY-MM ou "Present").'
  )

  /** Scroll fluide vers la section "Comment ça marche" sans changer le hash (préserve HashRouter). */
  const scrollToHow = () => {
    const el = document.getElementById('how')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  /** Scroll fluide vers la section "Modèles proposés" (plans), sans changer le hash. */
  const scrollToModels = () => {
    const el = document.getElementById('models')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (!authReady) {
    return <div className="min-h-screen bg-white px-4 py-10 text-center text-neutral-800">Chargement…</div>
  }
  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen text-neutral-900 bg-[linear-gradient(180deg,rgba(44,56,38,0.70),rgba(28,36,28,0.90))]">


      {/* Hero */}
      <section className="border-b border-[rgba(98,120,85,0.35)] bg-[rgba(230,235,220,0.45)] backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-6 px-4 py-8 md:grid-cols-2 md:gap-8 md:py-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t('hero.title')}</h1>
            <p className="mt-3 text-neutral-800">{t('hero.subtitle')}</p>
            <div className="mt-5 flex flex-col gap-2">
              <a
                href="#how"
                className="rounded border border-[rgba(98,120,85,0.5)] bg-[rgba(230,235,220,0.6)] px-4 py-2.5 text-sm hover:border-[rgb(60,77,42)]"
                onClick={(e) => { e.preventDefault(); scrollToHow(); }}
                aria-controls="how"
                role="button"
              >
                {t('hero.ctaHow')}
              </a>

              {/* Nouveau bouton: "Modèles proposés" directement en dessous */}
              <a
                href="#models"
                className="rounded border border-[rgba(98,120,85,0.5)] bg-[rgba(230,235,220,0.6)] px-4 py-2.5 text-sm hover:border-[rgb(60,77,42)]"
                onClick={(e) => { e.preventDefault(); scrollToModels(); }}
                aria-controls="models"
                role="button"
              >
                {t('hero.ctaModels', 'Modèles proposés')}
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-[rgba(98,120,85,0.35)]">
              <img
                src="https://pub-cdn.sider.ai/u/U0E5H7KKOW/web-coder/68c6c0275375a0a7f3b87371/resource/9b39128b-41ad-405b-b9e0-148ca7b3b5e1.jpg"
                alt={t('hero.imageAlt')}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {showLoadedBanner ? (
        <div className="mx-auto mt-4 max-w-6xl px-4">
          <div className="rounded-lg border border-[rgba(98,120,85,0.45)] bg-[rgba(230,235,220,0.8)] p-3 text-sm text-neutral-800">
            {t('account.profileLoaded', 'Profil chargé depuis cet appareil. Vous pouvez mettre à jour vos infos et les resauvegarder.')}
          </div>
        </div>
      ) : null}

      <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-6 px-4">
        {/* Étapes (sticky sur mobile pour garder le contexte) */}
        <div className="sticky top-0 z-30 -mx-4 border-b border-[rgba(98,120,85,0.35)] bg-[rgba(230,235,220,0.6)] px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-[rgba(230,235,220,0.5)] md:static md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-0">
          <StepIndicator step={step} />
        </div>

        {/* Zone principale: formulaire + aperçu */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-[rgba(98,120,85,0.35)] bg-[rgba(230,235,220,0.65)] p-4 backdrop-blur">
            {(step === 1 || step === 2) ? (
              <ResumeForm
                value={data}
                withPhoto={withPhoto}
                onTogglePhoto={setWithPhoto}
                onChange={(next) => {
                  setData(next)
                  if (i18n.language !== next.language) {
                    i18n.changeLanguage(next.language)
                  }
                }}
                onNext={() => setStep(2)}
              />
            ) : (
              <PaymentPanel
                payment={payment}
                choosePlan={choosePlan}
                simulatePay={async () =>
                  startPayment({
                    method: 'mobile',
                    provider: defaultMobileProvider(data.country),
                    phone: data.phone
                  })
                }
                onBack={() => setStep(2)}
              />
            )}
          </div>

          <div className="rounded-lg border border-[rgba(98,120,85,0.35)] bg-[rgba(230,235,220,0.65)] p-4 backdrop-blur">
            {/* En-tête aperçu: Titre + actions avec AI toggle pour mobile et desktop */}
            <div className="mb-3 flex flex-col items-center gap-2">
              {/* AI Toggle for mobile - visible only on mobile */}
              <div className="md:hidden w-full flex justify-center mb-2">
                <button
                  type="button"
                  onClick={() => setAiPreview((v) => !v)}
                  className={`min-h-[44px] rounded border px-4 py-2.5 text-sm ${
                    aiPreview
                      ? 'border-[rgb(60,77,42)] text-[rgb(60,77,42)] bg-[rgba(230,235,220,0.8)]'
                      : 'border-[rgba(98,120,85,0.5)] text-neutral-800 bg-[rgba(230,235,220,0.6)]'
                  }`}
                  aria-pressed={aiPreview}
                  aria-label={aiLabel}
                >
                  {aiLabel}
                </button>
              </div>
              
              {/* AI Toggle for desktop - subtle placement */}
              <div className="hidden md:flex w-full justify-end">
                <button
                  type="button"
                  onClick={() => setAiPreview((v) => !v)}
                  className={`rounded border px-3 py-1 text-xs ${
                    aiPreview
                      ? 'border-[rgb(60,77,42)] text-[rgb(60,77,42)] bg-[rgba(230,235,220,0.8)]'
                      : 'border-[rgba(98,120,85,0.5)] text-neutral-800 bg-[rgba(230,235,220,0.6)]'
                  }`}
                  aria-pressed={aiPreview}
                  aria-label={aiLabel}
                  title={aiLabel}
                >
                  {aiLabel}
                </button>
              </div>
              
              <div className="flex w-full flex-wrap items-center justify-center gap-3">
                <span className="hidden" aria-hidden="true" />

                {/* Simple button to choose student model and show preview */}
                <PrimaryButton
                  type="button"
                  size="sm"
                  onClick={() => {
                    choosePlan('student')
                    setStep(2) // Go to step 2 to show preview
                  }}
                >
                  Simple $1
                </PrimaryButton>

                {/* Pro button to choose pro model and show preview */}
                <PrimaryButton
                  type="button"
                  size="sm"
                  onClick={() => {
                    choosePlan('pro')
                    setStep(2) // Go to step 2 to show preview
                  }}
                >
                  Pro $2
                </PrimaryButton>

                {/* Advanced button to choose advanced model and show preview */}
                <PrimaryButton
                  type="button"
                  size="sm"
                  onClick={() => {
                    choosePlan('advanced')
                    setStep(2) // Go to step 2 to show preview
                  }}
                >
                  Avancé $3
                </PrimaryButton>
              </div>
            </div>

            {/* Fade-in animation on model switch */}
            <div key={payment.plan} className="animate-in fade-in-50 duration-200">
              <MarlonTemplatePreview data={previewData} withPhoto={withPhoto} plan={payment.plan} />
            </div>
          </div>
        </div>

        {/* CTA unique, centré: redirige vers paiement ou télécharge si payé */}
        <DownloadCta
          paid={payment.paid}
          paying={paying}
          error={payError}
          onPay={() => {
            if (requireAuth()) return
            setPreviewOpen(true)
          }}
          onDownload={async () => {
            await downloadPdf({
              containerId: 'resume-sheet',
              title: `${data.fullName || 'CV'} - ${data.headline || 'ETHAN'}`
            })
          }}
          exportBlocked={hasDateErrors}
          exportBlockedTitle={exportBlockedTitle}
          onOpenPreview={() => setPreviewOpen(true)}
        />

        {/* Paiement si étape 3 */}
        {step === 3 ? (
          <div className="rounded-lg border border-[rgba(98,120,85,0.35)] bg-[rgba(230,235,220,0.65)] p-4 backdrop-blur">
            <PaymentPanel
              payment={payment}
              choosePlan={choosePlan}
              simulatePay={async () =>
                startPayment({
                  method: 'mobile',
                  provider: defaultMobileProvider(data.country),
                  phone: data.phone
                })
              }
              onBack={() => setStep(2)}
            />

            {payment.paid && paymentRef ? (
              <p className="mt-3 text-sm text-emerald-700">
                {t('payment.reference', 'Référence de paiement')} : {paymentRef}
              </p>
            ) : null}

            {payment.paid ? (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t('payment.emailLabel')}</span>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder={t('payment.emailPlaceholder')}
                      className="w-full rounded border border-[rgba(98,120,85,0.5)] bg-white px-3 py-2 text-base outline-none focus:border-[rgb(60,77,42)] sm:text-sm"
                    />
                  </label>
                  {/* Le bouton de téléchargement est retiré ici pour éviter les doublons. */}
                  <div aria-hidden className="hidden md:block" />
                  <button
                    disabled={!customerEmail || payment.sendingEmail}
                    className="h-fit rounded bg-[rgb(60,77,42)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(50,64,35)] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={sendEmail}
                  >
                    {payment.sendingEmail ? t('common.sending', '...') : t('payment.sendEmail')}
                  </button>
                </div>

                {user ? (
                  <>
                    <SaveInfoCard
                      email={customerEmail || data.email}
                      country={data.country}
                      data={data}
                      withPhoto={withPhoto}
                      plan={payment.plan}
                      onSaved={() => setProfileSaved(true)}
                    />
                    {profileSaved ? (
                      <p className="text-sm text-emerald-700">
                        {t('account.profileSaved', 'Profil enregistré sur cet appareil.')}
                      </p>
                    ) : null}

                    <div className="mt-4 rounded-lg border border-[rgba(98,120,85,0.35)] bg-white/90 p-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-neutral-900">Mes CV sauvegardés</h4>
                        <PrimaryButton
                          type="button"
                          size="sm"
                          disabled={!token || cvsLoading}
                          onClick={async () => {
                            if (!token) return
                            setCvsLoading(true)
                            try {
                              const res = await listUserCvs(token)
                              setCvs(res.cvs || [])
                            } finally {
                              setCvsLoading(false)
                            }
                          }}
                        >
                          {cvsLoading ? '...' : 'Rafraîchir'}
                        </PrimaryButton>
                      </div>
                      {cvError ? <p className="mt-2 text-sm text-red-600">{cvError}</p> : null}
                      <div className="mt-3 space-y-2">
                        {(cvs || []).length === 0 ? (
                          <p className="text-sm text-neutral-700">Aucun CV sauvegardé pour le moment.</p>
                        ) : (
                          cvs.map((cv) => (
                            <div
                              key={cv.id}
                              className="flex items-center justify-between rounded border border-[rgba(98,120,85,0.3)] bg-[rgba(230,235,220,0.6)] px-3 py-2 text-sm"
                            >
                              <div className="flex flex-col">
                                <span className="font-medium text-neutral-900">{cv.title}</span>
                                <span className="text-xs text-neutral-700">
                                  Plan: {cv.plan} · {new Date(cv.updatedAt).toLocaleString()}
                                </span>
                              </div>
                              <PrimaryButton
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setData(cv.data)
                                  setWithPhoto(cv.withPhoto)
                                  choosePlan(cv.plan)
                                  setStep(2)
                                }}
                              >
                                Charger
                              </PrimaryButton>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-neutral-800">
                    {t('auth.required', 'Connectez-vous pour sauvegarder vos informations.')}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Section "Comment ça marche" avec scroll-margin pour header sticky */}
        <section id="how" className="my-10 scroll-mt-24 md:scroll-mt-28 rounded-lg border border-[rgba(98,120,85,0.35)] bg-[rgba(230,235,220,0.65)] p-4 backdrop-blur">
          <h3 className="text-lg font-semibold">{t('how.title')}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm text-neutral-800">
            <li>{t('how.step1')}</li>
            <li>{t('how.step2')}</li>
            <li>{t('how.step3')}</li>
            <li>{t('how.step4')}</li>
            <li>{t('how.step5')}</li>
          </ol>
          <p className="mt-3 text-sm text-neutral-700">
            {t('how.note')}
          </p>
        </section>

        {/* Comparaison des forfaits */}
        <PlanComparison />

      </div>

      {/* Barre d'actions mobile — on retire l'action Download pour garder un seul CTA */}


      {/* Full-screen CV preview with Confirmation -> Payment tabs */}
      <PreviewScreen
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        data={data}
        withPhoto={withPhoto}
        payment={payment}
        onChoosePlan={choosePlan}
        onSimulatePay={async (intent) => startPayment(intent)}
        exportBlocked={hasDateErrors}
        exportBlockedTitle={exportBlockedTitle}
      />

      {/* WhatsApp share modal (shown after saving info) */}
      <WhatsAppShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        defaultMessage={t('share.whatsappDefault', { url: typeof window !== 'undefined' ? window.location.href : '' })}
      />

      {/* Hidden printable sheet containing the resume preview.
          This ensures printPdf can always find id="resume-sheet" and print
          the exact CV shown in the preview even if the preview overlay is closed. */}
      <PrintSheet data={previewData as any} withPhoto={withPhoto} plan={payment.plan} />

      {/* QuickActionsBar is now hidden on mobile - functionality moved to preview section */}
      {/* <QuickActionsBar
        aiLabel={aiLabel}
        aiOn={aiPreview}
        onToggleAI={() => setAiPreview((v) => !v)}
        onSelectPlan={(plan) => {
          choosePlan(plan)
          setStep(2) // Go to step 2 to show preview
        }}
        mobileActionsAriaLabel={t('a11y.mobileActions')}
      /> */}
    </div>
  )
}

/**
 * Panneau de paiement: choix plan + redirection/simulation paiement
 */
function PaymentPanel({
  payment,
  choosePlan,
  simulatePay,
  onBack
}: {
  payment: PaymentState
  choosePlan: (p: ResumePlan) => void
  simulatePay: () => Promise<void>
  onBack: () => void
}) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">{t('pricing.title')}</h3>
        {!payment.paid ? (
          <button
            onClick={onBack}
            className="rounded border border-[rgba(98,120,85,0.5)] bg-[rgba(230,235,220,0.6)] px-3 py-2 text-sm hover:border-[rgb(60,77,42)]"
          >
            ← {t('common.back', 'Back')}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PricingTier
          value="student"
          label={t('pricing.simple.name', 'Simple')}
          description={t('pricing.student.desc')}
          price={t('pricing.student.price')}
          selected={payment.plan === 'student'}
          onSelect={choosePlan}
        />
        <PricingTier
          value="pro"
          label={t('pricing.pro.name')}
          description={t('pricing.pro.desc')}
          price={t('pricing.pro.price')}
          selected={payment.plan === 'pro'}
          onSelect={choosePlan}
        />
        <PricingTier
          value="advanced"
          label={t('pricing.advanced.name')}
          description={t('pricing.advanced.desc')}
          price={t('pricing.advanced.price')}
          selected={payment.plan === 'advanced'}
          onSelect={choosePlan}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        {payment.paid ? (
          <div className="text-sm font-medium text-[rgb(43,94,55)]">
            {t('payment.successTitle')} — {t('payment.ready')}
          </div>
        ) : (
          <div className="text-sm text-neutral-800">
            {t('pricing.total', { amount: `${payment.price}` })}
          </div>
        )}

        {!payment.paid ? (
          <button
            onClick={simulatePay}
            className="rounded bg-[rgb(60,77,42)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(50,64,35)]"
          >
            {t('pricing.payNow')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * QuickActionsBar (mobile)
 * Version allégée: IA + plan buttons, sans bouton de téléchargement pour conserver un seul CTA.
 */
function QuickActionsBar(props: {
  aiLabel: string
  aiOn: boolean
  onToggleAI: () => void
  onSelectPlan: (plan: import('../types/resume').ResumePlan) => void
  mobileActionsAriaLabel: string
}) {
  const {
    aiLabel,
    aiOn,
    onToggleAI,
    onSelectPlan,
    mobileActionsAriaLabel,
  } = props

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={mobileActionsAriaLabel}
    >
      <div className="m-3 rounded-lg border border-[rgba(98,120,85,0.4)] bg-[rgba(230,235,220,0.85)] p-2 shadow-[0_-6px_20px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAI}
            className={`min-h-[44px] flex-1 rounded border px-3 text-sm bg-[rgba(230,235,220,0.6)] ${
              aiOn
                ? 'border-[rgb(60,77,42)] text-[rgb(60,77,42)] hover:border-[rgb(50,64,35)]'
                : 'border-[rgba(98,120,85,0.5)] text-neutral-800 hover:border-[rgb(60,77,42)]'
            }`}
            aria-pressed={aiOn}
            aria-label={aiLabel}
            title={aiLabel}
          >
            {aiLabel}
          </button>

          {/* Mobile button for Simple plan */}
          <button
            type="button"
            onClick={() => onSelectPlan('student')}
            className="min-h-[44px] flex-1 rounded border border-[rgba(98,120,85,0.5)] bg-[rgba(230,235,220,0.6)] px-3 text-sm text-neutral-800 hover:border-[rgb(60,77,42)]"
          >
            Simple $1
          </button>

          {/* Mobile button for Pro plan */}
          <button
            type="button"
            onClick={() => onSelectPlan('pro')}
            className="min-h-[44px] flex-1 rounded border border-[rgba(98,120,85,0.5)] bg-[rgba(230,235,220,0.6)] px-3 text-sm text-neutral-800 hover:border-[rgb(60,77,42)]"
          >
            Pro $2
          </button>

          {/* Mobile button for Advanced plan */}
          <button
            type="button"
            onClick={() => onSelectPlan('advanced')}
            className="min-h-[44px] flex-1 rounded border border-[rgba(98,120,85,0.5)] bg-[rgba(230,235,220,0.6)] px-3 text-sm text-neutral-800 hover:border-[rgb(60,77,42)]"
          >
            Avancé $3
          </button>
        </div>
      </div>
    </div>
  )
}
