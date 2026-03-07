import { useState, useEffect, useMemo } from 'react'
import type { DialogueTree, DialogueNode, HostToWebview } from '../types'

export interface TreeMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly incomplete?: boolean
}

export interface UseTreeStateResult {
  readonly tree: DialogueTree | null
  readonly messages: ReadonlyArray<TreeMessage>
  readonly activePath: ReadonlyArray<string>
}

export function useTreeState(lastMessage: HostToWebview | null): UseTreeStateResult {
  const [tree, setTree] = useState<DialogueTree | null>(null)

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'treeState') {
      setTree(lastMessage.tree)
    }
  }, [lastMessage])

  const messages = useMemo<ReadonlyArray<TreeMessage>>(() => {
    if (!tree) {
      return []
    }

    const result: TreeMessage[] = []

    for (const nodeId of tree.activePath) {
      const node: DialogueNode | undefined = tree.nodes[nodeId]
      if (!node) {
        continue
      }
      // Skip system nodes (root node)
      if (node.role === 'system') {
        continue
      }
      result.push({
        id: node.id,
        role: node.role,
        content: node.content,
        incomplete: node.metadata.incomplete,
      })
    }

    return result
  }, [tree])

  const activePath = useMemo<ReadonlyArray<string>>(() => {
    return tree?.activePath ?? []
  }, [tree])

  return { tree, messages, activePath }
}
