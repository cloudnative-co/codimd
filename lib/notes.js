'use strict'


var response = require('./response')
var models = require('./models')
var logger = require('./logger')
var sequelize = require('sequelize')
var metaMarked = require('@hackmd/meta-marked')

// Count of Tags
function tags(req, res) {
    if (! req.isAuthenticated()) {
        return response.errorForbidden(res)
    }
    models.Metadata.findAll({
        attributes: [
            ['value', 'tag'],
            [sequelize.fn('count', sequelize.col('value')), 'count']
        ],
        where: {
            key: 'tags'
        },
        group: ['value'],
    }).then(results => {
        res.send(results)
    })
}

// List of Nonts
function list(req, res) {
    if (! req.isAuthenticated()) {
        return response.errorForbidden(res)
    }
    models.User.findAll({
        include:[
            {
                model: models.Note,
                required: true,
                attributes:["id", "content", "updatedAt", "createdAt"],
                on: {
                    col: sequelize.where(sequelize.col('User.id'), "=", sequelize.col("Notes.ownerId"))
                }
            }
        ],
        raw: true
    }).then(results => {
        try {
            var notes = results.map((record, index, array) => {
                try {
                    var id = record["Notes.id"]
                    var id = models.Note.encodeNoteId(record["Notes.id"])
                    var info = metaMarked(record["Notes.content"])
                    var tags = []
                    var owner = ""
                    var title = "untitled"

                    if (record.email) { owner = record.email }
                    else if (record.profile) {
                        record.profile = JSON.parse(record.profile)
                        owner = record.profile.username
                    }
                    if (info.meta){
                        if (info.meta.title) {
                            title = info.meta.title
                        }
                        if (info.meta.tags != undefined && (typeof info.meta.tags) == 'string') {
                            tags = info.meta.tags.split(',').map((tag, index, array) => {
                                return tag.trim()
                            })
                        }
                    }
                    return {
                        id: id,
                        text: title,
                        tags: tags,
                        owner: owner,
                        updated: record["Notes.updatedAt"],
                        created: record["Notes.createdAt"]
                    }
                } catch (err){
                    logger.info(err)
                    throw err
                }
            });
            console.log(notes.length)
            res.send({notes: notes})
        } catch (err){
            logger.info(err)
            res.send({notes: []})
        }
    })
}

exports.tags = tags
exports.list = list
