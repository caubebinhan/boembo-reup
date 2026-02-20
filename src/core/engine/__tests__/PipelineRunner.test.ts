import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PipelineRunner } from '../PipelineRunner'
import { ContextManager } from '../ContextManager'
import { PluginRegistry } from '../../registry/PluginRegistry'
import { INode, NodeResult } from '../../types/INode'
import { Context } from '../../types/Context'

class MockNode1 implements INode {
  id = ''
  type = 'Mock1'
  params: any = {}
  async execute(_ctx: Context): Promise<NodeResult> {
    return { status: 'mock1_done', data: { var1: 'hello', resolvedParam: this.params.text } }
  }
}

class MockNode2 implements INode {
  id = ''
  type = 'Mock2'
  params: any = {}
  async execute(_ctx: Context): Promise<NodeResult> {
    return { status: 'mock2_done', data: { val: this.params.data } }
  }
}

describe('PipelineRunner', () => {
  beforeEach(() => {
    PluginRegistry.register('Mock1', MockNode1)
    PluginRegistry.register('Mock2', MockNode2)
  })

  it('runs nodes sequentially based on on_success and resolves variables', async () => {
    const ctx = ContextManager.create({ id: 'kamp', workflow_id: 'wb', name: 'Kamp', params: {}, status: 'idle' })
    const emitSpy = vi.spyOn(ctx, 'emit')

    const pipelineConfig = [
      { id: '1', node: 'Mock1', params: { text: 'world' }, on_success: '2' },
      { id: '2', node: 'Mock2', params: { data: '{{var1}} {{campaign.id}}' } }
    ]

    await PipelineRunner.run(pipelineConfig, ctx)

    expect(ctx.variables.var1).toBe('hello')
    expect(ctx.variables.val).toBe('hello kamp')
    expect(emitSpy).toHaveBeenCalledWith('node:done', expect.objectContaining({ nodeId: '2' }))
  })
})
