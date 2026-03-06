import { strict as assert } from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DialogueTree } from '../../dialogue/types'
import { StorageService, CorruptTreeError } from '../../dialogue/storage'

/**
 * Creates a minimal valid DialogueTree for testing.
 */
function createTestTree(overrides: Partial<DialogueTree> = {}): DialogueTree {
  const id = overrides.id ?? 'test-tree-1'
  const rootId = 'root-node-1'
  const now = Date.now()
  return {
    id,
    title: 'Test Tree',
    rootId,
    activePath: [rootId],
    nodes: {
      [rootId]: {
        id: rootId,
        parentId: null,
        role: 'system',
        content: 'Tree created',
        children: [],
        metadata: { timestamp: now, model: 'system' },
      },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('StorageService', () => {
  let tmpDir: string
  let service: StorageService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-agent-test-'))
    service = new StorageService(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('saveTree', () => {
    it('creates .math-agent/trees/{id}.json with valid JSON', () => {
      const tree = createTestTree({ id: 'tree-abc' })
      service.saveTree(tree)

      const filePath = path.join(tmpDir, '.math-agent', 'trees', 'tree-abc.json')
      assert.ok(fs.existsSync(filePath), 'Tree file should exist')

      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(content)
      assert.equal(parsed.id, 'tree-abc')
      assert.equal(parsed.title, 'Test Tree')
    })

    it('creates .backup.json on second save', () => {
      const tree = createTestTree({ id: 'tree-backup' })
      service.saveTree(tree)

      // Save again with different title
      const updatedTree = createTestTree({
        id: 'tree-backup',
        title: 'Updated Tree',
      })
      service.saveTree(updatedTree)

      const backupPath = path.join(
        tmpDir, '.math-agent', 'trees', 'tree-backup.backup.json'
      )
      assert.ok(fs.existsSync(backupPath), 'Backup file should exist')

      const backupContent = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))
      assert.equal(backupContent.title, 'Test Tree', 'Backup should contain original data')

      const mainContent = JSON.parse(
        fs.readFileSync(
          path.join(tmpDir, '.math-agent', 'trees', 'tree-backup.json'),
          'utf-8'
        )
      )
      assert.equal(mainContent.title, 'Updated Tree', 'Main file should contain updated data')
    })

    it('auto-creates .math-agent/trees/ directory', () => {
      const treesDir = path.join(tmpDir, '.math-agent', 'trees')
      assert.ok(!fs.existsSync(treesDir), 'Directory should not exist initially')

      const tree = createTestTree()
      service.saveTree(tree)

      assert.ok(fs.existsSync(treesDir), 'Directory should be created')
    })
  })

  describe('loadTree', () => {
    it('returns parsed DialogueTree matching saved data', () => {
      const tree = createTestTree({ id: 'load-test', title: 'Load Test Tree' })
      service.saveTree(tree)

      const loaded = service.loadTree('load-test')
      assert.equal(loaded.id, 'load-test')
      assert.equal(loaded.title, 'Load Test Tree')
      assert.equal(loaded.rootId, tree.rootId)
      assert.deepEqual(Object.keys(loaded.nodes), Object.keys(tree.nodes))
    })

    it('throws CorruptTreeError with corrupt JSON', () => {
      const treesDir = path.join(tmpDir, '.math-agent', 'trees')
      fs.mkdirSync(treesDir, { recursive: true })
      fs.writeFileSync(path.join(treesDir, 'corrupt.json'), '{ broken json !!!', 'utf-8')

      assert.throws(
        () => service.loadTree('corrupt'),
        (err: unknown) => err instanceof CorruptTreeError
      )
    })

    it('throws error with nonexistent file', () => {
      assert.throws(
        () => service.loadTree('nonexistent-tree'),
        (err: unknown) => err instanceof Error
      )
    })
  })

  describe('listTrees', () => {
    it('returns array of {id, title, updatedAt} for all tree files', () => {
      const tree1 = createTestTree({ id: 'list-1', title: 'First Tree', updatedAt: 1000 })
      const tree2 = createTestTree({ id: 'list-2', title: 'Second Tree', updatedAt: 2000 })
      service.saveTree(tree1)
      service.saveTree(tree2)

      const list = service.listTrees()
      assert.equal(list.length, 2)

      const ids = list.map((t) => t.id).sort()
      assert.deepEqual(ids, ['list-1', 'list-2'])

      const first = list.find((t) => t.id === 'list-1')!
      assert.equal(first.title, 'First Tree')
      assert.equal(first.updatedAt, 1000)

      const second = list.find((t) => t.id === 'list-2')!
      assert.equal(second.title, 'Second Tree')
      assert.equal(second.updatedAt, 2000)
    })

    it('returns empty array on empty directory', () => {
      const list = service.listTrees()
      assert.deepEqual(list, [])
    })

    it('ignores .backup.json files', () => {
      const tree = createTestTree({ id: 'ignore-backup' })
      service.saveTree(tree)
      // Save again to create backup
      service.saveTree(createTestTree({ id: 'ignore-backup', title: 'Updated' }))

      const list = service.listTrees()
      assert.equal(list.length, 1)
      assert.equal(list[0].id, 'ignore-backup')
    })
  })

  describe('ensureGitignore', () => {
    it('appends .math-agent/ to .gitignore if not present', () => {
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\n', 'utf-8')
      const tree = createTestTree()
      service.saveTree(tree)

      const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
      assert.ok(gitignore.includes('.math-agent/'), '.gitignore should include .math-agent/')
    })

    it('does not duplicate .math-agent/ in .gitignore', () => {
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.math-agent/\nnode_modules/\n', 'utf-8')
      const tree = createTestTree()
      service.saveTree(tree)

      const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
      const count = (gitignore.match(/\.math-agent\//g) || []).length
      assert.equal(count, 1, '.math-agent/ should appear exactly once')
    })

    it('does not create .gitignore if it does not exist', () => {
      const tree = createTestTree()
      service.saveTree(tree)

      assert.ok(
        !fs.existsSync(path.join(tmpDir, '.gitignore')),
        '.gitignore should not be created if it did not exist'
      )
    })
  })

  describe('edge cases', () => {
    it('handles tree with empty string id', () => {
      const tree = createTestTree({ id: '' })
      service.saveTree(tree)
      const filePath = path.join(tmpDir, '.math-agent', 'trees', '.json')
      assert.ok(fs.existsSync(filePath), 'File should be created even with empty id')
    })

    it('handles tree with special characters in id', () => {
      const tree = createTestTree({ id: 'tree-with-spaces and (parens)' })
      service.saveTree(tree)
      const loaded = service.loadTree('tree-with-spaces and (parens)')
      assert.equal(loaded.id, 'tree-with-spaces and (parens)')
    })

    it('save and load round-trip preserves all fields', () => {
      const tree = createTestTree({
        id: 'roundtrip',
        title: 'Round Trip',
        attachedPapers: [
          {
            id: 'paper-1',
            source: 'arxiv',
            title: 'Test Paper',
            arxivId: '2301.00001',
            extractedText: 'Some text',
            scope: 'global',
          },
        ],
      })
      service.saveTree(tree)
      const loaded = service.loadTree('roundtrip')
      assert.deepEqual(loaded.attachedPapers, tree.attachedPapers)
      assert.deepEqual(loaded.nodes, tree.nodes)
      assert.equal(loaded.createdAt, tree.createdAt)
    })

    it('loadTree with empty JSON file throws CorruptTreeError', () => {
      const treesDir = path.join(tmpDir, '.math-agent', 'trees')
      fs.mkdirSync(treesDir, { recursive: true })
      fs.writeFileSync(path.join(treesDir, 'empty.json'), '', 'utf-8')

      assert.throws(
        () => service.loadTree('empty'),
        (err: unknown) => err instanceof CorruptTreeError
      )
    })

    it('listTrees skips files that fail to parse', () => {
      const tree = createTestTree({ id: 'good-tree' })
      service.saveTree(tree)

      const treesDir = path.join(tmpDir, '.math-agent', 'trees')
      fs.writeFileSync(path.join(treesDir, 'bad-tree.json'), 'not json', 'utf-8')

      const list = service.listTrees()
      // Should at least return the good tree, not crash
      assert.ok(list.length >= 1)
      assert.ok(list.some((t) => t.id === 'good-tree'))
    })

    it('multiple saves create only one backup of the previous version', () => {
      const tree1 = createTestTree({ id: 'multi-save', title: 'Version 1' })
      service.saveTree(tree1)

      const tree2 = createTestTree({ id: 'multi-save', title: 'Version 2' })
      service.saveTree(tree2)

      const tree3 = createTestTree({ id: 'multi-save', title: 'Version 3' })
      service.saveTree(tree3)

      const backupPath = path.join(tmpDir, '.math-agent', 'trees', 'multi-save.backup.json')
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))
      // Backup should be version 2 (the one replaced by version 3)
      assert.equal(backup.title, 'Version 2')
    })
  })
})
