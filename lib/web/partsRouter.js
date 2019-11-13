'use strict'

const Router = require('express').Router

const parts = require('../parts')
const partsRouter = module.exports = Router()

// get owner dropdown list
partsRouter.get('/parts/owners', parts.owners)

partsRouter.get('/parts/tags', parts.tags)
