function scoreBand(s: number): string {
  if (s >= 80) return 'high'
  if (s >= 50) return 'med'
  return 'low'
}

export default function ScorePill({ score }: { score: number | null }) {
  if (score == null) return <span className="score-pill none">—</span>
  return <span className={`score-pill ${scoreBand(score)}`}>{score}</span>
}
