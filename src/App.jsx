import { useState, useMemo, useCallback, useRef, useLayoutEffect, useEffect } from 'react'

// Odd grid sizes only — 6x6 (even) is not allowed.
const SIZES = [3, 5, 7, 9, 11]
const DEFAULT_SIZE = 5

// Fisher–Yates shuffle of unique numbers 1..count
function shuffledNumbers(count) {
  const arr = Array.from({ length: count }, (_, i) => i + 1)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Return every completed line as an array of cell indices
// (full rows, full columns, and the two diagonals).
function getCompletedLines(size, marked) {
  const isMarked = (idx) => marked.has(idx)
  const lines = []

  // Rows
  for (let r = 0; r < size; r++) {
    const cells = []
    for (let c = 0; c < size; c++) cells.push(r * size + c)
    if (cells.every(isMarked)) lines.push(cells)
  }
  // Columns
  for (let c = 0; c < size; c++) {
    const cells = []
    for (let r = 0; r < size; r++) cells.push(r * size + c)
    if (cells.every(isMarked)) lines.push(cells)
  }
  // Main diagonal
  const d1 = []
  for (let i = 0; i < size; i++) d1.push(i * size + i)
  if (d1.every(isMarked)) lines.push(d1)
  // Anti-diagonal
  const d2 = []
  for (let i = 0; i < size; i++) d2.push(i * size + (size - 1 - i))
  if (d2.every(isMarked)) lines.push(d2)

  return lines
}

// Letters revealed as lines complete. For 5x5 this spells BINGO.
function progressLetters(size) {
  const word = 'BINGO'
  if (size <= word.length) return word.slice(0, size).split('')
  return Array.from({ length: size }, (_, i) => word[i % word.length])
}

export default function App() {
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [numbers, setNumbers] = useState(() => shuffledNumbers(DEFAULT_SIZE * DEFAULT_SIZE))
  const [marked, setMarked] = useState(() => new Set())

  const boardRef = useRef(null)
  const cellRefs = useRef([])
  const [segments, setSegments] = useState([])

  const newGame = useCallback((nextSize = size) => {
    setNumbers(shuffledNumbers(nextSize * nextSize))
    setMarked(new Set())
  }, [size])

  const handleSizeChange = (nextSize) => {
    setSize(nextSize)
    newGame(nextSize)
  }

  const toggleCell = (index) => {
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const completedLines = useMemo(
    () => getCompletedLines(size, marked),
    [size, marked],
  )

  // Cells that belong to at least one completed line — shaded green.
  const winningCells = useMemo(() => {
    const s = new Set()
    for (const line of completedLines) for (const idx of line) s.add(idx)
    return s
  }, [completedLines])

  const won = completedLines.length >= size
  const letters = useMemo(() => progressLetters(size), [size])

  // Measure pixel endpoints for each completed line so we can draw an
  // SVG stroke from the first to the last cell of the line.
  const recomputeSegments = useCallback(() => {
    const board = boardRef.current
    if (!board) return
    const b = board.getBoundingClientRect()
    const segs = completedLines
      .map((cells) => {
        const first = cellRefs.current[cells[0]]
        const last = cellRefs.current[cells[cells.length - 1]]
        if (!first || !last) return null
        const fr = first.getBoundingClientRect()
        const lr = last.getBoundingClientRect()
        return {
          x1: fr.left + fr.width / 2 - b.left,
          y1: fr.top + fr.height / 2 - b.top,
          x2: lr.left + lr.width / 2 - b.left,
          y2: lr.top + lr.height / 2 - b.top,
        }
      })
      .filter(Boolean)
    setSegments(segs)
  }, [completedLines])

  useLayoutEffect(() => {
    recomputeSegments()
  }, [recomputeSegments, size, numbers])

  useEffect(() => {
    window.addEventListener('resize', recomputeSegments)
    return () => window.removeEventListener('resize', recomputeSegments)
  }, [recomputeSegments])

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">B<span>I</span>N<span>G</span>O</h1>
        <p className="subtitle">Complete {size} lines on a {size}×{size} grid to win!</p>
      </header>

      <div className="controls">
        <label className="control-label">
          Grid size
          <select
            value={size}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>{s} × {s}</option>
            ))}
          </select>
        </label>
        <button className="new-game" onClick={() => newGame()}>New Game</button>
      </div>

      <div className="progress">
        {letters.map((ch, i) => (
          <span
            key={i}
            className={`progress-letter ${i < completedLines.length ? 'lit' : ''}`}
          >
            {ch}
          </span>
        ))}
        <span className="progress-count">{completedLines.length} / {size} lines</span>
      </div>

      <div className="board-wrap">
        <div
          className={`board ${won ? 'board-won' : ''}`}
          ref={boardRef}
          style={{ '--size': size }}
        >
          {numbers.map((num, index) => {
            const isMarked = marked.has(index)
            const isWinning = winningCells.has(index)
            return (
              <button
                key={index}
                ref={(el) => { cellRefs.current[index] = el }}
                className={`cell ${isMarked ? 'marked' : ''} ${isWinning ? 'winning' : ''}`}
                onClick={() => toggleCell(index)}
                disabled={won}
              >
                {num}
              </button>
            )
          })}
        </div>

        <svg className="lines-overlay" aria-hidden="true">
          {segments.map((s, i) => (
            <line
              key={i}
              className="bingo-line"
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
            />
          ))}
        </svg>
      </div>

      {won && (
        <div className="win-overlay" role="dialog" aria-live="assertive">
          <div className="win-card">
            <div className="win-bingo">BINGO!</div>
            <div className="win-text">🎉 Winner! 🎉</div>
            <p className="win-sub">You completed {size} lines.</p>
            <button className="new-game" onClick={() => newGame()}>Play Again</button>
          </div>
        </div>
      )}
    </div>
  )
}
