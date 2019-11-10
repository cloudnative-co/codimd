'use strict'

const Router = require('express').Router

//const { urlencodedParser } = require('./utils')
const notes = require('../notes')
const notesRouter = module.exports = Router()

// get notes
notesRouter.get('/tags', notes.tags)
// get notes
notesRouter.get('/notes', notes.list)

// delete notes by note id
//notesRouter.delete('/notes/:noteId', notes.notesDelete)
