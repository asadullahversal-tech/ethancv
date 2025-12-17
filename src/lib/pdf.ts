/**
 * Fonctions utilitaires pour la génération de PDF.
 * - `printPdf`: utilise la boîte de dialogue d'impression du navigateur.
 * - `downloadPdf`: génère un vrai fichier PDF via html2pdf.js.
 */

import type { PdfOptions } from '../types/resume'
import html2pdf from 'html2pdf.js'

/**
 * Déclenche l'impression du conteneur spécifié (ancienne approche).
 * Astuce: on remplace temporairement le titre du document.
 */
export function printPdf({ containerId, title }: PdfOptions) {
  const el = document.getElementById(containerId)
  if (!el) {
    console.warn('printPdf: container not found', containerId)
    window.print()
    return
  }
  const prev = document.title
  if (title) document.title = title
  window.print()
  if (title) document.title = prev
}

/**
 * Génère et télécharge un PDF directement (sans boîte de dialogue d'impression).
 * Utilise html2pdf.js pour conserver le design existant de `#resume-sheet`.
 */
export async function downloadPdf({ containerId, title }: PdfOptions) {
  const el = document.getElementById(containerId)
  if (!el) {
    console.warn('downloadPdf: container not found', containerId)
    return
  }

  const filename =
    (title && `${title}.pdf`) ||
    'CV-Mako.pdf'

  // Configuration raisonnable pour garder un rendu net et A4
  const opt = {
    margin: [10, 10, 10, 10],
    filename,
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] as const },
  }

  // html2pdf typings sont partielles, on cast pour éviter les erreurs TS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (html2pdf as any)().from(el).set(opt).save()
}
