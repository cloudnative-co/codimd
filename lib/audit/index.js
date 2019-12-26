const config = require('../config')
const logger = require('../logger')
const models = require('../models')
const {promisify} = require('util');

var audit = {}

audit.logger = function(data) {
    if (config.auditLog = 'journal'){
        logger.info(JSON.stringify(data))
    }
}


audit.info = function(note, user, event, data) {
    if (! config.allowAuditLog) {
        return
    }
    var result = {
        event: event
    }
    if (data) {
        result.data = data
    }
    if (note) {
        result['note'] = {
            id: note.id,
            title: note.title,
            alias: note.alias,
            permission: note.permission,
            owner: note.owner,
            lastchangeuser: note.lastchangeuser,
            authorship: note.authorship,
            owner: note.ownerprofile,
            authors: note.authors,
            users: note.users
        }
    }
    if (user) {
        delete user.id
        delete user.color
        delete user.cursor
        delete user.idle
        delete user.type
        delete user.photo
        result['user'] = user
    }
    audit.logger(result)
}

audit.request = function(event, req, res, next, user) {
    if (! config.allowAuditLog) {
        if (next) {
            next()
        }
        return
    }
    var data = {}
    var headers = req.headers
    var cookies = {}
    if (headers.cookies) {
        const tmp = req.headers.cookie.split(";")
        for (var i in tmp ){
            const cook = tmp[i].split("=")
            cookies[cook[0].trim()] = cook[1].trim()
        }
    }
    var userdata = {
        address: headers["x-forwarded-for"],
        "user-agent": headers["user-agent"],
        login: cookies.loginstate
    }
    var data = {
        event: event,
        user: userdata
    }
    if (user) {
        var profile = models.User.getProfile(user)
        userdata.id = user.id
        userdata.name = profile.name
        audit.logger(data)
    } else {
        models.User.findOne({where: {id: cookies.userid}}).then(user => {
            if (user) {
                var profile = models.User.getProfile(user)
                userdata.id = user.id
                userdata.name = profile.name
                return
            }
            return
        }).catch(err => {logger.error(err)})
        .finally(() => {
            audit.logger(data)
        })
    }
    if (next) {
        next()
    }
}

module.exports = audit
