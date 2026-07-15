// Spawn Auditor decision logic lifted from agents/src/spawn-auditor.ts.

export type AuditVerdict = 'APPROVE' | 'BLOCK' | 'NEEDS_REVIEW'

export interface SpawnDecision {
  verdict: AuditVerdict
  confidence: number
  rationale: string
  remediations: string[]
  verified: boolean | null
  contextChars: number
  postMortemCount: number
}

function textOf(value: unknown): string {
  try {
    return JSON.stringify(value).toLowerCase()
  } catch {
    return String(value).toLowerCase()
  }
}

export function pickContextLength(context: unknown): number {
  if (!context || typeof context !== 'object') return 0
  const obj = context as Record<string, unknown>
  return typeof obj.context === 'string' ? obj.context.length : 0
}

export function countPostMortems(failureAnalysis: unknown): number {
  if (!failureAnalysis || typeof failureAnalysis !== 'object') return 0
  const obj = failureAnalysis as Record<string, unknown>
  if (Array.isArray(obj.postMortems)) return obj.postMortems.length
  if (Array.isArray(obj.ancestors)) return obj.ancestors.length
  const data = obj.data
  if (data && typeof data === 'object') return countPostMortems(data)
  return 0
}

export function verifierValue(verifier: unknown): boolean | null {
  if (!verifier || typeof verifier !== 'object') return null
  const obj = verifier as Record<string, unknown>
  return typeof obj.verified === 'boolean' ? obj.verified : null
}

export function decideSpawnAudit(inputs: {
  failureAnalysis: unknown
  lineageContext: unknown
  verifier: unknown
}): SpawnDecision {
  const verified = verifierValue(inputs.verifier)
  const contextChars = pickContextLength(inputs.lineageContext)
  const postMortemCount = countPostMortems(inputs.failureAnalysis)
  const text = textOf(inputs.failureAnalysis)
  const criticalTerms = ['exploit', 'critical', 'compromise', 'unsafe', 'drain', 'reentrancy']

  if (criticalTerms.some((t) => text.includes(t))) {
    return {
      verdict: 'BLOCK',
      confidence: 84,
      rationale:
        'Failure analysis contains critical safety language; deployment should be blocked until remediated.',
      remediations: [
        'Review the critical failure records before promotion.',
        'Regenerate lineage context after remediation.',
        'Re-run decision-hash verification with the final deployment hash.',
      ],
      verified,
      contextChars,
      postMortemCount,
    }
  }

  // failureCount is computed by the runner from a separate scan; without it,
  // approximate via postMortemCount === 0 as the gate. Acceptable for browser
  // demo because the failure analyst skill returns the same shape both ways.
  const failureCount = postMortemCount === 0 ? 0 : postMortemCount

  if (verified === true && contextChars > 0 && failureCount === 0) {
    return {
      verdict: 'APPROVE',
      confidence: postMortemCount > 0 ? 76 : 86,
      rationale:
        'Decision hash is present on-chain and lineage context is available for operator review.',
      remediations:
        postMortemCount > 0
          ? ['Carry forward the listed lineage constraints into the deployment runbook.']
          : ['Archive this audit digest with the deployment record.'],
      verified,
      contextChars,
      postMortemCount,
    }
  }

  if (verified === false) {
    return {
      verdict: 'NEEDS_REVIEW',
      confidence: 68,
      rationale:
        'The decision hash was not found in the scanned on-chain range. This is expected for the default demo hash, but it blocks automatic approval.',
      remediations: [
        'Provide a known deployment decision hash through SPAWN_AUDITOR_DECISION_HASH.',
        'Confirm the contract address points to the ChildAgent or deployment contract that emitted the decision event.',
        'Re-run the auditor before promotion.',
      ],
      verified,
      contextChars,
      postMortemCount,
    }
  }

  return {
    verdict: 'NEEDS_REVIEW',
    confidence: 45,
    rationale:
      'Audit inputs were incomplete because one or more paid skills failed or returned no verifier field.',
    remediations: [
      'Check partial-run failures in this digest.',
      'Re-run once the affected Spawn skill endpoint is healthy.',
    ],
    verified,
    contextChars,
    postMortemCount,
  }
}
