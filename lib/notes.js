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
    //SELECT value as tag, count(value) as count FROM "Metadata" WHERE key = 'tags' GROUP BY value;
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
        res.send({tags: results})
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
                required: false,
                attributes:["id", "content", "updatedAt", "createdAt"]
            }
        ],
        raw: true
    }).then(results => {
        try {
            var notes = results.map((record, index, array) => {
                var id = record["Notes.id"]
                var id = models.Note.encodeNoteId(record["Notes.id"])
                var info = metaMarked(record["Notes.content"])
                var tags = []
                var owner = ""

                if (record.email) { owner = record.email }
                else if (record.profile) { owner = record.profile }

                if (info.meta == null){
                    return {
                        id: id,
                        text: "untitled",
                        tags: tags
                    }
                }
                if (info.meta.title == undefined) {
                    info.meta.title = "untitled"
                }
                if (info.meta.tags != undefined) {
                    tags = info.meta.tags.split(',').map((tag, index, array) => {
                        return tag.trim()
                    })
                }
                return {
                    id: id,
                    text: info.meta.title,
                    tags: tags,
                    owner: owner,
                    updated: record["Notes.updatedAt"],
                    created: record["Notes.createdAt"]
                }
            });
            res.send({notes: notes})
        } catch (err){
            logger.info(err)
            res.send({notes: []})
        }
    })
}

exports.tags = tags
exports.list = list
