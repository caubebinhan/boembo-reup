import { useState, useEffect } from 'react'
import { WorkflowUIDescriptor } from '../../../core/flow/ExecutionContracts'

export function useFlowUIDescriptor(flowId: string) {
    const [descriptor, setDescriptor] = useState<WorkflowUIDescriptor | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!flowId) {
            setLoading(false)
            return
        }

        const load = async () => {
            try {
                // @ts-ignore
                const ui = await window.api.invoke('flow:get-ui-descriptor', flowId)
                setDescriptor(ui)
            } catch (err) {
                console.error(`Failed to load UI descriptor for flow ${flowId}:`, err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [flowId])

    return { descriptor, loading }
}

/**
 * Safely evaluates a JS expression string against a data context
 */
export function evaluateExpression(expr: string | undefined, context: Record<string, any>, fallback: any = null): any {
    if (!expr) return fallback
    
    try {
        const keys = Object.keys(context)
        const values = Object.values(context)
        // Create an isolated function context
        // eslint-disable-next-line no-new-func
        const fn = new Function(...keys, `return ${expr}`)
        return fn(...values)
    } catch (err) {
        console.warn(`Evaluation failed for expression: "${expr}"`, err)
        return fallback
    }
}
