'use strict'
// history
// external modules
var LZString = require('@hackmd/lz-string')

// core
var config = require('./config')
var logger = require('./logger')
var response = require('./response')
var models = require('./models')


function tagCount(req, res) {
    if (req.isAuthenticated()) {
        var sql = "SELECT data->'id' as id, data->'tags' as tags FROM (SELECT json_array_elements(history::json) AS data FROM \"Users\") as history"
        models.sequelize.query(sql)
        .spread((history, metadata) => {
            var ids = []
            var result = {}
            for(var i in history) {
                var row = history[i];
                var tags = row.tags
                var id = row.id
                if (ids.indexOf(id) >= 0){
                    continue
                }
                ids.push(id);
                for (var i in tags) {
                    var tag = tags[i]
                    if (result[tag]) {
                        result[tag]++;
                    } else {
                        result[tag] = 1;
                    }
                }
            }
            res.send({
                tags: result
            })
        })
        .catch(function (err) {
            return response.errorInternalError(res)
        })
    } else {
        return response.errorForbidden(res)
    }
}

function getAllHistory(callback) {
  var history = {}
  var sql = "SELECT data->'id' as id, data->'text' as text, data->'tags' as tags FROM (SELECT json_array_elements(history::json) AS data FROM \"Users\") as history"
  models.sequelize.query(sql).spread((history, metadata) => {
    for(var i in history) {
        var row = history[i];
        const base64UuidLength = ((4 * 36) / 3) - 1
        if (!(history[i].id.length > base64UuidLength)) {
          continue
        }
        try {
          const id = LZString.decompressFromBase64(history[i].id)
          if (id && models.Note.checkNoteIdValid(id)) {
            history[i].id = models.Note.encodeNoteId(id)
          }
        } catch (err) {
          // most error here comes from LZString, ignore
          if (err.message === 'Cannot read property \'charAt\' of undefined') {
            logger.warning('Looks like we can not decode "' + history[i].id + '" with LZString. Can be ignored.')
          } else {
            logger.error(err)
          }
        }
    }
    history = parseHistoryToObject(history)
    return callback(null, history)
  }).catch(function (err) {
    logger.error('read history failed: ' + err)
    return callback(err, null)
  })
}

function getUserHistory(userid, callback) {
  models.User.findOne({
    where: {
      id: userid
    }
  }).then(function (user) {
    if (!user) {
      return callback(null, null)
    }
    var history = {}
    if (user.history) {
      history = JSON.parse(user.history)
      for (let i = 0, l = history.length; i < l; i++) {
        const base64UuidLength = ((4 * 36) / 3) - 1
        if (!(history[i].id.length > base64UuidLength)) {
          continue
        }
        try {
          const id = LZString.decompressFromBase64(history[i].id)
          if (id && models.Note.checkNoteIdValid(id)) {
            history[i].id = models.Note.encodeNoteId(id)
          }
        } catch (err) {
          // most error here comes from LZString, ignore
          if (err.message === 'Cannot read property \'charAt\' of undefined') {
            logger.warning('Looks like we can not decode "' + history[i].id + '" with LZString. Can be ignored.')
          } else {
            logger.error(err)
          }
        }
      }
    }
    if (config.debug) {
      logger.info('read history success: ' + user.id)
    }
    history = parseHistoryToObject(history)
    return callback(null, history)
  }).catch(function (err) {
    logger.error('read history failed: ' + err)
    return callback(err, null)
  })
}

function getHistory (userid, callback) {
    if (config.db.dialect == "postgres" && config.allowTeamHistory){
        return getAllHistory(callback)
    } else {
        return getUserHistory(userid, callback)
    }
}

function setHistory (userid, history, callback) {
  models.User.update({
    history: JSON.stringify(parseHistoryToArray(history))
  }, {
    where: {
      id: userid
    }
  }).then(function (count) {
    return callback(null, count)
  }).catch(function (err) {
    logger.error('set history failed: ' + err)
    return callback(err, null)
  })
}

function updateHistory (userid, noteId, document, time) {
  if (userid && noteId && typeof document !== 'undefined') {
    getHistory(userid, function (err, history) {
      if (err || !history) return
      if (!history[noteId]) {
        history[noteId] = {}
      }
      var noteHistory = history[noteId]
      var noteInfo = models.Note.parseNoteInfo(document)
      noteHistory.id = noteId
      noteHistory.text = noteInfo.title
      noteHistory.time = time || Date.now()
      noteHistory.tags = noteInfo.tags
      setHistory(userid, history, function (err, count) {
        if (err) {
          logger.log(err)
        }
      })
    })
  }
}

function parseHistoryToArray (history) {
  var _history = []
  Object.keys(history).forEach(function (key) {
    var item = history[key]
    _history.push(item)
  })
  return _history
}

function parseHistoryToObject (history) {
  var _history = {}
  for (var i = 0, l = history.length; i < l; i++) {
    var item = history[i]
    _history[item.id] = item
  }
  return _history
}

function historyGet (req, res) {
  if (req.isAuthenticated()) {
    getHistory(req.user.id, function (err, history) {
      if (err) return response.errorInternalError(res)
      if (!history) return response.errorNotFound(res)
      res.send({
        history: parseHistoryToArray(history)
      })
    })
  } else {
    return response.errorForbidden(res)
  }
}

function historyPost (req, res) {
  if (req.isAuthenticated()) {
    var noteId = req.params.noteId
    if (!noteId) {
      if (typeof req.body['history'] === 'undefined') return response.errorBadRequest(res)
      if (config.debug) { logger.info('SERVER received history from [' + req.user.id + ']: ' + req.body.history) }
      try {
        var history = JSON.parse(req.body.history)
      } catch (err) {
        return response.errorBadRequest(res)
      }
      if (Array.isArray(history)) {
        setHistory(req.user.id, history, function (err, count) {
          if (err) return response.errorInternalError(res)
          res.end()
        })
      } else {
        return response.errorBadRequest(res)
      }
    } else {
      if (typeof req.body['pinned'] === 'undefined') return response.errorBadRequest(res)
      getHistory(req.user.id, function (err, history) {
        if (err) return response.errorInternalError(res)
        if (!history) return response.errorNotFound(res)
        if (!history[noteId]) return response.errorNotFound(res)
        if (req.body.pinned === 'true' || req.body.pinned === 'false') {
          history[noteId].pinned = (req.body.pinned === 'true')
          setHistory(req.user.id, history, function (err, count) {
            if (err) return response.errorInternalError(res)
            res.end()
          })
        } else {
          return response.errorBadRequest(res)
        }
      })
    }
  } else {
    return response.errorForbidden(res)
  }
}

function historyDelete (req, res) {
  if (req.isAuthenticated()) {
    var noteId = req.params.noteId
    if (!noteId) {
      setHistory(req.user.id, [], function (err, count) {
        if (err) return response.errorInternalError(res)
        res.end()
      })
    } else {
      getHistory(req.user.id, function (err, history) {
        if (err) return response.errorInternalError(res)
        if (!history) return response.errorNotFound(res)
        delete history[noteId]
        setHistory(req.user.id, history, function (err, count) {
          if (err) return response.errorInternalError(res)
          res.end()
        })
      })
    }
  } else {
    return response.errorForbidden(res)
  }
}

// public
exports.historyGet = historyGet
exports.historyPost = historyPost
exports.historyDelete = historyDelete
exports.updateHistory = updateHistory
exports.tagCount = tagCount
