import { useState, useEffect, useCallback } from 'react'
import { WizardSessionData, IPC_CHANNELS } from '../../../shared/ipc-types'

export function useWizardStep<T>(stepKey: string) {
  const params = new URLSearchParams(window.location.hash.split('?')[1])
  const sessionId = params.get('sessionId')

  const [session, setSession] = useState<WizardSessionData | null>(null)

  useEffect(() => {
    if (!sessionId) return
    // @ts-ignore
    window.api.invoke(IPC_CHANNELS.WIZARD_GET_SESSION, { sessionId })
      .then((data: WizardSessionData) => setSession(data))
  }, [sessionId])

  const currentValue = session?.outputs[stepKey] as T | undefined

  const commit = useCallback(async (data: T) => {
    if (!sessionId) return
    // @ts-ignore
    await window.api.invoke(IPC_CHANNELS.WIZARD_COMMIT_STEP, { sessionId, stepKey, data })
  }, [sessionId, stepKey])

  const goBack = useCallback(() => {
    if (!sessionId) return
    // @ts-ignore
    window.api.invoke(IPC_CHANNELS.WIZARD_GO_BACK, { sessionId })
  }, [sessionId])

  return { session, currentValue, commit, goBack, sessionId }
}
