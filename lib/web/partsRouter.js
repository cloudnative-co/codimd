'use strict'

const Router = require('express').Router

const parts = require('../parts')
const box = require('../box')
const partsRouter = module.exports = Router()

// get owner dropdown list
partsRouter.get('/parts/owners', parts.owners)

partsRouter.get('/parts/tags', parts.tags)

partsRouter.get('/box/embed', function(req, res) {
    var w = 800;
    var h = 550;
    if (req.query.hight) { h = req.query.hight }
    if (req.query.width) { w = req.query.width }
    box.embed(req.query.id, function(url){
        if (url){
            var embed = "<iframe src=\"" + url + '" width="'+ w +'" height="' + h + '" frameborder="0" allowfullscreen webkitallowfullscreen msallowfullscreen></iframe>'
            res.send(embed)
        } else {
            res.send("")
        }
    })
})
