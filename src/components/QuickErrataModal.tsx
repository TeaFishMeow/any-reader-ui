import { ticketSeverityLabelKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { ModalShell } from './Chrome'

const ERRATA_SEVERITIES = ['low', 'medium', 'high'] as const

export interface QuickErrataFormFields {
  severity: 'low' | 'medium' | 'high'
  title: string
  description: string
  proposedFix: string
  selectionQuote: string
  selectionContext: string
}

interface QuickErrataModalProps {
  documentTitle: string
  documentPath: string
  librariesHref: string
  draft: QuickErrataFormFields
  isSubmitting: boolean
  isSubmitted: boolean
  errorMessage: string | null
  onClose: () => void
  onChange: (patch: Partial<QuickErrataFormFields>) => void
  onSubmit: () => void
}

export function QuickErrataModal({
  documentTitle,
  documentPath,
  librariesHref,
  draft,
  isSubmitting,
  isSubmitted,
  errorMessage,
  onClose,
  onChange,
  onSubmit
}: QuickErrataModalProps) {
  const { t } = useI18n()

  return (
    <ModalShell title={t('app.quickErrata.modalTitle')} onClose={onClose}>
      <p className="modal-note">{t('app.quickErrata.note')}</p>

      {isSubmitted ? (
        <>
          <div className="quick-errata-modal__success">
            <strong>{t('libraries.feedback.ticketCreated')}</strong>
            <p>{t('app.quickErrata.successNote')}</p>
          </div>
          <div className="quick-errata-modal__actions">
            <a className="primary-button" href={librariesHref}>
              {t('app.quickErrata.viewTickets')}
            </a>
            <button className="ghost-button" type="button" onClick={onClose}>
              {t('app.quickErrata.continueReading')}
            </button>
          </div>
        </>
      ) : (
        <form
          className="quick-errata-modal"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="settings-grid">
            <label className="settings-field">
              <span>{t('app.quickErrata.documentTitle')}</span>
              <input value={documentTitle} readOnly />
            </label>

            <label className="settings-field">
              <span>{t('app.quickErrata.documentPath')}</span>
              <input value={documentPath} readOnly />
            </label>

            <label className="settings-field">
              <span>{t('libraries.form.severity')}</span>
              <select
                value={draft.severity}
                onChange={(event) =>
                  onChange({
                    severity: event.target.value as QuickErrataFormFields['severity']
                  })
                }
              >
                {ERRATA_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {t(ticketSeverityLabelKey(severity))}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field settings-field--wide">
              <span>{t('app.quickErrata.title')}</span>
              <input
                required
                value={draft.title}
                placeholder={t('app.quickErrata.titlePlaceholder')}
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </label>

            <label className="settings-field settings-field--wide">
              <span>{t('app.quickErrata.description')}</span>
              <textarea
                required
                value={draft.description}
                placeholder={t('app.quickErrata.descriptionPlaceholder')}
                onChange={(event) => onChange({ description: event.target.value })}
              />
            </label>

            {draft.selectionQuote ? (
              <label className="settings-field settings-field--wide">
                <span>{t('app.quickErrata.selection')}</span>
                <textarea
                  value={draft.selectionQuote}
                  onChange={(event) => onChange({ selectionQuote: event.target.value })}
                />
                <small>{t('app.quickErrata.selectionHint')}</small>
              </label>
            ) : (
              <div className="quick-errata-modal__hint">{t('app.quickErrata.noSelection')}</div>
            )}

            {draft.selectionContext ? (
              <div className="quick-errata-modal__preview">
                <strong>{t('app.quickErrata.contextPreview')}</strong>
                <p>{draft.selectionContext}</p>
              </div>
            ) : null}

            <label className="settings-field settings-field--wide">
              <span>{t('app.quickErrata.proposedFix')}</span>
              <textarea
                value={draft.proposedFix}
                placeholder={t('app.quickErrata.proposedFixPlaceholder')}
                onChange={(event) => onChange({ proposedFix: event.target.value })}
              />
            </label>
          </div>

          {errorMessage ? <p className="settings-warning">{errorMessage}</p> : null}

          <div className="quick-errata-modal__actions">
            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting || !draft.title.trim() || !draft.description.trim()}
            >
              {isSubmitting ? t('libraries.action.submitting') : t('libraries.action.createTicket')}
            </button>
            <button className="ghost-button" type="button" onClick={onClose}>
              {t('shared.action.close')}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}
