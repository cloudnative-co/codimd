'use strict'

var sequelize = require('sequelize')
var response = require('./response')
var models = require('./models')
var logger = require('./logger')

/*
 @brief     Dropdown List of Users
 */
function owners(req, res) {
    if (! req.isAuthenticated()) {
        return response.errorForbidden(res)
    }
    models.User.findAll({
    }).then(results => {
        try {
            var id = 0
            var data = results.map((record, index, array) => {
                try {
                    id++;
                    var owner = ""

                    if (record.email) {
                        owner = record.email
                    }
                    else if (record.profile) {
                        record.profile = JSON.parse(record.profile)
                        owner = record.profile.username
                    }
                    return {
                        id: id,
                        text: owner,
                    }
                } catch (err){
                    logger.info(err)
                    throw err
                }
            });
            res.send(data)
        } catch (err){
            logger.info(err)
            res.send([])
        }
    })
}
/*
 @brief     Dropdown List of Tags
 */
function tags(req, res) {
    if (! req.isAuthenticated()) {
        return response.errorForbidden(res)
    }
    models.Metadata.findAll({
        attributes: [
            ['value', 'text'],
        ],
        distinct: true,
        where: { key: 'tags' },
        group: ['value'],
        raw: true
    }).then(results => {
        try {
            var id = 0
            var data = results.map((record, index, array) => {
                try {
                    id++;
                    return {
                        id: id,
                        text: record.text,
                    }
                } catch (err){
                    logger.info(err)
                }
            });
            res.send(data)
        } catch (err){
            logger.info(err)
            res.send([])
        }
    })
}

exports.owners = owners
exports.tags = tags
