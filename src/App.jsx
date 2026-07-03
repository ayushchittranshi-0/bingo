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

// All winnable lines (rows, columns, both diagonals).
function getLines(size) {
  const lines = []
  for (let r = 0; r < size; r++) {
    const cells = []
    for (let c = 0; c < size; c++) cells.push(r * size + c)
    lines.push(cells)
  }
  for (let c = 0; c < size; c++) {
    const cells = []
    for (let r = 0; r < size; r++) cells.push(r * size + c)
    lines.push(cells)
  }
  const d1 = []
  for (let i = 0; i < size; i++) d1.push(i * size + i)
  lines.push(d1)
  const d2 = []
  for (let i = 0; i < size; i++) d2.push(i * size + (size - 1 - i))
  lines.push(d2)
  return lines
}

// Letters revealed as lines complete. For 5x5 this spells BINGO.
function progressLetters(size) {
  const word = 'BINGO'
  if (size <= word.length) return word.slice(0, size).split('')
  return Array.from({ length: size }, (_, i) => word[i % word.length])
}

// Your board. Marks are coloured by whoever called the number; a completed
// line is stroked in green. Purely presentational + geometry measurement.
function Board({ size, numbers, callers, completedLines, onCellClick, disabled }) {
  const boardRef = useRef(null)
  const cellRefs = useRef([])
  const [segments, setSegments] = useState([])

  const inLineCells = useMemo(() => {
    const s = new Set()
    for (const cells of completedLines) for (const idx of cells) s.add(idx)
    return s
  }, [completedLines])

  const recompute = useCallback(() => {
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

  useLayoutEffect(() => { recompute() }, [recompute, size, numbers])
  useEffect(() => {
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [recompute])

  return (
    <div className="board-wrap">
      <div className="board" ref={boardRef} style={{ '--size': size }}>
        {numbers.map((num, index) => {
          const caller = callers[index]
          return (
            <button
              key={index}
              ref={(el) => { cellRefs.current[index] = el }}
              className={`cell ${caller ? `p${caller}` : ''} ${inLineCells.has(index) ? 'in-line' : ''}`}
              onClick={() => onCellClick(index)}
              disabled={disabled || caller != null}
            >
              {num}
            </button>
          )
        })}
      </div>
      <svg className="lines-overlay" aria-hidden="true">
        {segments.map((s, i) => (
          <line key={i} className="bingo-line" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        ))}
      </svg>
    </div>
  )
}

export default function App() {
  const [phase, setPhase] = useState('setup')   // 'setup' | 'playing'
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [playerCount, setPlayerCount] = useState(2) // 2..4
  const [myPlayer, setMyPlayer] = useState(1)   // 1..playerCount

  const [numbers, setNumbers] = useState([])
  const [callers, setCallers] = useState({})    // cell index -> player who called (1|2)
  const [currentTurn, setCurrentTurn] = useState(1) // Player 1 always calls first
  const [calls, setCalls] = useState([])        // { player, number }

  const lines = useMemo(() => getLines(size), [size])

  const handlePlayerCountChange = (count) => {
    setPlayerCount(count)
    if (myPlayer > count) setMyPlayer(1)
  }

  const startGame = () => {
    setNumbers(shuffledNumbers(size * size))
    setCallers({})
    setCurrentTurn(1)
    setCalls([])
    setPhase('playing')
  }

  const markedSet = useMemo(
    () => new Set(Object.keys(callers).map(Number)),
    [callers],
  )

  const completedLines = useMemo(
    () => lines.filter((cells) => cells.every((i) => markedSet.has(i))),
    [lines, markedSet],
  )

  const bingo = completedLines.length >= size
  const isMyTurn = currentTurn === myPlayer
  const lastCall = calls.length ? calls[calls.length - 1] : null

  const callNumber = (index) => {
    if (bingo || callers[index] != null) return
    const player = currentTurn
    const number = numbers[index]
    setCallers((prev) => ({ ...prev, [index]: player }))
    setCalls((prev) => [...prev, { player, number, index }])
    setCurrentTurn((player % playerCount) + 1) // rotate 1 -> 2 -> .. -> N -> 1
  }

  const undo = () => {
    if (calls.length === 0) return
    const last = calls[calls.length - 1]
    setCallers((prev) => {
      const next = { ...prev }
      delete next[last.index]
      return next
    })
    setCalls((prev) => prev.slice(0, -1))
    setCurrentTurn(last.player) // the last caller gets their turn back
  }

  const letters = useMemo(() => progressLetters(size), [size])

  // ---------- Setup screen ----------
  if (phase === 'setup') {
    return (
      <div className="app">
        <header className="header">
          <h1 className="title">B<span>I</span>N<span>G</span>O</h1>
          <p className="subtitle">Offline 2-player — each player uses their own board.</p>
        </header>

        <div className="setup">
          <label className="control-label wide">
            Grid size
            <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {SIZES.map((s) => (
                <option key={s} value={s}>{s} × {s}</option>
              ))}
            </select>
          </label>

          <label className="control-label wide">
            Number of players
            <select value={playerCount} onChange={(e) => handlePlayerCountChange(Number(e.target.value))}>
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>{n} players</option>
              ))}
            </select>
          </label>

          <div className="control-label wide">
            You are
            <div className="choice">
              {Array.from({ length: playerCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`choice-btn p${p} ${myPlayer === p ? 'selected' : ''}`}
                  onClick={() => setMyPlayer(p)}
                >
                  Player {p}
                </button>
              ))}
            </div>
          </div>

          <button className="new-game big" onClick={startGame}>Start Game</button>

          <p className="setup-hint">
            Player 1 calls first. On <b>your</b> turn, tap a number on your board to call it.
            On your opponent&apos;s turn, tap the number they call out. Complete {size} lines to shout <b>BINGO!</b>
          </p>
        </div>
      </div>
    )
  }

  // ---------- Playing screen ----------
  return (
    <div className="app">
      <header className="header">
        <h1 className="title">B<span>I</span>N<span>G</span>O</h1>
        <p className="subtitle">
          You are <span className={`you-tag p${myPlayer}`}>Player {myPlayer}</span> · complete {size} lines
        </p>
      </header>

      <div className="controls">
        <button className="new-game ghost" onClick={() => setPhase('setup')}>← New Game</button>
        <button className="new-game ghost" onClick={undo} disabled={calls.length === 0}>
          ↶ Undo
        </button>
      </div>

      <div className="turn-status">
        {bingo ? (
          <span className="turn-win">🎉 BINGO! You completed {size} lines!</span>
        ) : (
          <>
            {lastCall && (
              <span className="last-move">
                {lastCall.player === myPlayer ? 'You' : `Player ${lastCall.player}`} called <b>{lastCall.number}</b>
              </span>
            )}
            <span className={`whose-turn p${currentTurn}`}>
              {isMyTurn
                ? `Your turn (Player ${myPlayer}) — call a number`
                : `Player ${currentTurn}'s turn — tap their called number`}
            </span>
          </>
        )}
      </div>

      <div className="progress">
        {letters.map((ch, i) => (
          <span key={i} className={`progress-letter ${i < completedLines.length ? 'lit' : ''}`}>
            {ch}
          </span>
        ))}
        <span className="progress-count">{completedLines.length} / {size} lines</span>
      </div>

      <div className="boards">
        <div className="board-col">
          <Board
            size={size}
            numbers={numbers}
            callers={callers}
            completedLines={completedLines}
            onCellClick={callNumber}
            disabled={bingo}
          />
        </div>
      </div>

      {bingo && (
        <div className="win-overlay" role="dialog" aria-live="assertive">
          <div className="win-card">
            <div className="win-bingo">BINGO!</div>
            <div className="win-text">🎉 You got Bingo! 🎉</div>
            <p className="win-sub">You completed {size} lines. Call it out — first to bingo wins!</p>
            <button className="new-game" onClick={() => setPhase('setup')}>New Game</button>
          </div>
        </div>
      )}
    </div>
  )
}
