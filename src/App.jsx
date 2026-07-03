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

// Indices on `board` whose value has been called.
function markedIndexSet(board, called) {
  const s = new Set()
  for (let i = 0; i < board.length; i++) if (called.has(board[i])) s.add(i)
  return s
}

// Return every completed line as an array of cell indices
// (full rows, full columns, and the two diagonals).
function getCompletedLines(size, marked) {
  const isMarked = (idx) => marked.has(idx)
  const lines = []

  for (let r = 0; r < size; r++) {
    const cells = []
    for (let c = 0; c < size; c++) cells.push(r * size + c)
    if (cells.every(isMarked)) lines.push(cells)
  }
  for (let c = 0; c < size; c++) {
    const cells = []
    for (let r = 0; r < size; r++) cells.push(r * size + c)
    if (cells.every(isMarked)) lines.push(cells)
  }
  const d1 = []
  for (let i = 0; i < size; i++) d1.push(i * size + i)
  if (d1.every(isMarked)) lines.push(d1)
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

function makeBoards(count, size) {
  return Array.from({ length: count }, () => shuffledNumbers(size * size))
}

// A single grid: draws a stroke through each completed line and
// shades winning cells. Purely presentational + geometry measurement.
function Board({ size, numbers, marked, completedLines, ownerClass, onCellClick, cellDisabled }) {
  const boardRef = useRef(null)
  const cellRefs = useRef([])
  const [segments, setSegments] = useState([])

  const winningCells = useMemo(() => {
    const s = new Set()
    for (const line of completedLines) for (const idx of line) s.add(idx)
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
          const isMarked = marked.has(index)
          const isWinning = winningCells.has(index)
          return (
            <button
              key={index}
              ref={(el) => { cellRefs.current[index] = el }}
              className={`cell ${isMarked ? ownerClass : ''} ${isWinning ? 'winning' : ''}`}
              onClick={() => onCellClick(index)}
              disabled={cellDisabled(index, isMarked)}
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
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [playerCount, setPlayerCount] = useState(2)
  const [boards, setBoards] = useState(() => makeBoards(2, DEFAULT_SIZE))
  const [called, setCalled] = useState(() => new Set())   // called number values
  const [currentPlayer, setCurrentPlayer] = useState(1)
  const [moves, setMoves] = useState([])                  // { player, number }

  const resetPlay = useCallback((count = playerCount, nextSize = size) => {
    setBoards(makeBoards(count, nextSize))
    setCalled(new Set())
    setCurrentPlayer(1)
    setMoves([])
  }, [playerCount, size])

  const newGame = useCallback(() => resetPlay(), [resetPlay])

  const handleSizeChange = (nextSize) => {
    setSize(nextSize)
    resetPlay(playerCount, nextSize)
  }
  const handlePlayerCountChange = (count) => {
    setPlayerCount(count)
    resetPlay(count, size)
  }

  // Completed lines per board, derived from the shared called-number set.
  const boardLines = useMemo(
    () => boards.map((b) => getCompletedLines(size, markedIndexSet(b, called))),
    [boards, size, called],
  )
  const lineCounts = boardLines.map((l) => l.length)

  // Outcome derived from state — captures a simultaneous draw naturally,
  // since a single called number is marked on every board at once.
  const result = useMemo(() => {
    if (playerCount === 1) {
      return lineCounts[0] >= size ? { type: 'win', player: 1 } : null
    }
    const p1done = lineCounts[0] >= size
    const p2done = lineCounts[1] >= size
    if (p1done && p2done) return { type: 'draw' }
    if (p1done) return { type: 'win', player: 1 }
    if (p2done) return { type: 'win', player: 2 }
    return null
  }, [playerCount, lineCounts, size])

  const gameOver = result != null

  const callNumber = (player, index) => {
    if (gameOver) return
    if (playerCount === 1) {
      // Solo: toggle the number on/off.
      const value = boards[0][index]
      setCalled((prev) => {
        const next = new Set(prev)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        return next
      })
      return
    }
    // Two players: only the active player may call, from their own board.
    if (player !== currentPlayer) return
    const value = boards[player - 1][index]
    if (called.has(value)) return
    setCalled((prev) => new Set(prev).add(value))
    setMoves((prev) => [...prev, { player, number: value }])
    setCurrentPlayer(player === 1 ? 2 : 1)
  }

  const letters = useMemo(() => progressLetters(size), [size])
  const lastMove = moves.length ? moves[moves.length - 1] : null

  const renderColumn = (boardIndex) => {
    const player = boardIndex + 1
    const numbers = boards[boardIndex]
    const marked = markedIndexSet(numbers, called)
    const ownerClass = playerCount === 1 ? 'marked' : `p${player}`
    const active = playerCount === 1 || currentPlayer === player
    return (
      <div className="board-col" key={boardIndex}>
        {playerCount === 2 && (
          <div className={`board-label p${player} ${active && !gameOver ? 'active' : ''}`}>
            Player {player}
          </div>
        )}
        <div className="progress">
          {letters.map((ch, i) => (
            <span key={i} className={`progress-letter ${i < lineCounts[boardIndex] ? 'lit' : ''}`}>
              {ch}
            </span>
          ))}
          <span className="progress-count">{lineCounts[boardIndex]} / {size} lines</span>
        </div>
        <Board
          size={size}
          numbers={numbers}
          marked={marked}
          completedLines={boardLines[boardIndex]}
          ownerClass={ownerClass}
          onCellClick={(idx) => callNumber(player, idx)}
          cellDisabled={(idx, isMarked) =>
            gameOver || (playerCount === 2 && (!active || isMarked))
          }
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">B<span>I</span>N<span>G</span>O</h1>
        <p className="subtitle">Complete {size} lines on a {size}×{size} grid to win!</p>
      </header>

      <div className="controls">
        <label className="control-label">
          Grid size
          <select value={size} onChange={(e) => handleSizeChange(Number(e.target.value))}>
            {SIZES.map((s) => (
              <option key={s} value={s}>{s} × {s}</option>
            ))}
          </select>
        </label>
        <label className="control-label">
          Players
          <select value={playerCount} onChange={(e) => handlePlayerCountChange(Number(e.target.value))}>
            <option value={1}>1 Player</option>
            <option value={2}>2 Players</option>
          </select>
        </label>
        <button className="new-game" onClick={newGame}>New Game</button>
      </div>

      {playerCount === 2 && (
        <div className="turn-panel">
          <div className="turn-status">
            {gameOver ? (
              result.type === 'draw' ? (
                <span className="turn-draw">🤝 It&apos;s a draw!</span>
              ) : (
                <span className="turn-win">🏆 Player {result.player} wins!</span>
              )
            ) : (
              <>
                {lastMove && (
                  <span className="last-move">
                    Player {lastMove.player} chose <b>{lastMove.number}</b>
                  </span>
                )}
                <span className={`whose-turn p${currentPlayer}`}>
                  Player {currentPlayer}&apos;s turn — pick a number
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className={`boards ${playerCount === 2 ? 'two' : ''}`}>
        {boards.map((_, i) => renderColumn(i))}
      </div>

      {gameOver && (
        <div className="win-overlay" role="dialog" aria-live="assertive">
          <div className="win-card">
            {result.type === 'draw' ? (
              <>
                <div className="win-bingo draw">DRAW!</div>
                <div className="win-text">🤝 It&apos;s a tie!</div>
                <p className="win-sub">Both players completed {size} lines at once.</p>
              </>
            ) : (
              <>
                <div className="win-bingo">BINGO!</div>
                <div className="win-text">
                  {playerCount === 2 ? `🎉 Player ${result.player} Wins! 🎉` : '🎉 Winner! 🎉'}
                </div>
                <p className="win-sub">Completed {size} lines.</p>
              </>
            )}
            <button className="new-game" onClick={newGame}>Play Again</button>
          </div>
        </div>
      )}
    </div>
  )
}
