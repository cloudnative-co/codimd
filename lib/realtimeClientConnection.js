'use strict'

const get = require('lodash/get')

const config = require('./config')
const models = require('./models')
const logger = require('./logger')
const moment = require('moment')
const audit = require('./audit')
const fs = require('fs')
const {Readable} = require('stream')
const ss = require('socket.io-stream')

class RealtimeClientConnection {
  constructor (socket) {
    this.socket = socket
    this.realtime = require('./realtime')
  }

  registerEventHandler () {
    // received client refresh request
    this.socket.on('refresh', this.refreshEventHandler.bind(this))
    // received user status
    this.socket.on('user status', this.userStatusEventHandler.bind(this))
    // when a new client disconnect
    this.socket.on('disconnect', this.disconnectEventHandler.bind(this))
    // received cursor focus
    this.socket.on('cursor focus', this.cursorFocusEventHandler.bind(this))
    // received cursor activity
    this.socket.on('cursor activity', this.cursorActivityEventHandler.bind(this))
    // received cursor blur
    this.socket.on('cursor blur', this.cursorBlurEventHandler.bind(this))
    // check version
    this.socket.on('version', this.checkVersionEventHandler.bind(this))
    // received sync of online users request
    this.socket.on('online users', this.onlineUsersEventHandler.bind(this))
    // reveiced when user logout or changed
    this.socket.on('user changed', this.userChangedEventHandler.bind(this))
    // delete a note
    this.socket.on('delete', this.deleteNoteEventHandler.bind(this))
    // received note permission change request
    this.socket.on('permission', this.permissionChangeEventHandler.bind(this))

    this.socket.on('revision', this.revisionEventHandler.bind(this))
    ss(this.socket).on('download', this.downloadEventHandler.bind(this))
  }

  isUserLoggedIn () {
    return this.socket.request.user && this.socket.request.user.logged_in
  }

  isNoteAndUserExists () {
    const note = this.realtime.getNoteFromNotePool(this.socket.noteId)
    const user = this.realtime.getUserFromUserPool(this.socket.id)
    return note && user
  }

  isNoteOwner () {
    const note = this.getCurrentNote()
    return get(note, 'owner') === this.getCurrentLoggedInUserId()
  }

  isAnonymousEnable () {
    // TODO: move this method to config module
    return config.allowAnonymous || config.allowAnonymousEdits
  }

  getAvailablePermissions () {
    // TODO: move this method to config module
    const availablePermission = Object.assign({}, config.permission)
    if (!config.allowAnonymous && !config.allowAnonymousViews) {
      delete availablePermission.freely
      delete availablePermission.editable
      delete availablePermission.locked
    } else if (!config.allowAnonymous && !config.allowAnonymousEdits) {
      delete availablePermission.freely
    }
    return availablePermission
  }

  getCurrentUser () {
    if (!this.socket.id) return
    return this.realtime.getUserFromUserPool(this.socket.id)
  }

  getCurrentLoggedInUserId () {
    return get(this.socket, 'request.user.id')
  }

  getCurrentNote () {
    if (!this.socket.noteId) return
    return this.realtime.getNoteFromNotePool(this.socket.noteId)
  }

  getNoteChannel () {
    return this.socket.broadcast.to(this.socket.noteId)
  }

  async destroyNote (id) {
    return models.Note.destroy({
      where: { id: id }
    })
  }

  async changeNotePermission (newPermission) {
    const [changedRows] = await models.Note.update({
      permission: newPermission
    }, {
      where: {
        id: this.getCurrentNote().id
      }
    })
    if (changedRows !== 1) {
      throw new Error(`updated permission failed, cannot set permission ${newPermission} to note ${this.getCurrentNote().id}`)
    }
  }

  notifyPermissionChanged () {
    this.realtime.io.to(this.getCurrentNote().id).emit('permission', {
      permission: this.getCurrentNote().permission
    })
    this.getCurrentNote().socks.forEach((sock) => {
      if (sock) {
        if (!this.realtime.checkViewPermission(sock.request, this.getCurrentNote())) {
          sock.emit('info', {
            code: 403
          })
          setTimeout(function () {
            sock.disconnect(true)
          }, 0)
        }
      }
    })
  }

  refreshEventHandler () {
    const user = this.getCurrentUser()
    const note = this.getCurrentNote()
    this.realtime.emitRefresh(this.socket)
  }

  revisionEventHandler (revision) {
    const user = this.getCurrentUser()
    const note = this.realtime.getNoteFromNotePool(this.socket.noteId)
    const self = this
    var time = moment(parseInt(revision))
    models.Revision.getPatchedNoteRevisionByTime(note, time, function (err, content) {
        if (err) {
           return logger.error(err)
        }
        if (!content) {
           return logger.error(err)
        }
        self.realtime.updateNote(note, function (err, _note){
            if (err) {
                return logger.error(err)
            }
            audit.info(_note, user, "CHANGE_NOTE_REVISION",{ 'revision': revision })
            self.socket.emit("revision", content.content)
        })
    })
  }

  downloadEventHandler (stream, revision, callback) {
        const user = this.getCurrentUser()
        const note = this.realtime.getNoteFromNotePool(this.socket.noteId)
        const self = this;
        var filename = "untilted"
        var error = null
        if (revision){
        } else {
            filename = note.alias || note.title
        }
        audit.info(_note, user, "DOWNLOAD_NOTE_MARKDOWN", {"filename": filename})
        callback(error, {
            name : filename + ".md",
            size : 500
        });
        const r_stream = new Readable();
        r_stream.pipe(stream)
        r_stream._read = () => {};
        r_stream.push(note.server.document);
        r_stream.push(null);
  }

  checkVersionEventHandler () {
    this.socket.emit('version', {
      version: config.fullversion,
      minimumCompatibleVersion: config.minimumCompatibleVersion
    })
  }

  userStatusEventHandler (data) {
    if (!this.isNoteAndUserExists()) return
    const user = this.getCurrentUser()
    if (config.debug) {
      logger.info('SERVER received [' + this.socket.noteId + '] user status from [' + this.socket.id + ']: ' + JSON.stringify(data))
    }
    if (data) {
      user.idle = data.idle
      user.type = data.type
    }
    this.realtime.emitUserStatus(this.socket)
  }

  userChangedEventHandler () {
    const note = this.getCurrentNote()
    if (!note) return
    const user = note.users[this.socket.id]
    if (!user) return

    this.realtime.updateUserData(this.socket, user)
    this.realtime.emitOnlineUsers(this.socket)
  }

  onlineUsersEventHandler () {
    if (!this.isNoteAndUserExists()) return

    const currentNote = this.getCurrentNote()
    const currentNoteOnlineUserList = Object.keys(currentNote.users)
      .map(key => this.realtime.buildUserOutData(currentNote.users[key]))

    this.socket.emit('online users', {
      users: currentNoteOnlineUserList
    })
  }

  cursorFocusEventHandler (data) {
    if (!this.isNoteAndUserExists()) return
    const user = this.getCurrentUser()
    user.cursor = data
    const out = this.realtime.buildUserOutData(user)
    this.getNoteChannel().emit('cursor focus', out)
  }

  cursorActivityEventHandler (data) {
    if (!this.isNoteAndUserExists()) return
    const user = this.getCurrentUser()
    user.cursor = data
    const out = this.realtime.buildUserOutData(user)
    this.getNoteChannel().emit('cursor activity', out)
  }

  cursorBlurEventHandler () {
    if (!this.isNoteAndUserExists()) return
    const user = this.getCurrentUser()
    user.cursor = null
    this.getNoteChannel().emit('cursor blur', {
      id: this.socket.id
    })
  }

  deleteNoteEventHandler () {
    // need login to do more actions
    if (this.isUserLoggedIn() && this.isNoteAndUserExists()) {
      const note = this.getCurrentNote()
      const user = this.getCurrentUser()
      audit.info(note, user, "DELETE_NOTE", null)
      // Only owner can delete note
      if (note.owner && note.owner === this.getCurrentLoggedInUserId()) {
        this.destroyNote(note.id)
          .then((successRows) => {
            if (!successRows) return
            this.realtime.disconnectSocketOnNote(note)
          })
          .catch(function (err) {
            return logger.error('delete note failed: ' + err)
          })
      }
    }
  }

  permissionChangeEventHandler (permission) {
    if (!this.isUserLoggedIn()) return
    if (!this.isNoteAndUserExists()) return

    const note = this.getCurrentNote()
    const user = this.getCurrentUser()
    // Only owner can change permission
    if (!this.isNoteOwner()) return
    if (!(permission in this.getAvailablePermissions())) return

    this.changeNotePermission(permission)
      .then(() => {
        audit.info(
            note, user, "CHANGE_NOTE_PERMISSION",
            {
                'permission': {
                    'from': note.permission,
                    'to': permission
                }
            }
        )
        note.permission = permission
        this.notifyPermissionChanged()
      })
      .catch(err => logger.error('update note permission failed: ' + err))
  }

  disconnectEventHandler () {
    const user = this.getCurrentUser()
    const note = this.getCurrentNote()
    audit.info(note, user, "DISCONNECTION_NOTE", { 'socket': { 'id': this.socket.id }})

    if (this.realtime.disconnectProcessQueue.checkTaskIsInQueue(this.socket.id)) {
      return
    }
    this.realtime.queueForDisconnect(this.socket)
  }
}

exports.RealtimeClientConnection = RealtimeClientConnection
