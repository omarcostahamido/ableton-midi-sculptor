const assert = require('assert')
import Note from '../note'
import SwapTransformer from '../transformers/swap-transformer'

describe('SwapTransformer', () => {

  let swapTransformer
  let notes
  beforeEach(() => {
    swapTransformer = new SwapTransformer()
  })

  function makeNotes(...values) {
    return values.map(val => new Note({ start: val, pitch: val, velocity: val, duration: val }))
  }

  function useNotes(...values) {
    notes = makeNotes(...values)
    swapTransformer.notes = notes
  }

  function clone(notes) {
    return notes.map(n => n.clone())
  }

  describe('rotate()', () => {

    context('target: notes, groupBy: all', () => {
      beforeEach(() => {
        useNotes(1,2,3,4)
        swapTransformer.target = 'notes'
        swapTransformer.groupBy('all')
      })

      it('rotates forward through the note list when given a positive percentage value', () => {
        const expected = clone(notes).slice(1).concat(notes.slice(0,1))
        // rotating notes changes everything except the start time:
        expected.forEach((note, index) => note.start = notes[index].start)
        assert.deepEqual(swapTransformer.rotate(1/notes.length), expected)
      })

      it('rotate backwards through the note list when given a negative percentage value', () => {
        const expected = clone(notes).slice(-1).concat(notes.slice(0,-1))
        // rotating notes changes everything except the start time:
        expected.forEach((note, index) => note.start = notes[index].start)
        assert.deepEqual(swapTransformer.rotate(-1/notes.length), expected)
      })

      it('is idempotent', () => {
        const expected = clone(notes).slice(1).concat(notes.slice(0,1))
        // rotating notes changes everything except the start time:
        expected.forEach((note, index) => note.start = notes[index].start)
        const actual1 = swapTransformer.rotate(1/notes.length)
        assert.deepEqual(actual1, expected)
        const actual2 = swapTransformer.rotate(1/notes.length)
        assert.deepEqual(actual2, expected)
      })

      it('can rotate more than one position', () => {
        const expected = clone(notes).slice(3).concat(notes.slice(0,3))
        // rotating notes changes everything except the start time:
        expected.forEach((note, index) => note.start = notes[index].start)
        const actual = swapTransformer.rotate(3/notes.length)
        assert.deepEqual(actual, expected)
      })

      it('can rotate with a value > notes.length and wraps around', () => {
        const expected = clone(notes).slice(3).concat(notes.slice(0,3))
        // rotating notes changes everything except the start time:
        expected.forEach((note, index) => note.start = notes[index].start)
        const actual = swapTransformer.rotate(1 + 3/notes.length)
        assert.deepEqual(actual, expected)
      })

      it('can rotate with a value < -notes.length and wraps around', () => {
        const expected = clone(notes).slice(-3).concat(notes.slice(0,-3))
        // rotating notes changes everything except the start time:
        expected.forEach((note, index) => note.start = notes[index].start)
        const actual = swapTransformer.rotate(-1 - 3/notes.length)
        assert.deepEqual(actual, expected)
      })
    })

    context('target: notes, groupBy: notes, size: 3', () => {
      beforeEach(() => {
        useNotes(1,2,3,4,5,6)
        swapTransformer.target = 'notes'
        swapTransformer.groupBy('notes', 3)
      })

      it('rotates within the group size', () => {
        const expected = makeNotes(2,3,1,5,6,4)
        expected.forEach((note, index) => note.start = notes[index].start)
        const actual = swapTransformer.rotate(1/notes.length)
        assert.deepEqual(actual, expected)
      })
    })
  })
})
