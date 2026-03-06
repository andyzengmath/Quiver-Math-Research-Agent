import { strict as assert } from 'assert'
import { PersonaManager } from '../../persona/manager'
import { PersonaConfig } from '../../persona/types'

describe('PersonaManager', () => {
  let manager: PersonaManager

  function createMockConfigGetter(customPersonas: PersonaConfig[] = []) {
    return <T>(key: string, defaultValue?: T): T => {
      if (key === 'customPersonas') {
        return customPersonas as unknown as T
      }
      if (key === 'defaultPersona') {
        return ('algebraist' as unknown) as T
      }
      return defaultValue as T
    }
  }

  beforeEach(() => {
    manager = new PersonaManager(createMockConfigGetter())
  })

  describe('listPersonas', () => {
    it('should return 7 personas (6 built-in + multi-agent)', () => {
      const personas = manager.listPersonas()
      assert.equal(personas.length, 7)
    })

    it('should include a multi-agent entry', () => {
      const personas = manager.listPersonas()
      const multiAgent = personas.find((p: PersonaConfig) => p.id === 'multi-agent')
      assert.ok(multiAgent, 'Expected a multi-agent persona')
      assert.equal(multiAgent.label, 'Multi-agent')
    })
  })

  describe('getPersona', () => {
    it('should return config with id, label, systemPrompt (>= 100 chars), preferredSources for algebraist', () => {
      const persona = manager.getPersona('algebraist')
      assert.equal(persona.id, 'algebraist')
      assert.equal(typeof persona.label, 'string')
      assert.ok(persona.label.length > 0, 'label should not be empty')
      assert.equal(typeof persona.systemPrompt, 'string')
      assert.ok(
        persona.systemPrompt.length >= 100,
        `systemPrompt should be >= 100 chars, got ${persona.systemPrompt.length}`
      )
      assert.ok(Array.isArray(persona.preferredSources), 'preferredSources should be an array')
    })

    it('should throw Error for unknown persona id', () => {
      assert.throws(
        () => manager.getPersona('unknown'),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.ok(err.message.includes('unknown'), 'Error message should mention the unknown id')
          return true
        }
      )
    })
  })

  describe('unique systemPrompts', () => {
    it('each built-in persona should have a unique systemPrompt', () => {
      const personas = manager.listPersonas()
      const prompts = personas.map((p: PersonaConfig) => p.systemPrompt)
      const uniquePrompts = new Set(prompts)
      assert.equal(
        uniquePrompts.size,
        prompts.length,
        'All personas should have unique systemPrompts'
      )
    })
  })

  describe('custom personas from settings', () => {
    it('should return 8 items when a custom persona is configured', () => {
      const customPersona: PersonaConfig = {
        id: 'custom1',
        label: 'Custom Persona',
        systemPrompt:
          'This is a custom persona system prompt that is long enough to pass validation and provides detailed mathematical instructions for custom research.',
        preferredSources: ['arxiv'],
      }
      const customManager = new PersonaManager(
        createMockConfigGetter([customPersona])
      )
      const personas = customManager.listPersonas()
      assert.equal(
        personas.length,
        8,
        `Expected 8 personas (7 built-in + 1 custom), got ${personas.length}`
      )
    })

    it('should return custom persona config via getPersona', () => {
      const customPersona: PersonaConfig = {
        id: 'custom1',
        label: 'Custom Persona',
        systemPrompt:
          'This is a custom persona system prompt that is long enough to pass validation and provides detailed mathematical instructions for custom research.',
        preferredSources: ['arxiv'],
      }
      const customManager = new PersonaManager(
        createMockConfigGetter([customPersona])
      )
      const persona = customManager.getPersona('custom1')
      assert.equal(persona.id, 'custom1')
      assert.equal(persona.label, 'Custom Persona')
      assert.ok(persona.systemPrompt.length > 0)
      assert.deepEqual(persona.preferredSources, ['arxiv'])
    })
  })

  describe('edge cases', () => {
    it('should throw for empty string id', () => {
      assert.throws(
        () => manager.getPersona(''),
        (err: unknown) => err instanceof Error
      )
    })

    it('should return built-in personas even when customPersonas returns undefined', () => {
      const undefinedConfigGetter = <T>(key: string, defaultValue?: T): T => {
        return defaultValue as T
      }
      const freshManager = new PersonaManager(undefinedConfigGetter)
      const personas = freshManager.listPersonas()
      assert.equal(personas.length, 7)
    })

    it('should handle customPersonas being an empty array', () => {
      const emptyManager = new PersonaManager(createMockConfigGetter([]))
      const personas = emptyManager.listPersonas()
      assert.equal(personas.length, 7)
    })

    it('each persona should have preferredSources as an array', () => {
      const personas = manager.listPersonas()
      for (const p of personas) {
        assert.ok(
          Array.isArray(p.preferredSources) || p.preferredSources === undefined,
          `Persona ${p.id} preferredSources should be array or undefined`
        )
      }
    })

    it('all built-in persona ids should be unique', () => {
      const personas = manager.listPersonas()
      const ids = personas.map((p: PersonaConfig) => p.id)
      const uniqueIds = new Set(ids)
      assert.equal(uniqueIds.size, ids.length, 'All persona ids should be unique')
    })

    it('should include all 6 expected built-in persona ids plus multi-agent', () => {
      const personas = manager.listPersonas()
      const ids = personas.map((p: PersonaConfig) => p.id)
      const expectedIds = [
        'algebraist',
        'analyst',
        'geometer',
        'topologist',
        'number-theorist',
        'logician',
        'multi-agent',
      ]
      for (const expectedId of expectedIds) {
        assert.ok(ids.includes(expectedId), `Expected persona id '${expectedId}' not found`)
      }
    })
  })
})
