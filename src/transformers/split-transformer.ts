import Transformer from './transformer'
import Note from '../note'
// import { log } from '../logger'

export type SplitType = 'time' | 'note' | 'euclid' | 'exp'
export type SplitEnvelopeType = 'none' | 'fade-out' | 'fade-in' | 'ramp-up' | 'ramp-down'

const splitInTime = (oldNote: Note, timeBetweenNotes: number): Note[] => {
  const notes: Note[] = []
  for (let t = 0; t < oldNote.duration; t += timeBetweenNotes) {
    const note = oldNote.clone()
    note.start = oldNote.start + t
    if (t + timeBetweenNotes >= oldNote.duration) { // last note, don't go beyond the existing end of the note:
      note.duration = oldNote.duration - t
    } else {
      note.duration = timeBetweenNotes
    }
    notes.push(note)
  }
  return notes
}

const splitEuclid = (oldNote: Note, pulses: number, total: number): Note[] => {
  const notes: Note[] = []
  const segmentDuration = oldNote.duration / total
  let note = oldNote.clone()
  let numSegments = 0
  // To get the longest segment first, we have to run this loop in reverse
  let pulseCount = pulses
  let nextPulse = Math.floor(--pulseCount / pulses * total)
  for (let i = total; i >= 0; i--) {
    if (i > nextPulse) {
      numSegments++
    } else { // end of pulse
      note.duration = numSegments * segmentDuration
      notes.push(note)
      note = oldNote.clone()
      note.start = note.start + (total - i) * segmentDuration
      numSegments = 1
      pulseCount--
      nextPulse = Math.floor(pulseCount / pulses * total)
    }
  }
  return notes
}

const splitExponentially = (oldNote: Note, notesPerDivision: number, divisions: number): Note[] => {
  const notes: Note[] = []
  let start = oldNote.start
  for (let d = 0; d < divisions; d++) {
    let divisionDuration = oldNote.duration / Math.pow(2, d + 1)
    let numNotes = notesPerDivision
    if (d === divisions - 1) {
      // last division has to double the time and number of notes to fill up the original duration
      divisionDuration *= 2
      numNotes *= 2
    }
    const duration = divisionDuration / numNotes
    for (let n = 0; n < numNotes; n++) {
      const note = oldNote.clone()
      note.duration = duration
      note.start = start + duration * n
      notes.push(note)
    }
    start += divisionDuration
  }
  return notes
}

const applyGateAndEnvelope = (notes: Note[], gate: number, envelope: string) => {
  const length = notes.length
  if (!length) return
  const deltaFromMax = 127 - notes[0].velocity
  notes.forEach((note, index) => {
    note.duration *= gate
    switch (envelope) {
      case 'fade-out': note.velocity *= (length - index) / length
        break
      case 'fade-in': note.velocity *= (index + 1) / length
        break
      case 'ramp-down': note.velocity += deltaFromMax * (length - index) / length
        break
      case 'ramp-up': note.velocity += deltaFromMax * (index + 1) / length
    }
  })
}

export default class SplitTransformer extends Transformer {

  private previousSplitNotes: Note[] = []
  private previousOldNotes: ReadonlyArray<Note> = []
  private splitType = 'note'
  private time = 1
  private number = 2
  private euclid = [1, 1] // [pulses, total]
  private exponential = [4, 4] // [notesBeforeDivision, divisions]
  private start = 0
  private end = 1
  gate = 1
  envelope = 'none'

  set notes(notes: Note[]) {
    super.setNotes(notes)
    this.newNotes = [] // splitTilt() uses this to know if it needs to split
  }

  setSplitType(type: SplitType, amount1: number, amount2: number = 1) {
    this.splitType = type
    if (type === 'time') {
      this.time = amount1
    } else if (type === 'note') {
      this.number = amount1
    } else if (type === 'euclid') {
      this.euclid = [amount1, amount2]
    } else if (type === 'exp') {
      this.exponential = [amount1, amount2]
    }
  }

  isResplit() {
    const { oldNotes, previousSplitNotes } = this
    return (oldNotes.length === previousSplitNotes.length) &&
      !oldNotes.find((note, index) => !note.equals(previousSplitNotes[index], true)) // can't find an unequal note (ignoring duration)
  }

  private splitWith(splitter: (note: Note) => Note[]) {
    const { oldNotes, gate, envelope, previousOldNotes } = this
    // Go back to original notes when splitting multiple times in a row (for usability)
    const notesToSplit = this.isResplit() ? previousOldNotes : oldNotes
    // Consider only spitting the first note, or joining consecutive notes before splitting...
    let notes: Note[] = []
    for (const note of notesToSplit) {
      const splitNotes = splitter(note)
      applyGateAndEnvelope(splitNotes, gate, envelope)
      notes = notes.concat(splitNotes)
    }
    this.previousOldNotes = notesToSplit
    this.previousSplitNotes = notes
    return notes
  }

  split(): Note[] {
    const { splitType, time, number, euclid: [pulses, total], exponential: [notesBeforeDivision, divisions] } = this
    switch (splitType) {
      case 'time': return this.splitWith(note => splitInTime(note, time))
      case 'note': return this.splitWith(note => splitInTime(note, (note.duration / number)))
      case 'euclid': return this.splitWith(note => splitEuclid(note, pulses, total))
      case 'exp': return this.splitWith(note => splitExponentially(note, notesBeforeDivision, divisions))
      default: return this.newNotes
    }
  }

  splitTilt(amount: number): Note[] {
    if (!this.newNotes.length) {
      const notes = this.split().map(note => note.clone())
      this.oldNotes = notes
      this.newNotes = notes.map(note => note.clone())
      this.previousSplitNotes = this.newNotes // so isResplit() will still work after tilting
      this.start = Math.min(...notes.map(note => note.start))
      this.end = Math.max(...notes.map(note => note.start + note.duration))
    }
    const { oldNotes, newNotes, start, end } = this
    if (amount === 0) return newNotes
    let power: number
    if (amount < 0) {
      power = 1 - amount * 2
    } else {
      power = 1 / (1 + amount * 2)
    }
    const totalDuration = end - start
    oldNotes.forEach((note, index) => {
      const normalizedStart = (note.start - start) / totalDuration
      const mapped = Math.pow(normalizedStart, power)
      newNotes[index].start = mapped * totalDuration + start
    })
    return newNotes
  }
}
